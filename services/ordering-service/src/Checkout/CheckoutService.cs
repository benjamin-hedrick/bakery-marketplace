using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.Options;
using OrderingService.Domain;
using OrderingService.Outbox;
using OrderingService.Persistence;

namespace OrderingService.Checkout;

/// <summary>
/// Checkout (WI-ORD-001, first-slice contract). In order: validate the request, recognise a repeat (idempotency), read and price every
/// item from the catalog, check the pickup window, reserve stock (<c>CAT-006</c>), authorize payment (a stub), then store the order as
/// <c>Placed</c>. If anything after the reservation fails, the reservation is released, so no stock is held for an order that was not created.
/// <para>
/// Idempotency (D-6): the order id is derived from <c>(customerId, key)</c>, so the create-only write in the store decides a race, the
/// catalog reservation (keyed by the same id) is repeatable, and a retry returns the original order. A hash of the request is stored with
/// the order; the same key with a different request is refused.
/// </para>
/// Events (<c>ORD-005</c>): <c>OrderPlaced</c> is stored with the order and then published straight away; if that fails or is slow the
/// outbox relay publishes it. Not here yet: a real payment (<c>PAY-001</c>).
/// </summary>
public sealed partial class CheckoutService(
    ICatalogGateway catalog,
    OrderStore orders,
    IPaymentProcessor payments,
    PickupSchedule schedule,
    PaymentMethodStore paymentMethods,
    OrderEventPublisher eventPublisher,
    AllergenRegistry allergenRegistry,
    IOptions<CheckoutOptions> checkoutOptions,
    TimeProvider time,
    ILogger<CheckoutService> logger)
{
    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$")]
    private static partial Regex KeyPattern();

    /// <summary>The deterministic order id for a customer's checkout attempt. Hashed, so the key itself is never in an id or a log.</summary>
    public static string OrderIdFor(string customerId, string idempotencyKey) =>
        "order-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{customerId}\n{idempotencyKey}")))[..32].ToLowerInvariant();

    public async Task<CheckoutResult> CheckoutAsync(
        string customerId, string? idempotencyKey, CheckoutRequest? request, CancellationToken ct = default)
    {
        var shape = ValidateShape(idempotencyKey, request, allergenRegistry.MaxRequestIds);
        if (shape.Count > 0) return CheckoutResult.Invalid(shape);

        ArgumentNullException.ThrowIfNull(request); // ValidateShape has refused a missing request above; this states it for the compiler
        var vendorId = request.VendorId!;
        var orderId = OrderIdFor(customerId, idempotencyKey!);
        var fingerprint = Fingerprint(request);

        // A repeat of a checkout that already finished: answer with the original order and touch nothing else.
        var existing = await orders.GetAsync(orderId, customerId, ct);
        if (existing is not null) return Repeat(existing, fingerprint);

        // ---- allergens the customer chose to tell the bakery about (WI-ORD-009): checked against the catalog's registry, not the profile ----
        IReadOnlyList<string> allergens = [];
        if (request.Allergens is { Count: > 0 } named)
        {
            IReadOnlySet<string> offered;
            try
            {
                offered = await allergenRegistry.IdsAsync(ct);
            }
            catch (DownstreamUnavailableException)
            {
                return Unavailable();
            }
            var allergenProblems = ValidateAllergens(named, offered);
            if (allergenProblems.Count > 0) return CheckoutResult.Invalid(allergenProblems);
            allergens = named.Distinct(StringComparer.Ordinal).OrderBy(a => a, StringComparer.Ordinal).ToList();
        }

        // ---- the saved payment method (WI-ORD-010): only from the caller's own partition, so a missing id, an unknown id and someone else's id all
        // get the same answer and the endpoint is no oracle for other customers' method ids ----
        var method = await paymentMethods.GetAsync(request.PaymentMethodId!, customerId, ct);
        if (method is null)
            return CheckoutResult.Invalid([new CheckoutProblem("validation_failed", "paymentMethodId", "Choose one of your saved payment methods.")]);

        // ---- read and price ----
        var listings = new Dictionary<string, CatalogListing?>(StringComparer.Ordinal);
        try
        {
            foreach (var id in request.LineItems!.Select(l => l.ListingId!).Distinct(StringComparer.Ordinal))
                listings[id] = await catalog.GetListingAsync(id, ct);
        }
        catch (DownstreamUnavailableException)
        {
            return Unavailable();
        }

        var (lines, problems) = CheckoutPricing.Price(vendorId, request.LineItems!, listings);
        if (problems.Count > 0)
        {
            var unavailable = problems.Any(p => p.Code == "listing_unavailable");
            return new CheckoutResult(
                unavailable ? CheckoutOutcome.Conflict : CheckoutOutcome.Invalid,
                Code: problems[0].Code, Message: "The order cannot be placed as requested.", Problems: problems);
        }

        // ---- pickup window (D-8: checked here as well as when the windows were offered) ----
        var now = time.GetUtcNow();
        var window = request.PickupWindow is { Start: { } start, End: { } end } ? new PickupWindow(start.ToUniversalTime(), end.ToUniversalTime()) : null;
        if (window is not null && !schedule.IsSelectable(window.Start, window.End, now))
        {
            return new CheckoutResult(CheckoutOutcome.Conflict, Code: "pickup_window_unavailable", Message: "That pickup time is no longer available. Choose another.");
        }

        // ---- the payment token must be well formed before anything is reserved or any processor is called (business rule, not the stub's) ----
        if (!PaymentTokenValidator.Validate(method.Token).Valid)
        {
            LogPaymentMethodRefused(logger, orderId, method.Id);
            return new CheckoutResult(CheckoutOutcome.PaymentDeclined, Code: "payment_declined", Message: "The payment was declined.");
        }

        // ---- build the order (the aggregate enforces the lifecycle and the D-5 limits) ----
        var order = Order.Create(orderId, customerId, vendorId, FulfillmentType.Pickup, now);
        foreach (var line in lines) order.AddLine(line, now);
        if (allergens.Count > 0) order.SetAllergens(allergens, now);
        if (window is not null) order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(window.Start, window.End), now);
        order.Place(now);
        if (checkoutOptions.Value.AutoConfirm && AutoConfirmPolicy.Qualifies(order)) order.Confirm(now, automatic: true); // WI-ORD-008

        // ---- reserve stock, pay (stub), store ----
        var reserved = false;
        try
        {
            StockReservationOutcome outcome;
            try
            {
                outcome = await catalog.ReserveAsync(orderId, vendorId, order.Lines.Select(l => (l.ListingId, l.Quantity)).ToList(), ct);
            }
            catch (DownstreamUnavailableException)
            {
                // The catalog may have reserved before its answer was lost. Releasing is safe either way (an unknown reservation is fine).
                await ReleaseQuietlyAsync(orderId, vendorId);
                return Unavailable();
            }
            if (!outcome.Reserved) return StockRejected(outcome);
            reserved = true;

            var payment = await payments.AuthorizeAsync(
                new PaymentRequest(orderId, customerId, order.TotalCents, order.Currency, method.Token), ct);
            if (!payment.Approved)
            {
                await ReleaseQuietlyAsync(orderId, vendorId);
                reserved = false;
                return new CheckoutResult(CheckoutOutcome.PaymentDeclined, Code: "payment_declined", Message: "The payment was declined.");
            }

            var created = await orders.TryCreateAsync(order, idempotencyKey!, fingerprint, method.Id, payment.Reference, ct);
            if (created is not null)
            {
                reserved = false; // the order now owns the reservation
                LogOrderPlacedLineSCents(logger, orderId, order.Lines.Count, order.TotalCents);
                await eventPublisher.PublishInlineAsync(created);
                return new CheckoutResult(CheckoutOutcome.Created, created);
            }

            // Someone else created this exact order between our check and our write (a double submit). Their reservation is the same
            // reservation, so it is not released; answer with what is stored.
            reserved = false;
            var winner = await orders.GetAsync(orderId, customerId, ct);
            return winner is null ? Unavailable() : Repeat(winner, fingerprint);
        }
        catch (Exception) when (reserved)
        {
            await ReleaseQuietlyAsync(orderId, vendorId);
            throw;
        }
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------

    private static CheckoutResult Repeat(StoredOrder stored, string fingerprint) =>
        stored.Document.RequestFingerprint == fingerprint
            ? new CheckoutResult(CheckoutOutcome.Existing, stored)
            : new CheckoutResult(CheckoutOutcome.KeyReuse, Code: "idempotency_key_reuse",
                Message: "That idempotency key was already used for a different checkout.");

    private static CheckoutResult Unavailable() =>
        new(CheckoutOutcome.Unavailable, Code: "downstream_unavailable", Message: "The order could not be placed right now. Please try again.");

    private static CheckoutResult StockRejected(StockReservationOutcome outcome)
    {
        var rejections = outcome.Rejections ?? [];
        if (outcome.Code == "reservation_rejected" && rejections.Count > 0)
        {
            if (rejections.Any(r => r.Reason is "listing_not_found" or "not_available"))
                return new CheckoutResult(CheckoutOutcome.Conflict, Code: "listing_unavailable", Message: "An item is no longer available.", StockRejections: rejections);
            if (rejections.Any(r => r.Reason == "insufficient_stock"))
                return new CheckoutResult(CheckoutOutcome.Conflict, Code: "insufficient_stock", Message: "There is not enough stock for part of this order.", StockRejections: rejections);
            return new CheckoutResult(CheckoutOutcome.Invalid, Code: "invalid_quantity", Message: "A quantity is above the limit for an item.", StockRejections: rejections);
        }
        return new CheckoutResult(CheckoutOutcome.Conflict, Code: "conflict", Message: "The stock changed while placing the order. Please try again.");
    }

    private async Task ReleaseQuietlyAsync(string orderId, string vendorId)
    {
        try
        {
            await catalog.ReleaseAsync(orderId, vendorId, CancellationToken.None);
        }
        catch (Exception e)
        {
            // Open item 62: a reservation without an order needs a cleanup. Nothing here can do more than record it.
            LogStockReservationForCouldNotBe(logger, e, orderId);
        }
    }

    private static List<CheckoutProblem> ValidateShape(string? idempotencyKey, CheckoutRequest? request, int maxAllergenIds)
    {
        var problems = new List<CheckoutProblem>();
        if (idempotencyKey is null || !KeyPattern().IsMatch(idempotencyKey))
            problems.Add(new CheckoutProblem("validation_failed", "Idempotency-Key", "An Idempotency-Key of 8 to 100 letters, digits and . _ : - is required."));
        if (request is null)
        {
            problems.Add(new CheckoutProblem("validation_failed", "body", "A body is required."));
            return problems;
        }

        if (string.IsNullOrWhiteSpace(request.PaymentMethodId) || request.PaymentMethodId.Length > 100)
            problems.Add(new CheckoutProblem("validation_failed", "paymentMethodId", "Choose one of your saved payment methods."));

        if (string.IsNullOrWhiteSpace(request.VendorId) || request.VendorId.Length > 100)
            problems.Add(new CheckoutProblem("validation_failed", "vendorId", "A vendor id is required."));

        if (request.LineItems is null || request.LineItems.Count == 0)
            problems.Add(new CheckoutProblem("validation_failed", "lineItems", "At least one item is required."));
        else if (request.LineItems.Count > OrderRules.MaxLines)
            problems.Add(new CheckoutProblem("invalid_quantity", "lineItems", $"At most {OrderRules.MaxLines} items per order."));
        else
        {
            for (var i = 0; i < request.LineItems.Count; i++)
            {
                var line = request.LineItems[i];
                var field = $"lineItems[{i}]";
                if (line is null || string.IsNullOrWhiteSpace(line.ListingId) || line.ListingId.Length > 100)
                    problems.Add(new CheckoutProblem("validation_failed", $"{field}.listingId", "A listing id is required."));
                if (line?.Quantity is null or < 1 or > OrderRules.MaxQuantityPerLine)
                    problems.Add(new CheckoutProblem("invalid_quantity", $"{field}.quantity", $"Quantity must be between 1 and {OrderRules.MaxQuantityPerLine}."));
                var modifiers = line?.ModifierIds ?? [];
                if (modifiers.Any(m => string.IsNullOrWhiteSpace(m) || m.Length > 100) || modifiers.Distinct(StringComparer.Ordinal).Count() != modifiers.Count)
                    problems.Add(new CheckoutProblem("invalid_modifier", $"{field}.modifierIds", "Each option can be chosen once, and none can be empty."));
            }
        }

        // The list is only a size-checked set of ids here; which ids are real is decided against the registry (ValidateAllergens).
        if (request.Allergens is { } named && (named.Count > maxAllergenIds || named.Any(a => string.IsNullOrWhiteSpace(a) || a.Length > 64)))
            problems.Add(new CheckoutProblem("validation_failed", "allergens", "Allergens must be allergen ids from the list the bakery offers."));

        if (request.PickupWindow is { } w)
        {
            if (w.Start is null || w.End is null)
                problems.Add(new CheckoutProblem("validation_failed", "pickupWindow", "A pickup window needs a start and an end."));
            else if (w.End <= w.Start)
                problems.Add(new CheckoutProblem("validation_failed", "pickupWindow", "The pickup window must end after it starts."));
        }
        return problems;
    }

    /// <summary>Every id must be an allergen the registry offers now; naming more than the registry holds is refused. Duplicates are fine (they are removed).</summary>
    private static List<CheckoutProblem> ValidateAllergens(List<string> named, IReadOnlySet<string> offered)
    {
        var problems = new List<CheckoutProblem>();
        if (named.Count > offered.Count)
            problems.Add(new CheckoutProblem("validation_failed", "allergens", "More allergens were named than the bakery offers."));
        for (var i = 0; i < named.Count; i++)
        {
            if (!offered.Contains(named[i]))
                problems.Add(new CheckoutProblem("validation_failed", $"allergens[{i}]", "That is not an allergen the bakery offers."));
        }
        return problems;
    }

    /// <summary>A hash of what the customer asked for, so the same key with different content is recognised. Option order does not matter.</summary>
    private static string Fingerprint(CheckoutRequest r)
    {
        var window = r.PickupWindow is { Start: { } s, End: { } e }
            ? $"{s.UtcDateTime:O}/{e.UtcDateTime:O}"
            : "-";
        var lines = string.Join(";", r.LineItems!.Select(l =>
            $"{l.ListingId}:{l.Quantity}:{string.Join(",", (l.ModifierIds ?? []).OrderBy(m => m, StringComparer.Ordinal))}"));
        // Allergens join the hash only when there are some, so a checkout without them keeps the fingerprint it always had (a repeat of an older order still matches).
        var allergens = r.Allergens is { Count: > 0 } a
            ? "|a:" + string.Join(",", a.Distinct(StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal))
            : "";
        // The payment method id joins the hash (WI-ORD-010): the same key with another method is a different checkout.
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"v1|{r.VendorId}|{window}|{lines}{allergens}|p:{r.PaymentMethodId}"))).ToLowerInvariant();
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Order {OrderId} placed: {Lines} line(s), {TotalCents} cents")]
    private static partial void LogOrderPlacedLineSCents(ILogger logger, string orderId, int lines, long totalCents);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Order {OrderId} refused: the payment token of method {PaymentMethodId} failed validation")]
    private static partial void LogPaymentMethodRefused(ILogger logger, string orderId, string paymentMethodId);

    [LoggerMessage(Level = LogLevel.Error, Message = "Stock reservation for {OrderId} could not be released; it needs cleanup")]
    private static partial void LogStockReservationForCouldNotBe(ILogger logger, Exception exception, string orderId);
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Tags;

namespace CatalogService.Services;

public enum ListingOutcome { Ok, Created, Repeated, NotFound, Invalid, VendorNotVerified, Conflict, MadeToOrder, InsufficientStock, VersionMismatch, KeyReuse }

public sealed record ListingResult(ListingOutcome Outcome, ListingDocument? Listing = null, Dictionary<string, string[]>? Errors = null);

/// <summary>
/// Catalog listing rules (WI-CAT-001). Rules that live here, not in the API layer or the BFF:
/// <list type="bullet">
/// <item>A listing can reach <c>Published</c> only if its vendor is currently <c>Verified</c> — derived from events, never client input.</item>
/// <item>Public reads show only <c>Published</c> listings of currently <c>Verified</c> vendors. A suspension hides listings at read time;
/// it does not rewrite them, and a later <c>VendorVerified</c> restores visibility.</item>
/// <item>The owner is always the caller's subject; writes are partitioned by it, so a vendor cannot even address another vendor's listing.</item>
/// <item>Stock (ADR-0017): a listing with no <c>availableQuantity</c> is made to order. Edits and adjustments are saved conditionally on the
/// version they read, and re-read and retried when someone else changed the listing first, so an edit and an order cannot overwrite each other.</item>
/// </list>
/// </summary>
public sealed class ListingService
{
    private readonly IRepository<ListingDocument> _listings;
    private readonly VendorStatusStore _vendors;
    private readonly ListingEventPublisher _events;
    private readonly TimeProvider _time;
    private readonly ILogger<ListingService> _logger;
    private readonly ITagRegistry _tags;
    private readonly TagOptions _tagLimits;
    private readonly ListingCache _cache;

    /// <summary>Re-reads and retries a conditional save this many times before reporting a conflict.</summary>
    public const int MaxSaveAttempts = 20;

    public ListingService(
        IRepository<ListingDocument> listings,
        VendorStatusStore vendors,
        ListingEventPublisher events,
        TimeProvider time,
        ILogger<ListingService> logger,
        ITagRegistry tags,
        TagOptions tagLimits,
        ListingCache cache)
    {
        _cache = cache;
        _listings = listings;
        _vendors = vendors;
        _events = events;
        _time = time;
        _logger = logger;
        _tags = tags;
        _tagLimits = tagLimits;
    }

    // ---- public reads (anonymous) -------------------------------------------------------------

    /// <summary>
    /// Published listings of verified vendors, ordered by id. <paramref name="after"/> is the id of the last item of the
    /// previous page. The repository contract is single-partition, so this reads one partition per verified vendor, through the listing cache
    /// (<see cref="ListingCache"/>, WI-CAT-003; a zero TTL makes it a pass-through);
    /// fine at first-slice scale, to be revisited if the vendor count grows. <paramref name="include"/>, when given, narrows the listings
    /// <b>before</b> paging, so a filtered page is still full and the cursor still means "after this id" (the personalized browse uses it to
    /// hide conflicting items).
    /// </summary>
    public async Task<(IReadOnlyList<ListingDocument> Items, string? NextCursor)> BrowseAsync(
        int limit, string? after, Func<ListingDocument, bool>? include = null, CancellationToken ct = default)
    {
        var all = new List<ListingDocument>();
        foreach (var vendorId in await VerifiedVendorIdsAsync(ct))
            all.AddRange(await PublishedListingsAsync(vendorId, ct));

        var ordered = all.Where(l => include is null || include(l)).OrderBy(l => l.Id, StringComparer.Ordinal)
            .Where(l => after is null || string.CompareOrdinal(l.Id, after) > 0)
            .Take(limit + 1)
            .ToList();

        var hasMore = ordered.Count > limit;
        var page = ordered.Take(limit).ToList();
        return (page, hasMore ? page[^1].Id : null);
    }

    /// <summary>
    /// A listing id alone does not identify its Cosmos partition (the vendor), so the lookup probes each verified
    /// vendor's partition. Known limitation of id-only addressing; see the first-slice contract's gap list.
    /// </summary>
    public async Task<ListingDocument?> GetPublicAsync(string id, CancellationToken ct = default)
    {
        foreach (var vendorId in await VerifiedVendorIdsAsync(ct))
        {
            var found = (await PublishedListingsAsync(vendorId, ct)).FirstOrDefault(l => l.Id == id);
            if (found is not null) return found;
        }
        return null;
    }

    // The two reads every public listing read starts from, through the cache (WI-CAT-003; ListingCache:TtlSeconds 0 makes it a pass-through).
    // What comes back may be shared with other requests: read only.
    private Task<IReadOnlyList<string>> VerifiedVendorIdsAsync(CancellationToken ct) =>
        _cache.VerifiedVendorIdsAsync(t => _vendors.VerifiedVendorIdsAsync(t), ct);

    private Task<IReadOnlyList<ListingDocument>> PublishedListingsAsync(string vendorId, CancellationToken ct) =>
        _cache.PublishedListingsAsync(vendorId, t => LoadPublishedAsync(vendorId, t), ct);

    private async Task<IReadOnlyList<ListingDocument>> LoadPublishedAsync(string vendorId, CancellationToken ct)
    {
        var published = new List<ListingDocument>();
        await foreach (var l in _listings.QueryAsync(vendorId, q => q.Where(x => x.DocType == ListingDocument.Kind && x.Status == ListingStatuses.Published), ct))
            published.Add(l);
        return published;
    }

    private Task InvalidateAsync(string vendorId) => _cache.InvalidateVendorAsync(vendorId);

    // ---- vendor writes ------------------------------------------------------------------------

    /// <summary>
    /// The caller's own listing, or null. Looks only in the caller's partition. The partition also holds the vendor's stock reservation
    /// records, so a document that is not a listing (another docType, or no valid status) is treated as missing.
    /// </summary>
    public async Task<ListingDocument?> GetOwnAsync(string id, string vendorId, CancellationToken ct = default)
    {
        var doc = await _listings.GetAsync(id, vendorId, ct);
        return ListingDocument.IsListing(doc) && ListingStatuses.IsValid(doc.Status) ? doc : null;
    }

    /// <summary>
    /// The caller's own listings, drafts included, ordered by id; <paramref name="after"/> is the id of the last item of the previous page.
    /// One partition, so it costs in proportion to the vendor's own listings (register item 63). <paramref name="status"/> narrows to one status.
    /// </summary>
    public async Task<(IReadOnlyList<ListingDocument> Items, string? NextCursor)> ListOwnAsync(
        string vendorId, string? status, int limit, string? after, CancellationToken ct = default)
    {
        var all = new List<ListingDocument>();
        await foreach (var l in _listings.QueryAsync(
                           vendorId, q => q.Where(x => x.DocType == ListingDocument.Kind && (x.Status == ListingStatuses.Draft || x.Status == ListingStatuses.Published)), ct))
        {
            if (status is null || l.Status == status) all.Add(l);
        }

        var ordered = all.OrderBy(l => l.Id, StringComparer.Ordinal)
            .Where(l => after is null || string.CompareOrdinal(l.Id, after) > 0)
            .Take(limit + 1)
            .ToList();
        var page = ordered.Take(limit).ToList();
        return (page, ordered.Count > limit ? page[^1].Id : null);
    }

    /// <summary>
    /// The listing id a create with <paramref name="idempotencyKey"/> gets (WI-CAT-007 requirement 5, as checkout derives its order id, decision D-6): a
    /// hash of the vendor and the key, so the key itself is never in an id or a log, and two vendors' keys never meet.
    /// </summary>
    public static string ListingIdFor(string vendorId, string idempotencyKey) =>
        "listing-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{vendorId}\n{idempotencyKey}")))[..32].ToLowerInvariant();

    /// <summary>
    /// A create (WI-CAT-001, made idempotent by WI-CAT-007): the id comes from the vendor and the key, and the write is create-only, so a repeat or a
    /// race of the same create makes one listing. A repeat with the same request answers <see cref="ListingOutcome.Repeated"/> with the listing as it
    /// is now; the same key with another request is <see cref="ListingOutcome.KeyReuse"/>. The key is checked first, and a stored listing answers
    /// before the request is checked again, so a repeat gets the listing even if a rule (a retired tag) changed in between.
    /// </summary>
    public async Task<ListingResult> CreateAsync(string vendorId, string? idempotencyKey, ListingRequest request, CancellationToken ct = default)
    {
        var keyErrors = ListingValidator.ValidateIdempotencyKey(idempotencyKey);
        if (keyErrors.Count > 0) return new ListingResult(ListingOutcome.Invalid, Errors: Merge(Validate(request, currentlyCounted: null), keyErrors));

        var id = ListingIdFor(vendorId, idempotencyKey!);
        var fingerprint = Fingerprint(request);
        if (await GetOwnAsync(id, vendorId, ct) is { } stored) return Repeat(stored, fingerprint);

        var errors = Validate(request, currentlyCounted: null);
        if (errors.Count > 0) return new ListingResult(ListingOutcome.Invalid, Errors: errors);

        var status = request.Status ?? ListingStatuses.Draft;
        if (status == ListingStatuses.Published && !await _vendors.IsVerifiedAsync(vendorId, ct))
            return new ListingResult(ListingOutcome.VendorNotVerified);

        var now = _time.GetUtcNow();
        var doc = new ListingDocument
        {
            Id = id,
            VendorId = vendorId,
            CreatedAt = now,
            Status = status,
            RequestFingerprint = fingerprint,
        };
        Apply(doc, request, now);
        if (doc.Status == ListingStatuses.Published) _events.Raise(doc, ListingEventTypes.Published); // stored with the listing (register item 30)

        // Create-only (no ETag): when a racing create with the same key won, this one stores nothing and answers as its repeat.
        var saved = await _listings.SaveIfUnchangedAsync(doc, vendorId, ct);
        if (saved is null)
        {
            return await GetOwnAsync(id, vendorId, ct) is { } winner
                ? Repeat(winner, fingerprint)
                : new ListingResult(ListingOutcome.Conflict); // the id is held by something that is not a listing: never expected
        }
        await InvalidateAsync(vendorId);

        await _events.PublishInlineAsync(saved);
        return new ListingResult(ListingOutcome.Created, saved);
    }

    private static ListingResult Repeat(ListingDocument stored, string fingerprint) =>
        stored.RequestFingerprint == fingerprint
            ? new ListingResult(ListingOutcome.Repeated, stored)
            : new ListingResult(ListingOutcome.KeyReuse);

    /// <summary>A hash of what the vendor asked to create, so the same key with other content is recognised. Versioned so its shape can change.</summary>
    private static string Fingerprint(ListingRequest request) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("v1|" + JsonSerializer.Serialize(request)))).ToLowerInvariant();

    private Dictionary<string, string[]> Validate(ListingRequest request, bool? currentlyCounted) => Merge(
        ListingValidator.Validate(request, statusRequired: false, _tags.VendorAllergenIds, _tags, _tagLimits),
        ListingValidator.ValidateStockChange(request.Stock, currentlyCounted));

    /// <summary>
    /// An edit (WI-CAT-007): applied only while the listing's edit version is still <paramref name="expectedEditVersion"/>, the one the vendor's
    /// form was read at; otherwise <see cref="ListingOutcome.VersionMismatch"/> with the stored listing, and nothing written. The check runs again
    /// on the fresh copy after a store conflict, so a reservation or an adjustment in between (they change only the quantity and never the edit
    /// version) lets the edit through, and another edit does not.
    /// </summary>
    public async Task<ListingResult> UpdateAsync(
        ListingDocument existing, long expectedEditVersion, ListingRequest request, CancellationToken ct = default)
    {
        // Whether the listing keeps a count changes only by an edit, which moves the edit version on, so checking the stock settings against the
        // copy read here holds for every retry below: a later copy with another mode fails the version check first.
        var errors = Validate(request, currentlyCounted: existing.AvailableQuantity is not null);
        if (errors.Count > 0) return new ListingResult(ListingOutcome.Invalid, Errors: errors);

        for (var attempt = 0; attempt < MaxSaveAttempts; attempt++)
        {
            if (existing.EditVersion != expectedEditVersion) return new ListingResult(ListingOutcome.VersionMismatch, existing);

            var wasPublished = existing.Status == ListingStatuses.Published;
            var wasLowOrOut = StockPolicy.IsLowOrOut(existing);
            var newStatus = request.Status ?? existing.Status;

            // Only the Draft -> Published transition is gated: an already-published listing of a since-suspended vendor
            // can still be edited or unpublished, but not (re)published.
            if (newStatus == ListingStatuses.Published && !wasPublished
                && !await _vendors.IsVerifiedAsync(existing.VendorId, ct))
                return new ListingResult(ListingOutcome.VendorNotVerified);

            existing.Status = newStatus;
            Apply(existing, request, _time.GetUtcNow());
            existing.EditVersion++;
            if (!wasPublished && existing.Status == ListingStatuses.Published) _events.Raise(existing, ListingEventTypes.Published);
            if (!wasLowOrOut && StockPolicy.IsLowOrOut(existing)) _events.Raise(existing, ListingEventTypes.LowStockDetected);
            var saved = await _listings.SaveIfUnchangedAsync(existing, existing.VendorId, ct);
            if (saved is not null)
            {
                await InvalidateAsync(existing.VendorId); // any edit: price, name, tags, allergens, limits, threshold, published or not
                await _events.PublishInlineAsync(saved);
                return new ListingResult(ListingOutcome.Ok, saved);
            }

            // Someone (an order, an adjustment, another edit) changed the listing after it was read. The edit is a replacement of
            // the fields it names, so applying it again to the fresh copy is correct, and keeps stock the request did not mention;
            // another edit has moved the edit version on, which the check at the top of the loop refuses.
            var fresh = await _listings.GetAsync(existing.Id, existing.VendorId, ct);
            if (fresh is null) return new ListingResult(ListingOutcome.NotFound);
            existing = fresh;
        }
        return new ListingResult(ListingOutcome.Conflict);
    }

    /// <summary>
    /// Adds <paramref name="delta"/> (negative to remove) to a limited-stock listing's quantity, atomically against concurrent edits and
    /// orders. A made-to-order listing has no quantity to adjust; the result never goes below zero.
    /// </summary>
    public async Task<ListingResult> AdjustStockAsync(ListingDocument existing, int delta, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt < MaxSaveAttempts; attempt++)
        {
            if (existing.AvailableQuantity is not { } current) return new ListingResult(ListingOutcome.MadeToOrder);

            var next = (long)current + delta;
            if (next < 0) return new ListingResult(ListingOutcome.InsufficientStock);
            if (next > StockPolicy.MaxQuantity)
                return new ListingResult(ListingOutcome.Invalid, Errors: new Dictionary<string, string[]>
                {
                    ["delta"] = [$"The quantity cannot exceed {StockPolicy.MaxQuantity}."],
                });

            var wasLowOrOut = StockPolicy.IsLowOrOut(existing);
            var statusBefore = StockPolicy.StatusOf(existing);
            existing.AvailableQuantity = (int)next;
            existing.UpdatedAt = _time.GetUtcNow();
            existing.Version++;
            if (!wasLowOrOut && StockPolicy.IsLowOrOut(existing)) _events.Raise(existing, ListingEventTypes.LowStockDetected);
            var saved = await _listings.SaveIfUnchangedAsync(existing, existing.VendorId, ct);
            if (saved is not null)
            {
                // Only a change of status is visible to customers; the cached quantity may drift (see ListingCache).
                if (StockPolicy.StatusOf(saved) != statusBefore) await InvalidateAsync(existing.VendorId);
                await _events.PublishInlineAsync(saved);
                return new ListingResult(ListingOutcome.Ok, saved);
            }

            var fresh = await _listings.GetAsync(existing.Id, existing.VendorId, ct);
            if (fresh is null) return new ListingResult(ListingOutcome.NotFound);
            existing = fresh;
        }
        return new ListingResult(ListingOutcome.Conflict);
    }

    // ---- helpers ------------------------------------------------------------------------------

    private static List<string>? NonEmpty(List<string> tags) => tags.Count == 0 ? null : tags;

    private static Dictionary<string, string[]> Merge(Dictionary<string, string[]> into, Dictionary<string, string[]> more)
    {
        foreach (var (field, messages) in more)
            into[field] = into.TryGetValue(field, out var already) ? [.. already, .. messages] : messages;
        return into;
    }

    private static void Apply(ListingDocument doc, ListingRequest r, DateTimeOffset now)
    {
        doc.Name = r.Name!.Trim();
        doc.Description = string.IsNullOrWhiteSpace(r.Description) ? null : r.Description.Trim();
        doc.Category = r.Category!.Trim();
        doc.PriceCents = r.PriceCents!.Value;
        doc.AllergenFlags = ListingValidator.NormalizeFlags(r.AllergenFlags);
        // Tags: a request without a tags list leaves them as they were (a client that does not know about tags must not wipe them); an empty list clears
        // the vendor's own. The platform's tags are never touched by a request (ADR-0022 decision 5).
        if (r.Tags is not null) doc.Tags = NonEmpty(ListingValidator.NormalizeTags(r.Tags));
        var previous = doc.Modifiers.ToDictionary(m => m.Id, StringComparer.Ordinal);
        doc.Modifiers = (r.Modifiers ?? new()).Select(m =>
        {
            previous.TryGetValue(m.Id!, out var before);
            return new ModifierDocument
            {
                Id = m.Id!,
                Name = m.Name!.Trim(),
                PriceDeltaCents = m.PriceDeltaCents!.Value,
                Allergens = ListingValidator.NormalizeFlags(m.Allergens),
                Tags = m.Tags is null ? before?.Tags : NonEmpty(ListingValidator.NormalizeTags(m.Tags)),
                PlatformTags = before?.PlatformTags,
            };
        }).ToList();
        // Stock (WI-CAT-007, checked by ValidateStockChange first): made to order drops the quantity; a quantity is taken on a create or a switch to
        // counted; a counted listing that stays counted keeps the stored quantity, because only an adjustment may change it (ADR-0017).
        if (r.Stock is { } stock)
        {
            var counted = stock.Mode == StockModes.Counted || (stock.Mode is null && stock.AvailableQuantity is not null);
            if (!counted) doc.AvailableQuantity = null;
            else if (stock.AvailableQuantity is { } starting) doc.AvailableQuantity = starting;
            doc.MaxPerOrder = stock.MaxPerOrder;
            doc.LowStockThreshold = stock.LowStockThreshold;
        }
        doc.UpdatedAt = now;
        doc.Version++;
    }
}

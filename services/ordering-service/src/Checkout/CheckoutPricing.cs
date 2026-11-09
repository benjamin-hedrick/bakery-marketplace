using OrderingService.Domain;

namespace OrderingService.Checkout;

/// <summary>
/// Turns the customer's cart into priced order lines using what the catalog says now (first-slice contract section 4). Pure. The client never
/// supplies a price: <c>unit = listing price + sum of the chosen modifiers' price deltas</c>, integer cents (D-1), computed here and only here.
/// </summary>
public static class CheckoutPricing
{
    public static (IReadOnlyList<OrderLine> Lines, IReadOnlyList<CheckoutProblem> Problems) Price(
        string vendorId, IReadOnlyList<CheckoutLineRequest> requested, IReadOnlyDictionary<string, CatalogListing?> listings)
    {
        var lines = new List<OrderLine>();
        var problems = new List<CheckoutProblem>();

        for (var i = 0; i < requested.Count; i++)
        {
            var request = requested[i];
            var field = $"lineItems[{i}]";
            listings.TryGetValue(request.ListingId!, out var listing);

            // The catalog's public view only returns Published listings of verified vendors; a listing of another vendor cannot go in this order.
            if (listing is null || listing.VendorId != vendorId || listing.Status != "Published")
            {
                problems.Add(new CheckoutProblem("listing_unavailable", $"{field}.listingId", "This item is no longer available."));
                continue;
            }

            var modifierIds = request.ModifierIds ?? [];
            var deltas = new List<int>();
            foreach (var modifierId in modifierIds)
            {
                var modifier = listing.Modifiers.FirstOrDefault(m => m.Id == modifierId);
                if (modifier is null)
                {
                    problems.Add(new CheckoutProblem("invalid_modifier", $"{field}.modifierIds", $"'{modifierId}' is not an option for this item."));
                    break;
                }
                deltas.Add(modifier.PriceDeltaCents);
            }
            if (deltas.Count != modifierIds.Count) continue;

            try
            {
                lines.Add(new OrderLine(listing.Id, modifierIds, request.Quantity!.Value, checked(listing.PriceCents + deltas.Sum())));
            }
            catch (OrderRuleException e)
            {
                // Duplicate modifier ids, or a quantity the aggregate refuses; the shape check normally catches these first.
                problems.Add(new CheckoutProblem(e.Kind == OrderRuleKind.Quantity ? "invalid_quantity" : "invalid_modifier", field, e.Message));
            }
        }

        // Per-item limits the catalog publishes (ADR-0017): the total asked for per listing may not exceed its max per order.
        if (problems.Count == 0)
        {
            foreach (var group in lines.GroupBy(l => l.ListingId))
            {
                var max = listings[group.Key]!.Stock?.MaxPerOrder;
                if (max is { } limit && group.Sum(l => l.Quantity) > limit)
                    problems.Add(new CheckoutProblem("invalid_quantity", "lineItems", $"At most {limit} of this item per order."));
            }
        }

        return (lines, problems);
    }
}

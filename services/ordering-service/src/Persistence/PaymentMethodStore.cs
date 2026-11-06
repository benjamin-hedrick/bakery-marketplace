using BakeryMarketplace.Data;

namespace OrderingService.Persistence;

/// <summary>What a customer may see of a saved payment method: an id to choose it by and a description. Never the token.</summary>
public sealed record PaymentMethodDto(string Id, string Description);

/// <summary>
/// A customer's saved payment methods (WI-ORD-010). Every read is in the caller's own partition, so another customer's method can never be read:
/// an id that is not the caller's looks exactly like an id that does not exist.
/// </summary>
public sealed class PaymentMethodStore(IRepository<PaymentMethodDocument> documents)
{
    /// <summary>The method with this id in the customer's own partition, or null.</summary>
    public Task<PaymentMethodDocument?> GetAsync(string methodId, string customerId, CancellationToken ct = default) =>
        documents.GetAsync(methodId, customerId, ct);

    /// <summary>The customer's methods as they may be shown (no token), in a stable order: oldest first, then by id.</summary>
    public async Task<IReadOnlyList<PaymentMethodDto>> ListAsync(string customerId, CancellationToken ct = default)
    {
        var all = new List<PaymentMethodDocument>();
        await foreach (var d in documents.QueryAsync(customerId, q => q.Where(x => x.CustomerId == customerId), ct)) all.Add(d);
        return all
            .OrderBy(d => d.CreatedAt).ThenBy(d => d.Id, StringComparer.Ordinal)
            .Select(d => new PaymentMethodDto(d.Id, d.Description))
            .ToList();
    }
}

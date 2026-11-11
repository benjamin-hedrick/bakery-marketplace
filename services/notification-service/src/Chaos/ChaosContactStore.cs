using BakeryMarketplace.Chaos;
using NotificationService.Contacts;

namespace NotificationService.Chaos;

/// <summary>
/// The <c>contacts</c> layer (ADR-0024): a decorator around the contact store that sits under the cache, so a failing store is seen as it would be in life
/// (a warm cache hides it, a cold one passes it on and the notifier retries the batch). It injects a read failure (<c>failureRate</c>), slowness
/// (<c>latencyMs</c>) and an outage window. Keyed by the customer ids asked for (ids, never an address or a name) and the attempt number. A read has no
/// lost-response fault: repeating it changes nothing. The wrapped store is untouched.
/// </summary>
public sealed class ChaosContactStore(IContactStore inner, ChaosLayer layer) : IContactStore
{
    public async Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(customerIds);
        var key = string.Join(',', customerIds.Order(StringComparer.Ordinal));
        await layer.BeforeAsync("read", key, "failure", "failureRate",
            () => new InvalidOperationException("ChaosContactStore: simulated store failure."), ct);
        return await inner.GetContactsAsync(customerIds, ct);
    }
}

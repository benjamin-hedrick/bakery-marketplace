using BakeryMarketplace.Auth;
using BakeryMarketplace.Caching;

namespace NotificationService.Contacts;

/// <summary>Where a customer's messages go. Personal data: never logged, never put on an event.</summary>
public sealed record Contact(string CustomerId, string Email, string DisplayName);

/// <summary>
/// Looks up contact details by customer id. The signature is a batch so a caller with several customers (one poll of events) makes one
/// read; the result holds only the customers that were found.
/// </summary>
public interface IContactDirectory
{
    Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default);
}

/// <summary>
/// Seeded contacts for the local and dev environments: the customers of the mock identity (the same ids a login produces, so an order
/// placed by Alice reaches Alice's address). A real store replaces this behind <see cref="IContactDirectory"/> (register item 138).
/// </summary>
public sealed class SeededContactDirectory : IContactDirectory
{
    private readonly IReadOnlyDictionary<string, Contact> _contacts;

    public SeededContactDirectory(IEnumerable<Contact> contacts) =>
        _contacts = contacts.ToDictionary(c => c.CustomerId, StringComparer.Ordinal);

    public static SeededContactDirectory FromMockIdentity() => new(
        MockUsers.All.Values.Where(u => u.Role == "Customer").DistinctBy(u => u.Id).Select(u => new Contact(u.Id, u.Email, u.Name)));

    public Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(customerIds);
        var found = new Dictionary<string, Contact>(StringComparer.Ordinal);
        foreach (var id in customerIds)
            if (id is not null && _contacts.TryGetValue(id, out var contact)) found[id] = contact;
        return Task.FromResult<IReadOnlyDictionary<string, Contact>>(found);
    }
}

/// <summary>
/// Cache-aside over another directory, through <see cref="ICacheProvider"/> (in process or distributed). One cache round trip
/// (<c>GetManyAsync</c>) for all the ids, one batch read of the inner directory for the misses. "No contact" is cached briefly so an
/// unknown customer does not hit the directory on every event. A cache failure is never a delivery failure: it reads through.
/// </summary>
public sealed class CachedContactDirectory(
    IContactDirectory inner, ICacheProvider cache, ILogger<CachedContactDirectory> logger,
    TimeSpan? ttl = null, TimeSpan? negativeTtl = null) : IContactDirectory
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan DefaultNegativeTtl = TimeSpan.FromSeconds(30);

    /// <summary>The cached form; a null <see cref="Contact"/> records "this customer has no contact".</summary>
    public sealed record Entry(Contact? Contact);

    private static string Key(string customerId) => $"contact:{customerId}";

    public async Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(customerIds);
        var ids = customerIds.Where(id => !string.IsNullOrEmpty(id)).Distinct(StringComparer.Ordinal).ToArray();
        var result = new Dictionary<string, Contact>(StringComparer.Ordinal);
        if (ids.Length == 0) return result;

        IReadOnlyDictionary<string, Entry> cached;
        try
        {
            cached = await cache.GetManyAsync<Entry>(ids.Select(Key).ToArray(), ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            logger.LogWarning(e, "The contact cache could not be read; reading {Count} contacts from the directory", ids.Length);
            cached = new Dictionary<string, Entry>();
        }

        var misses = new List<string>();
        foreach (var id in ids)
        {
            if (cached.TryGetValue(Key(id), out var entry)) { if (entry.Contact is not null) result[id] = entry.Contact; }
            else misses.Add(id);
        }
        if (misses.Count == 0) return result;

        var fetched = await inner.GetContactsAsync(misses, ct);
        foreach (var id in misses)
            if (fetched.TryGetValue(id, out var contact)) result[id] = contact;

        try
        {
            foreach (var id in misses)
            {
                var found = fetched.TryGetValue(id, out var contact);
                await cache.SetAsync(Key(id), new Entry(found ? contact : null), found ? ttl ?? DefaultTtl : negativeTtl ?? DefaultNegativeTtl, ct);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            logger.LogWarning(e, "The contact cache could not be written"); // the cache is down: skip the rest, the contacts are already in the result
        }
        return result;
    }
}

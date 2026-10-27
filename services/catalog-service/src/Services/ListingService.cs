using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;

namespace CatalogService.Services;

public enum ListingOutcome { Ok, Created, NotFound, Invalid, VendorNotVerified }

public sealed record ListingResult(ListingOutcome Outcome, ListingDocument? Listing = null, Dictionary<string, string[]>? Errors = null);

/// <summary>
/// Catalog listing rules (WI-CAT-001). Rules that live here, not in the API layer or the BFF:
/// <list type="bullet">
/// <item>A listing can reach <c>Published</c> only if its vendor is currently <c>Verified</c> — derived from events, never client input.</item>
/// <item>Public reads show only <c>Published</c> listings of currently <c>Verified</c> vendors. A suspension hides listings at read time;
/// it does not rewrite them, and a later <c>VendorVerified</c> restores visibility.</item>
/// <item>The owner is always the caller's subject; writes are partitioned by it, so a vendor cannot even address another vendor's listing.</item>
/// </list>
/// </summary>
public sealed class ListingService
{
    private readonly IRepository<ListingDocument> _listings;
    private readonly VendorStatusStore _vendors;
    private readonly IEventPublisher _events;
    private readonly TimeProvider _time;
    private readonly ILogger<ListingService> _logger;

    public ListingService(
        IRepository<ListingDocument> listings,
        VendorStatusStore vendors,
        IEventPublisher events,
        TimeProvider time,
        ILogger<ListingService> logger)
    {
        _listings = listings;
        _vendors = vendors;
        _events = events;
        _time = time;
        _logger = logger;
    }

    // ---- public reads (anonymous) -------------------------------------------------------------

    /// <summary>
    /// Published listings of verified vendors, ordered by id. <paramref name="after"/> is the id of the last item of the
    /// previous page. The repository contract is single-partition, so this reads one partition per verified vendor;
    /// fine at first-slice scale, to be revisited if the vendor count grows.
    /// </summary>
    public async Task<(IReadOnlyList<ListingDocument> Items, string? NextCursor)> BrowseAsync(
        int limit, string? after, CancellationToken ct = default)
    {
        var all = new List<ListingDocument>();
        foreach (var vendorId in await _vendors.VerifiedVendorIdsAsync(ct))
        {
            await foreach (var l in _listings.QueryAsync(
                               vendorId, q => q.Where(x => x.Status == ListingStatuses.Published), ct))
            {
                all.Add(l);
            }
        }

        var ordered = all.OrderBy(l => l.Id, StringComparer.Ordinal)
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
        foreach (var vendorId in await _vendors.VerifiedVendorIdsAsync(ct))
        {
            var found = await _listings.GetAsync(id, vendorId, ct);
            if (found is { Status: ListingStatuses.Published }) return found;
        }
        return null;
    }

    // ---- vendor writes ------------------------------------------------------------------------

    /// <summary>The caller's own listing, or null. Looks only in the caller's partition.</summary>
    public Task<ListingDocument?> GetOwnAsync(string id, string vendorId, CancellationToken ct = default) =>
        _listings.GetAsync(id, vendorId, ct);

    public async Task<ListingResult> CreateAsync(string vendorId, ListingRequest request, CancellationToken ct = default)
    {
        var errors = ListingValidator.Validate(request, statusRequired: false);
        if (errors.Count > 0) return new ListingResult(ListingOutcome.Invalid, Errors: errors);

        var status = request.Status ?? ListingStatuses.Draft;
        if (status == ListingStatuses.Published && !await _vendors.IsVerifiedAsync(vendorId, ct))
            return new ListingResult(ListingOutcome.VendorNotVerified);

        var now = _time.GetUtcNow();
        var doc = new ListingDocument
        {
            Id = $"listing-{Guid.NewGuid():N}",
            VendorId = vendorId,
            CreatedAt = now,
            Status = status,
        };
        Apply(doc, request, now);
        doc = await _listings.SaveAsync(doc, vendorId, ct);

        if (doc.Status == ListingStatuses.Published) await PublishedEventAsync(doc, ct);
        return new ListingResult(ListingOutcome.Created, doc);
    }

    public async Task<ListingResult> UpdateAsync(
        ListingDocument existing, ListingRequest request, CancellationToken ct = default)
    {
        var errors = ListingValidator.Validate(request, statusRequired: false);
        if (errors.Count > 0) return new ListingResult(ListingOutcome.Invalid, Errors: errors);

        var wasPublished = existing.Status == ListingStatuses.Published;
        var newStatus = request.Status ?? existing.Status;

        // Only the Draft -> Published transition is gated: an already-published listing of a since-suspended vendor
        // can still be edited or unpublished, but not (re)published.
        if (newStatus == ListingStatuses.Published && !wasPublished
            && !await _vendors.IsVerifiedAsync(existing.VendorId, ct))
            return new ListingResult(ListingOutcome.VendorNotVerified);

        existing.Status = newStatus;
        Apply(existing, request, _time.GetUtcNow());
        var saved = await _listings.SaveAsync(existing, existing.VendorId, ct);

        if (!wasPublished && saved.Status == ListingStatuses.Published) await PublishedEventAsync(saved, ct);
        return new ListingResult(ListingOutcome.Ok, saved);
    }

    // ---- helpers ------------------------------------------------------------------------------

    private static void Apply(ListingDocument doc, ListingRequest r, DateTimeOffset now)
    {
        doc.Name = r.Name!.Trim();
        doc.Description = string.IsNullOrWhiteSpace(r.Description) ? null : r.Description.Trim();
        doc.Category = r.Category!.Trim();
        doc.PriceCents = r.PriceCents!.Value;
        doc.AllergenFlags = ListingValidator.NormalizeFlags(r.AllergenFlags);
        doc.Modifiers = (r.Modifiers ?? new()).Select(m => new ModifierDocument
        {
            Id = m.Id!,
            Name = m.Name!.Trim(),
            PriceDeltaCents = m.PriceDeltaCents!.Value,
            Allergens = ListingValidator.NormalizeFlags(m.Allergens),
        }).ToList();
        doc.UpdatedAt = now;
        doc.Version++;
    }

    /// <summary>
    /// The listing is already persisted when this runs, and persisted state is authoritative. There is no outbox yet,
    /// so a publish failure is logged rather than failing the request: a retry would see an already-published listing
    /// and never re-emit. Closing that dual-write gap is future work.
    /// </summary>
    private async Task PublishedEventAsync(ListingDocument doc, CancellationToken ct)
    {
        try
        {
            await _events.PublishAsync(new DomainEventEnvelope<ListingPublishedPayload>(
                Guid.NewGuid(), "ListingPublished", 1, _time.GetUtcNow(), "Listing", doc.Id, doc.Version,
                new ListingPublishedPayload(doc.Id, doc.VendorId)), ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ListingPublished event could not be published for a persisted listing ({ListingId})", doc.Id);
        }
    }
}

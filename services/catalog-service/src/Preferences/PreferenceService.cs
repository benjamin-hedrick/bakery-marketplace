using BakeryMarketplace.Data;
using CatalogService.Tags;

namespace CatalogService.Preferences;

/// <summary>The body of <c>PUT /catalog/preferences</c>. Both lists are required: a missing one must not clear a profile by accident.</summary>
/// <summary>
/// <c>Prefer</c> (WI-TAG-004) is optional: a request without it leaves the stored list as it was, so a client that does not know about diets cannot clear it.
/// </summary>
public sealed record PreferencesRequest(List<string?>? Allergies, List<string?>? Avoid, List<string?>? Prefer = null);

public enum PreferenceOutcome { Saved, Invalid }

public sealed record PreferenceResult(PreferenceOutcome Outcome, PreferenceProfile? Profile = null, Dictionary<string, string[]>? Errors = null);

/// <summary>
/// The allergen profile (WI-PREF-001). The customer is always the caller; nothing here takes a customer id from a request. Ids must be allergens
/// the registry offers today (public, active, not retired): anything else is refused by name, and nothing is dropped silently.
/// </summary>
public sealed class PreferenceService(IRepository<PreferenceProfileDocument> profiles, ITagRegistry tags, TimeProvider time) : IPreferenceReader
{
    public async Task<PreferenceProfile> GetAsync(string customerId, CancellationToken ct = default)
    {
        var doc = await profiles.GetAsync(customerId, customerId, ct);
        return doc is null ? PreferenceProfile.Empty : new PreferenceProfile(doc.Allergies, doc.Avoid, doc.UpdatedAt, doc.Prefer);
    }

    /// <summary>Replaces the profile (creating it on the first save). An empty pair of lists clears it.</summary>
    public async Task<PreferenceResult> ReplaceAsync(string customerId, PreferencesRequest? request, CancellationToken ct = default)
    {
        var now = time.GetUtcNow();
        var errors = Validate(request, DateOnly.FromDateTime(now.UtcDateTime));
        if (errors.Count > 0) return new PreferenceResult(PreferenceOutcome.Invalid, Errors: errors);

        var prefer = request!.Prefer is null
            ? (await profiles.GetAsync(customerId, customerId, ct))?.Prefer ?? []
            : request.Prefer.Select(p => p!).ToList();
        var doc = await profiles.SaveAsync(new PreferenceProfileDocument
        {
            Id = customerId,
            CustomerId = customerId,
            Allergies = request.Allergies!.Select(a => a!).ToList(),
            Avoid = request.Avoid!.Select(a => a!).ToList(),
            Prefer = prefer,
            UpdatedAt = now,
        }, customerId, ct);
        return new PreferenceResult(PreferenceOutcome.Saved, new PreferenceProfile(doc.Allergies, doc.Avoid, doc.UpdatedAt, doc.Prefer));
    }

    private Dictionary<string, string[]> Validate(PreferencesRequest? request, DateOnly today)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = new List<string>();
            list.Add(message);
        }

        var allowed = tags.PublicOn(today, TagKind.Allergen).Select(t => t.Id).ToList();
        var allowedSet = allowed.ToHashSet(StringComparer.Ordinal);

        void CheckList(string field, List<string?>? values)
        {
            if (values is null) { Add(field, "Required (an empty list clears it)."); return; }
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var value in values)
            {
                if (value is null || !allowedSet.Contains(value))
                    Add(field, $"'{Trim(value)}' is not an allergen in the list. Use one of: {string.Join(", ", allowed)}.");
                else if (!seen.Add(value)) Add(field, $"'{value}' appears more than once.");
            }
        }

        CheckList("allergies", request?.Allergies);
        CheckList("avoid", request?.Avoid);

        // Diets the customer prefers: diet tags the registry shows today. Optional, so a missing list is fine; a given one is checked like the others.
        if (request?.Prefer is { } prefer)
        {
            var diets = tags.PublicOn(today, TagKind.Diet).Select(t => t.Id).ToList();
            var dietSet = diets.ToHashSet(StringComparer.Ordinal);
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var value in prefer)
            {
                if (value is null || !dietSet.Contains(value))
                    Add("prefer", $"'{Trim(value)}' is not a diet in the list. Use one of: {string.Join(", ", diets)}.");
                else if (!seen.Add(value)) Add("prefer", $"'{value}' appears more than once.");
            }
        }

        // An allergen has one choice: Allergy or Avoid, never both (the profile page offers one choice each).
        if (request?.Allergies is { } a && request.Avoid is { } v)
        {
            foreach (var both in a.Where(x => x is not null && allowedSet.Contains(x)).Intersect(v.Where(x => x is not null && allowedSet.Contains(x))))
                Add("avoid", $"'{both}' is already in allergies; an allergen is one or the other.");
        }

        return errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
    }

    /// <summary>A value echoed in an error is shortened, so an oversize value cannot make the response large.</summary>
    private static string Trim(string? value) => value is null ? "" : value.Length <= 40 ? value : value[..40] + "…";
}

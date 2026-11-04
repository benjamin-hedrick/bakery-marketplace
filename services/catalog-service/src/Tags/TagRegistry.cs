using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace CatalogService.Tags;

/// <summary>The tag registry (ADR-0022), read through an interface so a store with administrator editing can replace the data file later.</summary>
public interface ITagRegistry
{
    /// <summary>Every entry, including retired and hidden ones, in registry order (sort order, then id).</summary>
    IReadOnlyList<TagDefinition> All { get; }

    TagDefinition? Find(string id);

    /// <summary>The tags a public response may carry on that day (UTC), optionally of one kind.</summary>
    IReadOnlyList<TagDefinition> PublicOn(DateOnly today, TagKind? kind = null);

    /// <summary>The ids a vendor may put in <c>allergenFlags</c> and in an option's <c>allergens</c>, in registry order.</summary>
    IReadOnlyList<string> VendorAllergenIds { get; }
}

/// <summary>The registry file is not valid. The message names the entry; the service refuses to start (the file ships with the service, so this is a build mistake).</summary>
public sealed class TagRegistryException(string message) : Exception(message);

/// <summary>
/// The registry as versioned data: a JSON file embedded in the service (<c>Tags/tags.json</c>), validated when it is loaded.
/// </summary>
public sealed partial class TagRegistry : ITagRegistry
{
    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")]
    private static partial Regex IdPattern();

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) },
    };

    private readonly Dictionary<string, TagDefinition> _byId;

    public IReadOnlyList<TagDefinition> All { get; }

    public IReadOnlyList<string> VendorAllergenIds { get; }

    private TagRegistry(IReadOnlyList<TagDefinition> entries)
    {
        All = entries.OrderBy(t => t.SortOrder).ThenBy(t => t.Id, StringComparer.Ordinal).ToList();
        _byId = All.ToDictionary(t => t.Id, StringComparer.Ordinal);
        VendorAllergenIds = All.Where(t => t.Kind == TagKind.Allergen && t.VendorMayAssign).Select(t => t.Id).ToList();
    }

    /// <summary>The registry that ships with the service.</summary>
    public static TagRegistry LoadEmbedded()
    {
        var assembly = typeof(TagRegistry).Assembly;
        var name = assembly.GetManifestResourceNames().SingleOrDefault(n => n.EndsWith("tags.json", StringComparison.Ordinal))
            ?? throw new TagRegistryException("The tag registry file (Tags/tags.json) is not embedded in the service.");
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return Parse(reader.ReadToEnd());
    }

    /// <summary>Parses and validates registry JSON: <c>{ "tags": [ { "id": "...", ... } ] }</c>.</summary>
    public static TagRegistry Parse(string json)
    {
        RegistryFile? file;
        try
        {
            file = JsonSerializer.Deserialize<RegistryFile>(json, Options);
        }
        catch (JsonException e)
        {
            throw new TagRegistryException($"The tag registry file is not valid: {e.Message}");
        }

        var raw = file?.Tags ?? throw new TagRegistryException("The tag registry file has no \"tags\" list.");
        var entries = new List<TagDefinition>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tag in raw)
        {
            if (tag is null) throw new TagRegistryException("The tag registry has an empty entry.");
            var id = tag.Id ?? "";
            if (!IdPattern().IsMatch(id))
                throw new TagRegistryException($"Tag '{id}': the id must be lower case letters, digits and hyphens, 1 to 40 characters, starting with a letter or digit.");
            if (!seen.Add(id)) throw new TagRegistryException($"Tag '{id}': the id appears more than once (ids are unique across all kinds).");
            if (tag.Kind is null) throw new TagRegistryException($"Tag '{id}': a kind is required.");
            if (string.IsNullOrWhiteSpace(tag.Label)) throw new TagRegistryException($"Tag '{id}': a label is required.");
            if (tag.ActiveFrom is { } from && tag.ActiveTo is { } to && from > to)
                throw new TagRegistryException($"Tag '{id}': activeFrom is after activeTo.");
            var visibility = tag.Visibility ?? TagVisibility.Public;
            var assigner = tag.AssignableBy ?? TagAssigner.Vendor;
            if (visibility == TagVisibility.Hidden && assigner != TagAssigner.Platform)
                throw new TagRegistryException($"Tag '{id}': a hidden tag must be assignableBy platform (a vendor cannot set a tag it cannot see).");
            entries.Add(new TagDefinition(id, tag.Kind.Value, tag.Label.Trim(), visibility, assigner, tag.ActiveFrom, tag.ActiveTo, tag.SortOrder, tag.Retired));
        }
        return new TagRegistry(entries);
    }

    public TagDefinition? Find(string id) => _byId.GetValueOrDefault(id);

    public IReadOnlyList<TagDefinition> PublicOn(DateOnly today, TagKind? kind = null) =>
        All.Where(t => (kind is null || t.Kind == kind) && t.IsPublicOn(today)).ToList();

    private sealed class RegistryFile
    {
        public List<TagEntry?>? Tags { get; set; }
    }

    /// <summary>An entry as written in the file; what is missing is reported by name, not defaulted silently.</summary>
    private sealed class TagEntry
    {
        public string? Id { get; set; }
        public TagKind? Kind { get; set; }
        public string? Label { get; set; }
        public TagVisibility? Visibility { get; set; }
        public TagAssigner? AssignableBy { get; set; }
        public DateOnly? ActiveFrom { get; set; }
        public DateOnly? ActiveTo { get; set; }
        public int SortOrder { get; set; }
        public bool Retired { get; set; }
    }
}

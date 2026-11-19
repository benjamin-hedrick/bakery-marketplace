using System.Globalization;

namespace CatalogService.Api;

/// <summary>
/// The edit precondition's headers (WI-CAT-007, register 208): a single-listing owner answer carries <c>ETag: "&lt;editVersion&gt;"</c>, and an edit
/// names that value in <c>If-Match</c>. Only one strong tag of the form <c>"&lt;positive integer&gt;"</c> is accepted. Anything else, including
/// <c>*</c> (which would mean "any version"), a weak tag or a list, is not a precondition the service can check, and is treated as missing.
/// </summary>
public static class EditVersionHeader
{
    private const int MaxDigits = 18; // fits a long with room to spare

    public static string Format(long editVersion) => "\"" + editVersion.ToString(CultureInfo.InvariantCulture) + "\"";

    /// <summary>The edit version an <c>If-Match</c> header names, or null when there is none the service accepts.</summary>
    public static long? Parse(string? ifMatch)
    {
        var value = ifMatch?.Trim();
        if (value is null || value.Length < 3 || value.Length > MaxDigits + 2 || value[0] != '"' || value[^1] != '"') return null;

        var digits = value.AsSpan(1, value.Length - 2);
        foreach (var c in digits)
        {
            if (c is < '0' or > '9') return null;
        }
        return long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var version) && version >= 1 ? version : null;
    }
}

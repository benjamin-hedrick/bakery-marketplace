namespace OrderingService.Persistence;

/// <summary>
/// The cursor of the order lists: the time and id of the last item of the previous page, <c>{milliseconds}:{id}</c>. Both lists (a customer's
/// orders, a vendor's orders) page the same way, so the form is read here once. A cursor comes from the client, so it is checked, never trusted.
/// </summary>
public static class PageCursor
{
    private const int MaxLength = 200;

    public static string Format(long milliseconds, string id) => $"{milliseconds}:{id}";

    public static bool IsValid(string? after) => after is null || TryParse(after, out _, out _);

    public static bool TryParse(string after, out long milliseconds, out string id)
    {
        milliseconds = 0;
        id = "";
        var colon = after.IndexOf(':');
        if (colon < 1 || colon == after.Length - 1 || after.Length > MaxLength) return false;
        id = after[(colon + 1)..];
        return long.TryParse(after.AsSpan(0, colon), out milliseconds);
    }
}

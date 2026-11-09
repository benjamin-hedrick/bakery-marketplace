using System.Security.Claims;

namespace BakeryMarketplace.Auth;

public static class ClaimsExtensions
{
    /// <summary>
    /// The caller's subject id: the <c>sub</c> claim, or the mapped name-identifier claim when the JWT handler has renamed it. Null when the
    /// token carries neither. Customers, vendors and services are all identified by it, and it is the partition key of what they own.
    /// </summary>
    public static string? SubjectId(this ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}

using System.Security.Claims;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Resource-ownership check helper — the second layer of authorization per ADR-0006.
/// Checks whether the authenticated user (identified by the 'sub' claim) owns the resource.
/// This is the generic mechanism; individual services apply it to their specific resource types.
/// </summary>
public interface IResourceOwnershipChecker
{
    /// <summary>
    /// Returns true if the user's 'sub' claim matches <paramref name="resourceOwnerId"/>.
    /// </summary>
    bool IsOwner(ClaimsPrincipal user, string resourceOwnerId);
}

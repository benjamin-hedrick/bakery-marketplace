using System.Security.Claims;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Default implementation of resource-ownership check.
/// Compares the authenticated user's 'sub' claim to the resource's owner id.
/// See ADR-0006: the second layer of authorization (role check is first; this is second).
/// </summary>
public sealed class ResourceOwnershipChecker : IResourceOwnershipChecker
{
    public bool IsOwner(ClaimsPrincipal user, string resourceOwnerId)
    {
        ArgumentNullException.ThrowIfNull(user);
        if (string.IsNullOrEmpty(resourceOwnerId)) return false;

        var sub = user.SubjectId();

        return sub is not null && sub == resourceOwnerId;
    }
}

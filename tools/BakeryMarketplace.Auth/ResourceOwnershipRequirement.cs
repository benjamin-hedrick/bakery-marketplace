using Microsoft.AspNetCore.Authorization;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Authorization requirement coupling a required role check with a resource-ownership check.
/// See ADR-0006 and WI-AUTH-002.
/// </summary>
public sealed class ResourceOwnershipRequirement : IAuthorizationRequirement
{
    public string RequiredRole { get; }

    public ResourceOwnershipRequirement(string requiredRole)
    {
        if (string.IsNullOrEmpty(requiredRole))
            throw new ArgumentException("RequiredRole cannot be null or empty.", nameof(requiredRole));

        RequiredRole = requiredRole;
    }
}

using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Reusable ASP.NET Core authorization handler composing a role check with an <see cref="IResourceOwnershipChecker"/> call.
/// 
/// SHORT-CIRCUIT BEHAVIOR (ADR-0006 hard requirement):
/// Checks role claims first. If the user lacks the required role, returns immediately WITHOUT calling
/// <see cref="IResourceOwnershipChecker"/>. This ensures missing role claims fail fast before any resource lookup or ownership check.
/// See WI-AUTH-002.
/// </summary>
public class ResourceOwnershipHandler<TResource> : AuthorizationHandler<ResourceOwnershipRequirement, TResource>
    where TResource : IResourceWithOwnerId
{
    private readonly IResourceOwnershipChecker _ownershipChecker;

    public ResourceOwnershipHandler(IResourceOwnershipChecker ownershipChecker)
    {
        _ownershipChecker = ownershipChecker ?? throw new ArgumentNullException(nameof(ownershipChecker));
    }

    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ResourceOwnershipRequirement requirement,
        TResource resource)
    {
        if (context is null) throw new ArgumentNullException(nameof(context));
        if (requirement is null) throw new ArgumentNullException(nameof(requirement));
        if (resource is null) throw new ArgumentNullException(nameof(resource));

        // 1. Role check short-circuit
        bool hasRole = context.User.HasClaim("roles", requirement.RequiredRole)
                       || context.User.HasClaim(ClaimTypes.Role, requirement.RequiredRole);

        if (!hasRole)
        {
            // Missing role claim: short-circuit without calling ownership checker
            return Task.CompletedTask;
        }

        // 2. Resource ownership check
        if (_ownershipChecker.IsOwner(context.User, resource.ResourceOwnerId))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

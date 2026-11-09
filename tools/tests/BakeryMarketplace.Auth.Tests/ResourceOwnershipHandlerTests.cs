using System.Security.Claims;
using BakeryMarketplace.Auth;
using Microsoft.AspNetCore.Authorization;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// Proves that <see cref="ResourceOwnershipHandler{TResource}"/> correctly composes role and ownership checks,
/// including short-circuiting when the role claim is missing.
/// See WI-AUTH-002.
/// </summary>
public class ResourceOwnershipHandlerTests
{
    /// <summary>A resource owned by one subject, standing for any service's own type (the catalog's listing, for one).</summary>
    private sealed record TestResource(string ResourceOwnerId) : IResourceWithOwnerId;

    private readonly TrackingOwnershipChecker _checker = new();
    private readonly ResourceOwnershipRequirement _requirement = new("Vendor");
    private readonly TestResource _resource = new("vendor-owner-123");

    [Fact]
    public async Task AuthorizedOwner_Succeeds()
    {
        // Arrange
        var user = CreateUser(role: "Vendor", sub: "vendor-owner-123");
        var handler = new ResourceOwnershipHandler<TestResource>(_checker);
        var context = new AuthorizationHandlerContext(new[] { _requirement }, user, _resource);

        // Act
        await handler.HandleAsync(context);

        // Assert
        Assert.True(context.HasSucceeded);
        Assert.True(_checker.WasCalled);
    }

    [Fact]
    public async Task WrongOwner_DoesNotSucceed()
    {
        // Arrange
        var user = CreateUser(role: "Vendor", sub: "different-vendor-999");
        var handler = new ResourceOwnershipHandler<TestResource>(_checker);
        var context = new AuthorizationHandlerContext(new[] { _requirement }, user, _resource);

        // Act
        await handler.HandleAsync(context);

        // Assert
        Assert.False(context.HasSucceeded);
        Assert.True(_checker.WasCalled);
    }

    [Fact]
    public async Task MissingRoleClaim_FailsBeforeOwnershipCheckIsCalled()
    {
        // Arrange — user has matching sub but lacks Vendor role claim
        var user = CreateUser(role: "Customer", sub: "vendor-owner-123");
        var handler = new ResourceOwnershipHandler<TestResource>(_checker);
        var context = new AuthorizationHandlerContext(new[] { _requirement }, user, _resource);

        // Act
        await handler.HandleAsync(context);

        // Assert
        Assert.False(context.HasSucceeded);
        Assert.False(_checker.WasCalled, "IResourceOwnershipChecker MUST NOT be called when role claim is missing (short-circuit).");
    }

    private static ClaimsPrincipal CreateUser(string role, string sub)
    {
        var claims = new List<Claim>
        {
            new("sub", sub),
            new("roles", role)
        };

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
    }

    private class TrackingOwnershipChecker : IResourceOwnershipChecker
    {
        public bool WasCalled { get; private set; }

        public bool IsOwner(ClaimsPrincipal user, string resourceOwnerId)
        {
            WasCalled = true;
            var sub = user.FindFirst("sub")?.Value;
            return sub == resourceOwnerId;
        }
    }
}

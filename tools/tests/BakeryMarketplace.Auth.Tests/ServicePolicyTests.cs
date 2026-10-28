using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>The service policy on its own (ADR-0018): the role alone is not enough, and both Entra and mock claim shapes work.</summary>
public class ServicePolicyTests
{
    private static async Task<bool> Allowed(params (string Type, string Value)[] claims)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddBakeryAuth(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Authority"] = "http://localhost",
            ["Auth:Audience"] = "bakery-marketplace",
        }).Build());
        using var provider = services.BuildServiceProvider();
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims.Select(c => new Claim(c.Type, c.Value)), "test"));

        var result = await provider.GetRequiredService<IAuthorizationService>().AuthorizeAsync(user, ServicePolicies.StockReserve);

        return result.Succeeded;
    }

    [Fact]
    public async Task RoleAppOnlyMarkerAndClientId_Passes() =>
        Assert.True(await Allowed(("roles", ServiceRoles.StockReserve), ("idtyp", "app"), ("client_id", "ordering-service")));

    [Theory]
    [InlineData("azp")]
    [InlineData("appid")]
    public async Task EntraStyleClientIdClaimsAreAccepted(string claimType) =>
        Assert.True(await Allowed(("roles", ServiceRoles.StockReserve), ("idtyp", "app"), (claimType, "ordering-client-id")));

    [Fact]
    public async Task TheRoleWithoutTheAppOnlyMarker_IsRefused() =>
        Assert.False(await Allowed(("roles", ServiceRoles.StockReserve), ("client_id", "ordering-service")));

    [Fact]
    public async Task TheRoleOnAUserTokenIsRefused() =>
        Assert.False(await Allowed(("roles", ServiceRoles.StockReserve), ("roles", "Vendor"), ("sub", "user-vendor-1"), ("vendorType", "Shop")));

    [Fact]
    public async Task AppOnlyWithoutAClientIdIsRefused() =>
        Assert.False(await Allowed(("roles", ServiceRoles.StockReserve), ("idtyp", "app")));

    [Fact]
    public async Task AppOnlyWithADifferentRoleIsRefused() =>
        Assert.False(await Allowed(("roles", "Vendor"), ("idtyp", "app"), ("client_id", "ordering-service")));

    [Fact]
    public void ClientIdPrefersClientIdThenAzpThenAppid()
    {
        static ClaimsPrincipal P(params (string, string)[] c) => new(new ClaimsIdentity(c.Select(x => new Claim(x.Item1, x.Item2))));

        Assert.Equal("a", ServiceCaller.ClientId(P(("client_id", "a"), ("azp", "b"), ("appid", "c"))));
        Assert.Equal("b", ServiceCaller.ClientId(P(("azp", "b"), ("appid", "c"))));
        Assert.Equal("c", ServiceCaller.ClientId(P(("appid", "c"))));
        Assert.Null(ServiceCaller.ClientId(P(("client_id", " "))));
        Assert.False(ServiceCaller.IsAppOnly(P(("idtyp", "user"), ("client_id", "a"))));
    }
}

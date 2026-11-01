using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// The rule for running the mock issuer in a deployed dev environment (register item 102): Production is refused unless a named switch is set on
/// safe terms, and a role outside the allowed list cannot be logged in as, whether the login page lists it or the id is posted by hand.
/// </summary>
[Collection("SequentialAuth")]
public class MockOidcDeploymentTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    private const string Https = "https://mock.example.test";

    // ---- the start-up rule ----------------------------------------------------------------------------------------------------

    [Fact]
    public void OutsideProduction_EveryUserIsOffered_AsBefore()
    {
        Assert.Null(MockOidcDeployment.Resolve(Config(), isProduction: false));
    }

    [Fact]
    public void Production_IsRefusedWithoutTheNamedSwitch()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => MockOidcDeployment.Resolve(Config(("MockOidc:Issuer", Https)), isProduction: true));
        Assert.Contains("refuses to start in the Production", ex.Message);
    }

    [Fact]
    public void Production_WithTheSwitch_NeedsAnHttpsIssuer()
    {
        Assert.Throws<InvalidOperationException>(() => MockOidcDeployment.Resolve(
            Config((MockOidcDeployment.AllowDeployedDevKey, "true"), ("MockOidc:Issuer", "http://mock.example.test")), isProduction: true));
        Assert.Throws<InvalidOperationException>(() => MockOidcDeployment.Resolve(
            Config((MockOidcDeployment.AllowDeployedDevKey, "true")), isProduction: true));
    }

    [Fact]
    public void Production_WithTheSwitch_DefaultsToCustomerOnly()
    {
        var roles = MockOidcDeployment.Resolve(Config((MockOidcDeployment.AllowDeployedDevKey, "true"), ("MockOidc:Issuer", Https)), isProduction: true);
        Assert.Equal(["Customer"], roles);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Vendor")]
    public void Production_ARoleOtherThanCustomer_NeedsTheIngressToBeRestricted(string role)
    {
        var withoutRestriction = Config(
            (MockOidcDeployment.AllowDeployedDevKey, "true"), ("MockOidc:Issuer", Https), ($"{MockOidcDeployment.AllowedRolesKey}:0", "Customer"), ($"{MockOidcDeployment.AllowedRolesKey}:1", role));
        Assert.Throws<InvalidOperationException>(() => MockOidcDeployment.Resolve(withoutRestriction, isProduction: true));

        var restricted = Config(
            (MockOidcDeployment.AllowDeployedDevKey, "true"), ("MockOidc:Issuer", Https), ($"{MockOidcDeployment.AllowedRolesKey}:0", "Customer"), ($"{MockOidcDeployment.AllowedRolesKey}:1", role),
            (MockOidcDeployment.IngressRestrictedKey, "true"));
        Assert.Contains(role, MockOidcDeployment.Resolve(restricted, isProduction: true)!);
    }

    [Fact]
    public void AnUnknownRoleNameIsRefused_EvenOutsideProduction()
    {
        Assert.Throws<InvalidOperationException>(() => MockOidcDeployment.Resolve(Config(($"{MockOidcDeployment.AllowedRolesKey}:0", "Superuser")), isProduction: false));
    }

    // ---- the issuer honours the list --------------------------------------------------------------------------------------------

    private static TestServer CreateServer(IReadOnlyCollection<string>? allowedRoles) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer("bakery-marketplace", null, null, null, allowedRoles));
            }));

    private static Task<HttpResponseMessage> Submit(HttpClient client, string userId) =>
        client.PostAsync("/authorize/submit", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["userId"] = userId,
            ["redirect_uri"] = "http://app.test/cb",
            ["state"] = "s",
            ["code_challenge"] = "c",
            ["code_challenge_method"] = "plain",
        }));

    [Fact]
    public async Task TheLoginPageListsOnlyTheAllowedRoles()
    {
        using var server = CreateServer(["Customer"]);
        using var client = server.CreateClient();

        var html = await client.GetStringAsync("/authorize?response_type=code&redirect_uri=" + Uri.EscapeDataString("http://app.test/cb"));

        Assert.Contains("(Customer)", html);
        Assert.DoesNotContain("(Admin)", html);
        Assert.DoesNotContain("(Vendor)", html);
        Assert.DoesNotContain("user-admin-1", html);
    }

    [Theory]
    [InlineData("user-admin-1")]
    [InlineData("admin")]
    [InlineData("ADMIN")]
    [InlineData("vendor-shop-001")]
    [InlineData("user-vendor-1")]
    public async Task APostedIdOutsideTheAllowedRolesIsRefused_NoCodeIsIssued(string userId)
    {
        using var server = CreateServer(["Customer"]);
        using var client = server.CreateClient();

        var response = await Submit(client, userId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Theory]
    [InlineData("user-customer-1")]
    [InlineData("customer")]
    public async Task AnAllowedUserStillLogsIn(string userId)
    {
        using var server = CreateServer(["Customer"]);
        using var client = server.CreateClient();

        var response = await Submit(client, userId);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
    }

    [Fact]
    public async Task WithNoList_EveryUserStillLogsIn_TheLocalBehaviour()
    {
        using var server = CreateServer(null);
        using var client = server.CreateClient();

        Assert.Equal(HttpStatusCode.Redirect, (await Submit(client, "user-admin-1")).StatusCode);
    }
}

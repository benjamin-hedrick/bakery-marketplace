using BakeryMarketplace.Seed;

namespace CatalogService.Tests;

/// <summary>
/// The seed's guard on where it writes (register 224): the local emulator as before, the deployed dev environment only with the switch, the environment name and an
/// Azure Cosmos account address all present, and nothing else.
/// </summary>
public sealed class SeedTargetTests
{
    private const string Emulator = "AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;";
    private const string DevAccount = "AccountEndpoint=https://cosmos-bakery-dev-x.documents.azure.com:443/;AccountKey=a2V5;";

    [Theory]
    [InlineData("AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;")]
    [InlineData("AccountEndpoint=http://127.0.0.1:8081/;AccountKey=a2V5;")]
    [InlineData("AccountEndpoint=https://[::1]:8081/;AccountKey=a2V5;")]
    public void A_loopback_endpoint_is_the_local_emulator_with_no_switch(string connection)
    {
        Assert.Equal(SeedTargetKind.LocalEmulator, SeedTarget.Decide(connection, null, null).Kind);
    }

    [Fact]
    public void The_deployed_dev_account_is_allowed_with_the_switch_and_the_environment_name()
    {
        var decision = SeedTarget.Decide(DevAccount, "true", "dev");
        Assert.Equal(SeedTargetKind.DeployedDev, decision.Kind);
        Assert.True(decision.Allowed);
        Assert.Equal(SeedTargetKind.DeployedDev, SeedTarget.Decide(DevAccount.Replace(":443", ""), "true", "dev").Kind);
    }

    [Theory]
    [InlineData(null, "dev")] // no switch
    [InlineData("false", "dev")]
    [InlineData("True", "dev")] // exactly "true"
    [InlineData("1", "dev")]
    [InlineData("true", null)] // no environment name
    [InlineData("true", "uat")]
    [InlineData("true", "prod")]
    [InlineData("true", "Dev")] // exactly "dev"
    [InlineData("true", "local")]
    public void A_cloud_account_without_both_settings_exactly_is_refused(string? allow, string? environment)
    {
        var decision = SeedTarget.Decide(DevAccount, allow, environment);
        Assert.Equal(SeedTargetKind.Refused, decision.Kind);
        Assert.False(string.IsNullOrWhiteSpace(decision.Reason));
    }

    [Theory]
    [InlineData("AccountEndpoint=http://cosmos-bakery-dev-x.documents.azure.com/;AccountKey=a2V5;")] // plain http
    [InlineData("AccountEndpoint=https://cosmos.example.com/;AccountKey=a2V5;")] // another host
    [InlineData("AccountEndpoint=https://documents.azure.com/;AccountKey=a2V5;")] // no account
    [InlineData("AccountEndpoint=https://a.b.documents.azure.com/;AccountKey=a2V5;")] // not one account label
    [InlineData("AccountEndpoint=https://cosmos-bakery-dev-x.documents.azure.com.example.com/;AccountKey=a2V5;")] // the suffix inside another host
    [InlineData("AccountEndpoint=https://cosmos-bakery-dev-x.documents.azure.com:8443/;AccountKey=a2V5;")] // another port
    [InlineData("AccountEndpoint=https://10.0.0.5:8081/;AccountKey=a2V5;")] // a private address is not loopback
    [InlineData("AccountKey=a2V5;")] // no endpoint
    [InlineData("AccountEndpoint=not a url;AccountKey=a2V5;")]
    [InlineData(null)]
    public void Any_other_endpoint_is_refused_even_with_both_settings(string? connection)
    {
        Assert.Equal(SeedTargetKind.Refused, SeedTarget.Decide(connection, "true", "dev").Kind);
    }

    [Fact]
    public void The_settings_change_nothing_for_the_emulator()
    {
        Assert.Equal(SeedTargetKind.LocalEmulator, SeedTarget.Decide(Emulator, "true", "dev").Kind);
        Assert.Equal(SeedTargetKind.LocalEmulator, SeedTarget.Decide(Emulator, "false", "prod").Kind);
    }
}

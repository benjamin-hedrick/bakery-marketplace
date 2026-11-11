using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>Register item 9: plain http for the mock issuer only on a local Development host, never on a deployed one that also runs as Development.</summary>
public class LocalDevelopmentTests
{
    private sealed class Host(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(string? deployment) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(deployment is null ? [] : [new("Deployment:Environment", deployment)])
            .Build();

    [Theory]
    [InlineData("Development", null, true)] // a developer's machine, compose, the local scripts
    [InlineData("Development", "", true)]
    [InlineData("Development", "  ", true)]
    [InlineData("Development", "dev", false)] // the deployed dev stack runs as Development for chaos: it keeps the production rules
    [InlineData("Development", "anything", false)] // any named deployment
    [InlineData("Production", null, false)]
    [InlineData("Production", "dev", false)]
    [InlineData("Staging", null, false)]
    public void PlainHttpIsAllowedOnlyOnALocalDevelopmentHost(string environment, string? deployment, bool expected) =>
        Assert.Equal(expected, LocalDevelopment.AllowsPlainHttp(new Host(environment), Config(deployment)));
}

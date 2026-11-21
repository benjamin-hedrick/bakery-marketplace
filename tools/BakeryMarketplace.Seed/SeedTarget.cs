namespace BakeryMarketplace.Seed;

/// <summary>Where the seed may write, and how: the local emulator, or a deployed environment's Cosmos account (dev or uat).</summary>
public enum SeedTargetKind
{
    Refused,
    LocalEmulator,
    Deployed,
}

/// <summary>The decision on a seed target, with the reason when it is refused, and for a deployed one the environment's name.</summary>
public sealed record SeedTargetDecision(SeedTargetKind Kind, string? Reason = null, string? Environment = null)
{
    public bool Allowed => Kind != SeedTargetKind.Refused;
}

/// <summary>
/// The seed's guard on where it writes (register 224, approved by the lead 2026-11-20; widened to uat by the lead 2026-11-21, WI-DEP-002 step 4). The seed is
/// fixture data with fixed ids and a vendor verification that stands in for the admin flow, so it must never reach a real customer's database. It is allowed in
/// two cases only:
/// <list type="bullet">
/// <item>a loopback endpoint (the local emulator), as before;</item>
/// <item>a deployed dev or UAT environment, when all three hold: <c>Seed:AllowDeployed</c> is exactly <c>true</c>, <c>Deployment:Environment</c> is exactly
/// <c>dev</c> or <c>uat</c> (the name each environment's stack sets; never prod), and the endpoint is an https Azure Cosmos account address
/// (<c>https://&lt;account&gt;.documents.azure.com</c>). Each stack sets the first two on its seed job only.</item>
/// </list>
/// Anything else is refused: another environment name, a missing or differently spelled switch, plain http, or any other host. The switch alone is not enough, and
/// neither is the environment name alone.
/// </summary>
public static class SeedTarget
{
    public const string AllowDeployedSetting = "Seed:AllowDeployed";
    public const string DeploymentEnvironmentSetting = "Deployment:Environment";

    /// <summary>The only deployed environments the seed may write to. Production is never one of them.</summary>
    public static readonly IReadOnlyList<string> SeedableEnvironments = ["dev", "uat"];

    private const string CosmosHostSuffix = ".documents.azure.com";

    public static SeedTargetDecision Decide(string? connectionString, string? allowDeployed, string? deploymentEnvironment)
    {
        var endpoint = connectionString?.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(p => p.StartsWith("AccountEndpoint=", StringComparison.OrdinalIgnoreCase))?["AccountEndpoint=".Length..];
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
            return Refuse("the connection string has no AccountEndpoint address");
        if (uri.IsLoopback)
            return new SeedTargetDecision(SeedTargetKind.LocalEmulator);

        const string Local = "The seed is for the local emulator, or a deployed dev or uat environment when its seed job sets "
            + AllowDeployedSetting + "=true and " + DeploymentEnvironmentSetting + "=dev or uat";
        if (!string.Equals(allowDeployed, "true", StringComparison.Ordinal))
            return Refuse($"the Cosmos endpoint is not a loopback address and {AllowDeployedSetting} is not set. {Local}.");
        if (deploymentEnvironment is null || !SeedableEnvironments.Contains(deploymentEnvironment, StringComparer.Ordinal))
            return Refuse($"{DeploymentEnvironmentSetting} is '{deploymentEnvironment ?? "(none)"}', and only 'dev' or 'uat' may be seeded. {Local}.");
        var host = uri.Host;
        var account = host.EndsWith(CosmosHostSuffix, StringComparison.OrdinalIgnoreCase) ? host[..^CosmosHostSuffix.Length] : "";
        if (uri.Scheme != Uri.UriSchemeHttps || account.Length == 0 || account.Contains('.') || !uri.IsDefaultPort && uri.Port != 443)
            return Refuse($"the endpoint is not an https Azure Cosmos account address (https://<account>{CosmosHostSuffix}).");
        return new SeedTargetDecision(SeedTargetKind.Deployed, Environment: deploymentEnvironment);
    }

    private static SeedTargetDecision Refuse(string reason) => new(SeedTargetKind.Refused, reason);
}

namespace BakeryMarketplace.Seed;

/// <summary>Where the seed may write, and how: the local emulator, or the deployed dev environment's Cosmos account.</summary>
public enum SeedTargetKind
{
    Refused,
    LocalEmulator,
    DeployedDev,
}

/// <summary>The decision on a seed target, with the reason when it is refused.</summary>
public sealed record SeedTargetDecision(SeedTargetKind Kind, string? Reason = null)
{
    public bool Allowed => Kind != SeedTargetKind.Refused;
}

/// <summary>
/// The seed's guard on where it writes (register 224, approved by the lead 2026-11-20). The seed is fixture data with fixed ids and a vendor verification that stands
/// in for the admin flow, so it must never reach a real customer's database. It is allowed in two cases only:
/// <list type="bullet">
/// <item>a loopback endpoint (the local emulator), as before;</item>
/// <item>the deployed dev environment, when all three hold: <c>Seed:AllowDeployedDev</c> is exactly <c>true</c>, <c>Deployment:Environment</c> is exactly <c>dev</c>
/// (the name only the dev stack sets, the one the chaos guard reads, ADR-0024), and the endpoint is an https Azure Cosmos account address
/// (<c>https://&lt;account&gt;.documents.azure.com</c>). The dev stack sets the first two on the seed job only.</item>
/// </list>
/// Anything else is refused: another environment name, a missing or differently spelled switch, plain http, or any other host. The switch alone is not enough, and
/// neither is the environment name alone.
/// </summary>
public static class SeedTarget
{
    public const string AllowDeployedDevSetting = "Seed:AllowDeployedDev";
    public const string DeploymentEnvironmentSetting = "Deployment:Environment";

    private const string CosmosHostSuffix = ".documents.azure.com";

    public static SeedTargetDecision Decide(string? connectionString, string? allowDeployedDev, string? deploymentEnvironment)
    {
        var endpoint = connectionString?.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(p => p.StartsWith("AccountEndpoint=", StringComparison.OrdinalIgnoreCase))?["AccountEndpoint=".Length..];
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
            return Refuse("the connection string has no AccountEndpoint address");
        if (uri.IsLoopback)
            return new SeedTargetDecision(SeedTargetKind.LocalEmulator);

        const string Local = "The seed is for the local emulator, or the deployed dev environment when its seed job sets "
            + AllowDeployedDevSetting + "=true and " + DeploymentEnvironmentSetting + "=dev";
        if (!string.Equals(allowDeployedDev, "true", StringComparison.Ordinal))
            return Refuse($"the Cosmos endpoint is not a loopback address and {AllowDeployedDevSetting} is not set. {Local}.");
        if (!string.Equals(deploymentEnvironment, "dev", StringComparison.Ordinal))
            return Refuse($"{DeploymentEnvironmentSetting} is '{deploymentEnvironment ?? "(none)"}', and only 'dev' may be seeded. {Local}.");
        var host = uri.Host;
        var account = host.EndsWith(CosmosHostSuffix, StringComparison.OrdinalIgnoreCase) ? host[..^CosmosHostSuffix.Length] : "";
        if (uri.Scheme != Uri.UriSchemeHttps || account.Length == 0 || account.Contains('.') || !uri.IsDefaultPort && uri.Port != 443)
            return Refuse($"the endpoint is not an https Azure Cosmos account address (https://<account>{CosmosHostSuffix}).");
        return new SeedTargetDecision(SeedTargetKind.DeployedDev);
    }

    private static SeedTargetDecision Refuse(string reason) => new(SeedTargetKind.Refused, reason);
}

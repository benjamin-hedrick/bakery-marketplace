using Microsoft.Extensions.Configuration;

namespace BakeryMarketplace.Auth;

/// <summary>
/// The start-up rule for running the mock issuer outside a developer machine (WI-DEP-001, register item 102, approved 2026-10-31).
/// The host still refuses to start in Production unless a named switch allows it, and the switch is only honoured on safe terms:
/// an https issuer, a list of roles that may log in (Customer only by default), and, for any other role, an explicit statement that the
/// ingress is restricted to an IP allow-list. Outside Production nothing changes: every mock user is offered, as before.
/// </summary>
public static class MockOidcDeployment
{
    public const string AllowDeployedDevKey = "MockOidc:AllowDeployedDev";
    public const string AllowedRolesKey = "MockOidc:AllowedRoles";
    public const string IngressRestrictedKey = "MockOidc:IngressRestricted";

    private static readonly string[] KnownRoles = ["Customer", "Vendor", "Admin"];

    /// <summary>
    /// Returns the roles whose users may log in (null = all, the local default), or throws when the settings are not safe for Production.
    /// </summary>
    public static IReadOnlyCollection<string>? Resolve(IConfiguration configuration, bool isProduction)
    {
        var configured = configuration.GetSection(AllowedRolesKey).Get<string[]>() is { Length: > 0 } roles ? roles : null;
        if (configured is not null)
        {
            var unknown = configured.Where(r => !KnownRoles.Contains(r, StringComparer.OrdinalIgnoreCase)).ToArray();
            if (unknown.Length > 0)
                throw new InvalidOperationException($"{AllowedRolesKey} names an unknown role ({string.Join(", ", unknown)}). Known roles: {string.Join(", ", KnownRoles)}.");
        }

        if (!isProduction) return configured;

        if (!configuration.GetValue<bool>(AllowDeployedDevKey))
        {
            throw new InvalidOperationException(
                "The mock OIDC issuer refuses to start in the Production environment. " +
                $"Set ASPNETCORE_ENVIRONMENT=Development for local use. A deployed dev environment must set {AllowDeployedDevKey}=true, " +
                "an https MockOidc:Issuer, and (for any role but Customer) " + IngressRestrictedKey + "=true; never use it for a real environment.");
        }

        var issuer = configuration["MockOidc:Issuer"];
        if (!Uri.TryCreate(issuer, UriKind.Absolute, out var issuerUri) || issuerUri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("A deployed mock issuer needs an https MockOidc:Issuer (the public address of the host).");

        var allowed = configured ?? ["Customer"];
        var privileged = allowed.Where(r => !string.Equals(r, "Customer", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (privileged.Length > 0 && !configuration.GetValue<bool>(IngressRestrictedKey))
        {
            throw new InvalidOperationException(
                $"Roles other than Customer ({string.Join(", ", privileged)}) may log in only when the ingress is restricted to an IP allow-list " +
                $"and {IngressRestrictedKey}=true says so.");
        }

        return allowed;
    }
}

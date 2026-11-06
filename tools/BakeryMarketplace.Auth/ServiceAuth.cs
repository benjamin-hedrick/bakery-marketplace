using System.Security.Claims;

namespace BakeryMarketplace.Auth;

/// <summary>
/// App roles that identify a calling <em>service</em> rather than a user (ADR-0018). They travel in the <c>roles</c> claim, the way
/// Entra issues application permissions, and are named <c>&lt;Resource&gt;.&lt;Action&gt;</c>.
/// </summary>
public static class ServiceRoles
{
    /// <summary>Reserve and release stock on <c>catalog-service</c> (ADR-0017).</summary>
    public const string StockReserve = "Stock.Reserve";
}

/// <summary>Authorization policy names for service callers. The user policies (<c>VendorRole</c> and so on) are unchanged.</summary>
public static class ServicePolicies
{
    public const string StockReserve = "ServiceStockReserve";
}

/// <summary>Reads the identity of an app-only (client credentials) caller from a validated token.</summary>
public static class ServiceCaller
{
    private static readonly string[] ClientIdClaimTypes = ["client_id", "azp", "appid"];

    /// <summary>
    /// True for an app-only token: <c>idtyp=app</c> and a client identity. A user token never has <c>idtyp=app</c>, so a user
    /// who somehow carried a service role still would not pass the service policies.
    /// </summary>
    public static bool IsAppOnly(ClaimsPrincipal user) =>
        user.HasClaim("idtyp", "app") && ClientId(user) is not null;

    /// <summary>The calling client's id: <c>client_id</c> (mock issuer), else <c>azp</c> or <c>appid</c> (Entra). Safe to log; it is not a secret.</summary>
    public static string? ClientId(ClaimsPrincipal user) =>
        ClientIdClaimTypes
            .Select(type => user.FindFirst(type)?.Value)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}

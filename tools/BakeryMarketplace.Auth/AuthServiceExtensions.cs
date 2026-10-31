using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Extension methods for wiring up the shared authentication/authorization middleware.
/// See ADR-0006 for the auth design: JWT bearer validation + two-layer authorization
/// (coarse role check + resource-ownership check).
///
/// Authority and Audience are config-driven, so this middleware works identically against
/// any OIDC-compliant issuer (Entra External ID, the local mock OIDC stub, etc.) — swapping
/// the provider is a config change, not a code change. See ADR-0006 amendment note.
/// </summary>
public static class AuthServiceExtensions
{
    /// <summary>
    /// Registers JWT bearer authentication and role-based authorization policies.
    /// Expects the following config keys:
    /// <list type="bullet">
    ///   <item><description><c>Auth:Authority</c> — the OIDC issuer URL (Entra External ID or local mock)</description></item>
    ///   <item><description><c>Auth:Audience</c> — the expected audience claim</description></item>
    ///   <item><description><c>Auth:Audiences</c> — optional further accepted audiences (a list), for example a service API's own</description></item>
    /// </list>
    /// A token is valid when its audience is any of these. Service (client credentials) callers are authorized by the
    /// <see cref="ServicePolicies"/> policies, which need an app-only token with the matching app role (ADR-0018).
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">App configuration supplying <c>Auth:Authority</c> and <c>Auth:Audience</c>.</param>
    /// <param name="requireHttpsMetadata">
    /// Whether the Authority URL must use HTTPS. Defaults to <c>true</c> (production).
    /// Set to <c>false</c> only in integration tests where the mock OIDC issuer runs on a
    /// plain-HTTP <c>TestServer</c> — this is the config-driven local-dev swap posture described
    /// in ADR-0006; it is not a runtime fallback.
    /// </param>
    public static IServiceCollection AddBakeryAuth(
        this IServiceCollection services,
        IConfiguration configuration,
        bool requireHttpsMetadata = true)
    {
        var audiences = new List<string>();
        if (!string.IsNullOrWhiteSpace(configuration["Auth:Audience"])) audiences.Add(configuration["Auth:Audience"]!);
        audiences.AddRange(configuration.GetSection("Auth:Audiences").Get<string[]>() ?? []);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = configuration["Auth:Authority"];
                // Where to fetch the discovery document when that differs from the issuer string (the issuer is a name, not always an address
                // this process can reach: a container network, or a tenant whose metadata lives at another host). Unset: Authority + /.well-known.
                if (!string.IsNullOrWhiteSpace(configuration["Auth:MetadataAddress"]))
                    options.MetadataAddress = configuration["Auth:MetadataAddress"];
                options.Audience = configuration["Auth:Audience"];
                options.RequireHttpsMetadata = requireHttpsMetadata;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Auth:Authority"],
                    ValidateAudience = true,
                    ValidAudiences = audiences.Distinct(StringComparer.Ordinal).ToList(),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(2)
                };
            });

        services.AddAuthorization(options =>
        {
            options.AddPolicy("VendorRole", policy =>
                policy.RequireClaim("roles", "Vendor"));

            options.AddPolicy("AdminRole", policy =>
                policy.RequireClaim("roles", "Admin"));

            options.AddPolicy("CustomerRole", policy =>
                policy.RequireClaim("roles", "Customer"));

            // A calling service, not a user (ADR-0018): the app role AND an app-only token (idtyp=app plus a client id).
            options.AddPolicy(ServicePolicies.StockReserve, policy => policy
                .RequireClaim("roles", ServiceRoles.StockReserve)
                .RequireAssertion(context => ServiceCaller.IsAppOnly(context.User)));
        });

        services.AddSingleton<IResourceOwnershipChecker, ResourceOwnershipChecker>();

        return services;
    }
}

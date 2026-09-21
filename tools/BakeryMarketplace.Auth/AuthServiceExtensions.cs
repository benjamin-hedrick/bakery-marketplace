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
    /// </list>
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
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = configuration["Auth:Authority"];
                options.Audience = configuration["Auth:Audience"];
                options.RequireHttpsMetadata = requireHttpsMetadata;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Auth:Authority"],
                    ValidateAudience = true,
                    ValidAudience = configuration["Auth:Audience"],
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
        });

        services.AddSingleton<IResourceOwnershipChecker, ResourceOwnershipChecker>();

        return services;
    }
}

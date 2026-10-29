using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Cross-origin access for the local mock issuer, for the browser app only. A real identity provider answers the token endpoint's
/// cross-origin calls for a public client; the app does the code exchange itself so that the Next.js server never holds a user token
/// (ADR-0012, ADR-0006). Allowed origins are exact (scheme, host, port), never a wildcard, and credentials are never allowed.
/// Dev-only, like the issuer itself.
/// </summary>
public static class MockOidcCors
{
    /// <summary>The origins a local web app runs on unless configured otherwise.</summary>
    public static readonly string[] DefaultOrigins = ["http://localhost:3000"];

    public static IApplicationBuilder UseMockOidcBrowserCors(this IApplicationBuilder app, IEnumerable<string> allowedOrigins)
    {
        var allowed = allowedOrigins.Select(Validate).ToHashSet(StringComparer.Ordinal);

        return app.Use(async (context, next) =>
        {
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.Length == 0 || !allowed.Contains(origin))
            {
                await next();
                return;
            }

            context.Response.Headers.AccessControlAllowOrigin = origin;
            context.Response.Headers.Append("Vary", "Origin");

            if (HttpMethods.IsOptions(context.Request.Method) && context.Request.Headers.ContainsKey("Access-Control-Request-Method"))
            {
                context.Response.Headers.AccessControlAllowMethods = "GET, POST";
                context.Response.Headers.AccessControlAllowHeaders = "content-type";
                context.Response.Headers.AccessControlMaxAge = "600";
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            await next();
        });
    }

    /// <summary>An origin is a scheme, a host and optionally a port, and nothing else.</summary>
    private static string Validate(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.UserInfo.Length > 0
            || origin.EndsWith('/')) // a wildcard never parses as a URI, so "*" and "http://*.example" are rejected above
        {
            throw new ArgumentException($"'{origin}' is not an origin (scheme://host[:port]).", nameof(origin));
        }
        return origin;
    }
}

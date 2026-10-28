using BakeryMarketplace.Secrets;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth;

/// <summary>Wiring for a service that calls other services with the client credentials grant (ADR-0018).</summary>
public static class ServiceAuthExtensions
{
    public const string TokenHttpClientName = "bakery-service-auth-token";

    /// <summary>
    /// Registers the token provider from configuration (section <paramref name="sectionName"/>, default <c>ServiceAuth</c>:
    /// <c>TokenEndpoint</c>, <c>ClientId</c>, <c>Scope</c>, <c>ClientSecret</c>). A missing or malformed value stops the service at
    /// startup (ADR-0007). This registers the secret credential; a federated assertion supplier is added with phase 2 of WI-AUTH-006.
    /// </summary>
    public static IServiceCollection AddBakeryServiceAuth(
        this IServiceCollection services, IConfiguration configuration, string sectionName = "ServiceAuth")
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        SecretValidator.ValidateUriSecret(configuration, $"{sectionName}:TokenEndpoint");
        SecretValidator.ValidateRequiredSecrets(configuration,
            [$"{sectionName}:ClientId", $"{sectionName}:Scope", $"{sectionName}:ClientSecret"]);

        void Bind(ClientCredentialsOptions options)
        {
            var section = configuration.GetSection(sectionName);
            options.TokenEndpoint = section["TokenEndpoint"]!;
            options.ClientId = section["ClientId"]!;
            options.Scope = section["Scope"]!;
            options.ClientSecret = section["ClientSecret"];
        }

        // Check the rules (https unless loopback, http(s) only, one credential) now, so a bad value stops the service at startup
        // instead of at the first call that needs a token.
        var checkedOptions = new ClientCredentialsOptions();
        Bind(checkedOptions);
        ClientCredentialsTokenProvider.Validate(checkedOptions);

        services.Configure<ClientCredentialsOptions>(Bind);
        services.AddHttpClient(TokenHttpClientName);
        services.AddSingleton(sp => new ClientCredentialsTokenProvider(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient(TokenHttpClientName),
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<ClientCredentialsOptions>>(),
            sp.GetService<TimeProvider>()));
        services.AddTransient<ClientCredentialsHandler>();
        return services;
    }

    /// <summary>Makes a typed or named <see cref="HttpClient"/> send the service token with every request.</summary>
    public static IHttpClientBuilder AddServiceAuthHandler(this IHttpClientBuilder builder) =>
        builder.AddHttpMessageHandler<ClientCredentialsHandler>();
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace BakeryMarketplace.Auth;

/// <summary>
/// When a host may accept the local mock issuer's plain http (register item 9): the https requirement on issuer metadata and the plain-http token endpoint.
/// Only a host that runs as <c>Development</c> <em>and</em> is not a named deployment. The deployed dev stack also runs as Development (so that chaos
/// scenarios can run there, ADR-0024), but its configuration names it with <c>Deployment:Environment</c>, which only the environment's own Terraform sets,
/// so it gets the production rules. A name is never needed to stay strict: with no name and not Development the answer is also no.
/// Not a configuration switch: nothing can turn plain http on by a setting; it follows from where the process runs.
/// </summary>
public static class LocalDevelopment
{
    public const string DeploymentSetting = "Deployment:Environment";

    public static bool AllowsPlainHttp(IHostEnvironment environment, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentNullException.ThrowIfNull(configuration);
        return environment.IsDevelopment() && string.IsNullOrWhiteSpace(configuration[DeploymentSetting]);
    }
}

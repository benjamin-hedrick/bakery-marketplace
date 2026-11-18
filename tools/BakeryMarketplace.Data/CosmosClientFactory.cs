using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data;

public static class CosmosClientFactory
{
    /// <summary>
    /// Creates the Cosmos client a service uses. <paramref name="gatewayMode"/> is for the local emulator, which only works over the gateway;
    /// deployed environments keep the SDK default (direct mode).
    /// </summary>
    public static CosmosClient Create(string connectionString, bool gatewayMode)
    {
        var options = new CosmosClientOptions();
        if (gatewayMode)
        {
            options.ConnectionMode = ConnectionMode.Gateway;
            options.LimitToEndpoint = true;
        }
        return new CosmosClient(connectionString, options);
    }

    /// <summary>
    /// The read time limit a service gives its repositories when <c>Cosmos:ReadTimeoutSeconds</c> is not set (register 206): under ordering's 5 s wait
    /// for the catalog and the BFF's 5 s limit for reads, so an unreachable store is reported as such before a caller gives up.
    /// </summary>
    public const double DefaultReadTimeoutSeconds = 3;

    /// <summary>
    /// The read time limit from the <c>Cosmos:ReadTimeoutSeconds</c> setting: unset gives <see cref="DefaultReadTimeoutSeconds"/>, 0 or less turns the
    /// limit off (null). See <see cref="CosmosRepository{T}"/>: reads only, never writes.
    /// </summary>
    public static TimeSpan? ReadTimeout(double? configuredSeconds) => (configuredSeconds ?? DefaultReadTimeoutSeconds) switch
    {
        <= 0 => null,
        var seconds => TimeSpan.FromSeconds(seconds),
    };
}

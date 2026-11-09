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
}

using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Proves that <see cref="InMemoryEventTransport"/> passes the full <see cref="EventTransportContractTests"/> suite.
/// See WI-EVT-001.
/// </summary>
public sealed class InMemoryEventTransportTests : EventTransportContractTests
{
    protected override (IEventPublisher Publisher, IEventSubscriber Subscriber) CreateTransportPair()
    {
        var transport = new InMemoryEventTransport();
        return (transport, transport);
    }
}

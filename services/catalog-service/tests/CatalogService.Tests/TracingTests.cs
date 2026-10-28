using System.Diagnostics;
using System.Net;
using BakeryMarketplace.Eventing;

namespace CatalogService.Tests;

/// <summary>WI-PORT-005: the real service pipeline is traced (ADR-0016).</summary>
public sealed class TracingTests : IDisposable
{
    private readonly CatalogFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task ResponseCorrelationIdIsTheInboundTraceId_AndAnInboundCorrelationHeaderIsIgnored()
    {
        _factory.CreateClient(); // starts the host
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/catalog/listings");
        request.Headers.Add("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
        request.Headers.Add("X-Correlation-Id", "attacker-chosen");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("4bf92f3577b34da6a3ce929d0e0e4736", response.Headers.GetValues("X-Correlation-Id").Single());
    }

    [Fact]
    public async Task ServiceListensToEventConsumerSpans_AndLinksThemToThePublisher()
    {
        _factory.CreateClient(); // starts the host, which registers OpenTelemetry
        using var probe = new ActivitySource(EventTracing.ActivitySourceName);
        Assert.True(probe.HasListeners(), "AddBakeryTelemetry should subscribe to the event backbone's activity source");

        var consumers = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == EventTracing.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = consumers.Add,
        };
        ActivitySource.AddActivityListener(listener);
        using var publisher = new Activity("publisher-request").Start();

        await _factory.VerifyVendorAsync($"vendor-{Guid.NewGuid():N}");

        var consumer = Assert.Single(consumers, a => a.OperationName == "process VendorVerified");
        Assert.Equal(ActivityKind.Consumer, consumer.Kind);
        Assert.NotEqual(publisher.TraceId, consumer.TraceId);
        Assert.Equal(publisher.TraceId, Assert.Single(consumer.Links).Context.TraceId);
    }
}

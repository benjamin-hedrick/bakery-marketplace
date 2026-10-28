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
    public async Task RequestSpansDoNotCarryQueryStringValues()
    {
        _factory.CreateClient(); // starts the host, which registers OpenTelemetry
        var spans = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = spans.Add,
        };
        ActivitySource.AddActivityListener(listener);

        var response = await _factory.CreateClient().GetAsync("/catalog/listings?limit=2&after=secret-cursor");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var span = Assert.Single(spans, a => a.GetTagItem("url.path") as string == "/catalog/listings");
        // The instrumentation redacts query values by default (url.query is "?limit=Redacted&after=Redacted"). This guards that
        // default: it fails if a package change or OTEL_DOTNET_EXPERIMENTAL_ASPNETCORE_DISABLE_URL_QUERY_REDACTION exposes them.
        Assert.Equal("?limit=Redacted&after=Redacted", span.GetTagItem("url.query"));
        Assert.DoesNotContain(span.TagObjects, t => t.Value is string s && s.Contains("secret-cursor"));
    }

    [Fact]
    public async Task ServiceListensToEventConsumerSpans_AndLinksThemToThePublisher()
    {
        _factory.CreateClient(); // starts the host, which registers OpenTelemetry
        using var probe = new ActivitySource(EventTracing.ActivitySourceName);
        Assert.True(probe.HasListeners(), "AddBakeryTelemetry should subscribe to the event backbone's activity source");

        // The listener is process-wide and test classes run in parallel, so collect thread-safely and pick this test's span by its link.
        var consumers = new System.Collections.Concurrent.ConcurrentBag<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == EventTracing.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = consumers.Add,
        };
        ActivitySource.AddActivityListener(listener);
        using var publisher = new Activity("publisher-request").Start();

        await _factory.VerifyVendorAsync($"vendor-{Guid.NewGuid():N}");

        var consumer = Assert.Single(consumers, a => a.OperationName == "process VendorVerified"
            && a.Links.Any(l => l.Context.TraceId == publisher.TraceId));
        Assert.Equal(ActivityKind.Consumer, consumer.Kind);
        Assert.NotEqual(publisher.TraceId, consumer.TraceId);
        Assert.Equal(publisher.TraceId, Assert.Single(consumer.Links).Context.TraceId);
    }
}

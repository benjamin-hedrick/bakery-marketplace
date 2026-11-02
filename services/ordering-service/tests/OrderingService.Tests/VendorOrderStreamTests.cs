using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using OrderingService.Domain;
using OrderingService.Persistence;
using OrderingService.Streaming;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// WI-QUE-003 step 2 (ADR-0021): the vendor order stream endpoint, the hub behind it and the projection's publish. The service is hosted in-process with
/// the in-memory broadcast; the Redis broadcast across two hosts is step 3. Streams are read as the text they are.
/// </summary>
public sealed partial class VendorOrderStreamTests
{
    private const string Url = "/ordering/vendor/orders/stream";
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    /// <summary>One hosted service with its fake catalog; disposing stops both.</summary>
    private sealed class Rig : IAsyncDisposable
    {
        private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
        private readonly FakeCatalogServer _catalog;
        public OrderingFactory Factory { get; }
        public CapturedLogs Logs { get; } = new();

        private readonly (string Key, string Value)[] _settings;
        private readonly List<OrderingFactory> _others = [];

        public Rig(params (string Key, string Value)[] settings) : this(null, settings) { }

        public Rig(Action<IServiceCollection>? configureServices, params (string Key, string Value)[] settings)
        {
            _settings = settings;
            _catalog = new FakeCatalogServer(_secret);
            Factory = new OrderingFactory(_catalog, _secret, extraSettings: settings.ToDictionary(s => s.Key, s => s.Value), logs: Logs, configureServices: configureServices);
        }

        /// <summary>Another instance of the service: the same catalog and settings, its own process state (its own in-memory stores).</summary>
        public OrderingFactory StartOtherHost()
        {
            var other = new OrderingFactory(_catalog, _secret, extraSettings: _settings.ToDictionary(s => s.Key, s => s.Value));
            _others.Add(other);
            _ = other.CreateClient(); // starts the host and its subscriptions
            return other;
        }

        public HttpClient Customer(string id = "customer-1") => Factory.CustomerClient(id);
        public HttpClient Vendor(string id = Seed.Vendor) => Factory.ClientWithRole(id, "Vendor");

        public async Task<string> PlaceOrderAsync(string vendorId = Seed.Vendor)
        {
            using var customer = Customer();
            var response = await PostCheckout(customer, new
            {
                vendorId,
                lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
                pickupWindow = new { start = Seed.WindowStart, end = Seed.WindowEnd },
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetString()!;
        }

        public async ValueTask DisposeAsync()
        {
            foreach (var other in _others) await other.DisposeAsync();
            await Factory.DisposeAsync();
            await _catalog.DisposeAsync();
        }
    }

    private sealed class CapturedLogs : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _lines = new();
        public string[] Lines => _lines.ToArray();
        public ILogger CreateLogger(string categoryName) => new Capture(_lines);
        public void Dispose() { }

        private sealed class Scope : IDisposable
        {
            public static readonly Scope Instance = new();
            public void Dispose() { }
        }

        private sealed class Capture(ConcurrentQueue<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => Scope.Instance;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                lines.Enqueue(formatter(state, exception) + (exception is null ? "" : " " + exception));
        }
    }

    private sealed record Frame(string? Event, string? Id, string? Data, string[] Comments);

    /// <summary>An open stream read frame by frame.</summary>
    private sealed class Sse : IDisposable
    {
        private readonly HttpResponseMessage _response;
        private readonly StreamReader _reader;
        public HttpStatusCode Status => _response.StatusCode;
        public HttpResponseMessage Response => _response;

        private Sse(HttpResponseMessage response, StreamReader reader)
        {
            _response = response;
            _reader = reader;
        }

        public static async Task<Sse> OpenAsync(HttpClient client)
        {
            var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Get, Url), HttpCompletionOption.ResponseHeadersRead);
            var reader = response.StatusCode == HttpStatusCode.OK ? new StreamReader(await response.Content.ReadAsStreamAsync()) : StreamReader.Null;
            return new Sse(response, reader);
        }

        /// <summary>The next frame, or null when the stream has ended. Fails the test if nothing arrives in time.</summary>
        public async Task<Frame?> NextAsync(TimeSpan? timeout = null)
        {
            using var cts = new CancellationTokenSource(timeout ?? Wait);
            string? ev = null, id = null, data = null;
            var comments = new List<string>();
            var any = false;
            while (true)
            {
                string? line;
                try { line = await _reader.ReadLineAsync(cts.Token); }
                catch (OperationCanceledException) { throw new TimeoutException("No frame arrived in time."); }
                if (line is null) return any ? new Frame(ev, id, data, [.. comments]) : null;
                if (line.Length == 0)
                {
                    if (!any) continue;
                    return new Frame(ev, id, data, [.. comments]);
                }
                any = true;
                if (line.StartsWith(':')) comments.Add(line[1..].Trim());
                else if (line.StartsWith("event:", StringComparison.Ordinal)) ev = line[6..].Trim();
                else if (line.StartsWith("id:", StringComparison.Ordinal)) id = line[3..].Trim();
                else if (line.StartsWith("data:", StringComparison.Ordinal)) data = line[5..].Trim();
            }
        }

        /// <summary>The next frame that is an event of the given name, skipping comments and other events.</summary>
        public async Task<Frame> NextEventAsync(string name, TimeSpan? timeout = null)
        {
            while (true)
            {
                var frame = await NextAsync(timeout) ?? throw new InvalidOperationException($"The stream ended before a '{name}' event.");
                if (frame.Event == name) return frame;
            }
        }

        public void Dispose()
        {
            _reader.Dispose();
            _response.Dispose();
        }
    }

    private static JsonElement Json(Frame frame) => JsonDocument.Parse(frame.Data!).RootElement.Clone();

    // ---- access

    [Fact]
    public async Task AnAnonymousCallerIsRefusedAndACustomerIsForbidden()
    {
        await using var rig = new Rig();
        using var anonymous = rig.Factory.CreateClient();
        using var customer = rig.Customer();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync(Url)).StatusCode);
    }

    [Fact]
    public async Task ATokenThatIsAlreadyPastItsExpiryOpensNoStream()
    {
        await using var rig = new Rig();
        // Expired a minute ago but inside the validation clock skew (2 minutes), so the middleware accepts it: the endpoint must still refuse.
        using var client = rig.Factory.ClientWithToken(rig.Factory.TokenFor(TimeSpan.FromMinutes(-1), Seed.Vendor, "Vendor"));

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Url)).StatusCode);
    }

    // ---- delivery

    [Fact]
    public async Task AnOrderTheCustomerPlacesIsPushedToTheVendorsStreamWithNamesAndASequence()
    {
        await using var rig = new Rig();
        using var vendor = rig.Vendor();
        using var stream = await Sse.OpenAsync(vendor);
        Assert.Equal(HttpStatusCode.OK, stream.Status);
        Assert.Equal("text/event-stream", stream.Response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("no-store", stream.Response.Headers.CacheControl?.ToString() ?? "");
        var hello = await stream.NextAsync();
        Assert.Contains("connected", hello!.Comments);

        var id = await rig.PlaceOrderAsync();

        var frame = await stream.NextEventAsync("order");
        var order = Json(frame);
        Assert.Equal(id, order.GetProperty("id").GetString());
        Assert.Equal("Placed", order.GetProperty("status").GetString());
        Assert.Equal($"{id}:{order.GetProperty("lastSequence").GetInt64()}", frame.Id);
        Assert.True(order.GetProperty("lastSequence").GetInt64() > 0);
        Assert.Equal("Country Sourdough", order.GetProperty("lines")[0].GetProperty("listingName").GetString());
        Assert.False(order.TryGetProperty("customerId", out _)); // the vendor needs the order, not who placed it
    }

    [Fact]
    public async Task AChangeByTheVendorIsPushedWithAHigherSequence()
    {
        await using var rig = new Rig();
        using var vendor = rig.Vendor();
        using var stream = await Sse.OpenAsync(vendor);
        var id = await rig.PlaceOrderAsync();
        var placed = Json(await stream.NextEventAsync("order"));

        Assert.Equal(HttpStatusCode.OK, (await vendor.PostAsync($"/ordering/orders/{id}/confirm", null)).StatusCode);

        var confirmed = Json(await stream.NextEventAsync("order"));
        Assert.Equal("Confirmed", confirmed.GetProperty("status").GetString());
        Assert.True(confirmed.GetProperty("lastSequence").GetInt64() > placed.GetProperty("lastSequence").GetInt64());
    }

    [Fact]
    public async Task AnotherVendorsOrdersNeverReachTheStream()
    {
        await using var rig = new Rig();
        using var vendor = rig.Vendor();
        using var other = rig.Vendor("vendor-other-002");
        using var mine = await Sse.OpenAsync(vendor);
        using var theirs = await Sse.OpenAsync(other);
        await mine.NextAsync();
        await theirs.NextAsync();

        var id = await rig.PlaceOrderAsync(Seed.Vendor);

        Assert.Equal(id, Json(await mine.NextEventAsync("order")).GetProperty("id").GetString());
        // Nothing for the other vendor: only its heartbeat could arrive, and the default is 15 seconds.
        await Assert.ThrowsAsync<TimeoutException>(() => theirs.NextEventAsync("order", TimeSpan.FromMilliseconds(500)));
    }

    [Fact]
    public async Task EveryStreamOfTheVendorReceivesTheChange()
    {
        await using var rig = new Rig();
        using var vendor = rig.Vendor();
        using var a = await Sse.OpenAsync(vendor);
        using var b = await Sse.OpenAsync(vendor);

        var id = await rig.PlaceOrderAsync();

        Assert.Equal(id, Json(await a.NextEventAsync("order")).GetProperty("id").GetString());
        Assert.Equal(id, Json(await b.NextEventAsync("order")).GetProperty("id").GetString());
    }

    [Fact]
    public async Task AMessageForAnotherVendorOnThisVendorsChannelIsIgnored()
    {
        await using var rig = new Rig();
        using var vendor = rig.Vendor();
        using var stream = await Sse.OpenAsync(vendor);
        await stream.NextAsync();
        var broadcast = rig.Factory.Services.GetRequiredService<IBroadcastPublisher>();
        var foreign = new VendorOrderDocument { Id = "order-x", VendorId = "vendor-other-002", Status = OrderStatus.Placed, LastSequence = 1 };

        await broadcast.PublishAsync(VendorOrderChannels.For(Seed.Vendor), Newtonsoft.Json.JsonConvert.SerializeObject(foreign));

        await Assert.ThrowsAsync<TimeoutException>(() => stream.NextEventAsync("order", TimeSpan.FromMilliseconds(500)));
    }

    // ---- keeping the stream alive and ending it

    [Fact]
    public async Task AnIdleStreamSendsHeartbeats()
    {
        await using var rig = new Rig(("VendorStream:Heartbeat", "00:00:00.200"));
        using var vendor = rig.Vendor();
        using var stream = await Sse.OpenAsync(vendor);
        await stream.NextAsync(); // connected

        var first = await stream.NextAsync();
        var second = await stream.NextAsync();

        Assert.Contains("heartbeat", first!.Comments);
        Assert.Contains("heartbeat", second!.Comments);
    }

    [Fact]
    public async Task TheStreamEndsWithAnExpiredEventWhenTheTokenExpires()
    {
        await using var rig = new Rig();
        using var client = rig.Factory.ClientWithToken(rig.Factory.TokenFor(TimeSpan.FromSeconds(2), Seed.Vendor, "Vendor"));
        using var stream = await Sse.OpenAsync(client);
        Assert.Equal(HttpStatusCode.OK, stream.Status);
        var opened = DateTimeOffset.UtcNow;

        var expired = await stream.NextEventAsync("expired");

        Assert.Equal("token", Json(expired).GetProperty("reason").GetString());
        Assert.InRange((DateTimeOffset.UtcNow - opened).TotalSeconds, 0.5, 5); // at the token's time, not the 1 hour maximum or the validation skew
        Assert.Null(await stream.NextAsync()); // and then the connection ends
    }

    [Fact]
    public async Task TheStreamEndsAtTheMaximumAgeEvenWhenTheTokenHasLongerToLive()
    {
        await using var rig = new Rig(("VendorStream:MaxAge", "00:00:01"));
        using var vendor = rig.Vendor(); // a token valid for 10 minutes
        using var stream = await Sse.OpenAsync(vendor);

        var expired = await stream.NextEventAsync("expired");

        Assert.Equal("max-age", Json(expired).GetProperty("reason").GetString());
        Assert.Null(await stream.NextAsync());
    }

    [Fact]
    public async Task AnExpiredStreamStopsReceivingAndFreesItsSubscription()
    {
        await using var rig = new Rig(("VendorStream:MaxAge", "00:00:00.500"));
        using var vendor = rig.Vendor();
        var broadcast = (InMemoryBroadcast)rig.Factory.Services.GetRequiredService<IBroadcastSubscriber>();
        using var stream = await Sse.OpenAsync(vendor);
        Assert.Equal(1, broadcast.SubscriberCount(VendorOrderChannels.For(Seed.Vendor)));

        await stream.NextEventAsync("expired");
        while (await stream.NextAsync() is not null) { }
        await WaitUntilAsync(() => rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>().OpenCount == 0);

        Assert.Equal(0, broadcast.SubscriberCount(VendorOrderChannels.For(Seed.Vendor)));
    }

    // ---- limits

    [Fact]
    public async Task AVendorsSixthStreamClosesTheOldest()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerVendor", "2"));
        using var vendor = rig.Vendor();
        using var first = await Sse.OpenAsync(vendor);
        using var second = await Sse.OpenAsync(vendor);
        using var third = await Sse.OpenAsync(vendor);

        var closed = await first.NextEventAsync("closed");

        Assert.Equal("replaced", Json(closed).GetProperty("reason").GetString());
        Assert.Null(await first.NextAsync());
        var id = await rig.PlaceOrderAsync();
        Assert.Equal(id, Json(await second.NextEventAsync("order")).GetProperty("id").GetString());
        Assert.Equal(id, Json(await third.NextEventAsync("order")).GetProperty("id").GetString());
        Assert.Equal(2, rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>().OpenCount);
    }

    [Fact]
    public async Task AnInstanceAtItsLimitRefusesANewStreamWithRetryAfter()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerInstance", "1"));
        using var vendor = rig.Vendor();
        using var other = rig.Vendor("vendor-other-002");
        using var first = await Sse.OpenAsync(vendor);

        using var refused = await Sse.OpenAsync(other);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, refused.Status);
        Assert.True(refused.Response.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task ACapacityFreedByAClosedStreamCanBeUsedAgain()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerInstance", "1"));
        using var vendor = rig.Vendor();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        var first = await Sse.OpenAsync(vendor);
        first.Dispose(); // the client goes away
        await WaitUntilAsync(() => hub.OpenCount == 0);

        using var again = await Sse.OpenAsync(vendor);

        Assert.Equal(HttpStatusCode.OK, again.Status);
    }

    [Fact]
    public async Task AClientThatCannotKeepUpIsDroppedAndTheOthersAreNot()
    {
        await using var rig = new Rig(("VendorStream:QueueCapacity", "2"));
        _ = rig.Factory.CreateClient(); // start the host
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        var publisher = rig.Factory.Services.GetRequiredService<IBroadcastPublisher>();
        var slow = await hub.OpenAsync(Seed.Vendor, CancellationToken.None);
        var reader = await hub.OpenAsync(Seed.Vendor, CancellationToken.None);
        Assert.NotNull(slow);
        Assert.NotNull(reader);

        for (var i = 1; i <= 4; i++)
        {
            var doc = new VendorOrderDocument { Id = $"order-{i}", VendorId = Seed.Vendor, Status = OrderStatus.Placed, LastSequence = i };
            await publisher.PublishAsync(VendorOrderChannels.For(Seed.Vendor), Newtonsoft.Json.JsonConvert.SerializeObject(doc));
            await WaitUntilAsync(() => reader!.Queue.Reader.Count > 0 || reader.Closed.IsCancellationRequested);
            reader!.Queue.Reader.TryRead(out _); // the reader keeps up; the other never reads
        }

        await WaitUntilAsync(() => slow!.Closed.IsCancellationRequested);
        Assert.Equal("slow-client", slow!.CloseReason);
        Assert.False(reader!.Closed.IsCancellationRequested);
        await hub.ReleaseAsync(slow);
        await hub.ReleaseAsync(reader);
        Assert.Equal(0, hub.OpenCount);
    }

    // ---- the projection's publish

    [Fact]
    public async Task APublishThatFailsDoesNotFailTheEventOrLoseTheReadModel()
    {
        var documents = new BakeryMarketplace.Data.FakeRepository<VendorOrderDocument>(d => d.Id);
        var projection = new VendorOrderProjection(documents, NullLogger<VendorOrderProjection>.Instance, new ThrowingPublisher());

        await projection.OnPlacedAsync(
            new DomainEventEnvelope<OrderPlacedPayload>(
                Guid.NewGuid(), OrderEventTypes.Placed, 1, DateTimeOffset.UtcNow, "Order", "order-1", 1,
                new OrderPlacedPayload("order-1", "customer-1", Seed.Vendor, [new LineItemPayload("l1", [], 1)], 500, "USD")),
            CancellationToken.None);

        var saved = await documents.GetAsync("order-1", Seed.Vendor);
        Assert.NotNull(saved);
        Assert.Equal(1, saved.LastSequence);
    }

    private sealed class ThrowingPublisher : IBroadcastPublisher
    {
        public Task PublishAsync(string channel, string message, CancellationToken ct = default) => throw new InvalidOperationException("Redis is down");
    }

    // ---- the live channel is unavailable

    [Fact]
    public async Task AStreamCannotBeOpenedWhenTheLiveChannelIsDownSoTheScreenKeepsPolling()
    {
        await using var rig = new Rig(services => services.Replace(ServiceDescriptor.Singleton<IBroadcastSubscriber>(new DownSubscriber())));
        using var vendor = rig.Vendor();

        using var stream = await Sse.OpenAsync(vendor);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, stream.Status);
        Assert.True(stream.Response.Headers.Contains("Retry-After"));
        Assert.Equal(0, rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>().OpenCount);
        // The list is still served: polling is the fallback.
        Assert.Equal(HttpStatusCode.OK, (await vendor.GetAsync("/ordering/vendor/orders")).StatusCode);
    }

    private sealed class DownSubscriber : IBroadcastSubscriber
    {
        public Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default) =>
            throw new InvalidOperationException("Redis is down");
    }

    // ---- what is logged

    [Fact]
    public async Task NoLogLineHoldsTheTokenWhileAStreamOpensDeliversAndCloses()
    {
        await using var rig = new Rig();
        var token = rig.Factory.TokenFor(TimeSpan.FromMinutes(5), Seed.Vendor, "Vendor");
        using var client = rig.Factory.ClientWithToken(token);
        using (var stream = await Sse.OpenAsync(client))
        {
            await rig.PlaceOrderAsync();
            await stream.NextEventAsync("order");
        }
        await WaitUntilAsync(() => rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>().OpenCount == 0);

        var signature = token[(token.LastIndexOf('.') + 1)..];
        var payload = token.Split('.')[1];
        Assert.DoesNotContain(rig.Logs.Lines, l => l.Contains(token) || l.Contains(signature) || l.Contains(payload));
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var until = DateTime.UtcNow + Wait;
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(20);
        Assert.True(condition(), "The condition did not become true in time.");
    }
}

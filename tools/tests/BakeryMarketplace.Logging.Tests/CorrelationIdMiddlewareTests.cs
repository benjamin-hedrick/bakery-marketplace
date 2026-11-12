using System.Diagnostics;
using BakeryMarketplace.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Logging.Tests;

public class CorrelationIdMiddlewareTests
{
    private class TestLogger<T> : ILogger<T>
    {
        public List<object?> ScopeStates { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            ScopeStates.Add(state);
            return new DummyDisposable();
        }

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) { }

        private class DummyDisposable : IDisposable
        {
            public void Dispose() { }
        }
    }

    private static string ScopeValue(TestLogger<CorrelationIdMiddleware> logger, string key)
    {
        var scope = Assert.IsAssignableFrom<IReadOnlyCollection<KeyValuePair<string, object>>>(Assert.Single(logger.ScopeStates));
        return (string)scope.Single(p => p.Key == key).Value;
    }

    [Fact]
    public async Task InvokeAsync_UsesTheCurrentActivityTraceId()
    {
        using var activity = new Activity("test-request").Start();
        var context = new DefaultHttpContext();
        var logger = new TestLogger<CorrelationIdMiddleware>();
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(context);

        var traceId = activity.TraceId.ToHexString();
        Assert.Equal(traceId, context.Response.Headers[CorrelationIdMiddleware.HeaderName]);
        Assert.Equal(traceId, context.Items[CorrelationIdMiddleware.HeaderName]);
        Assert.Equal(traceId, ScopeValue(logger, "TraceId"));
        Assert.Equal(traceId, ScopeValue(logger, "CorrelationId"));
    }

    [Fact]
    public async Task InvokeAsync_IgnoresAnInboundCorrelationIdHeader()
    {
        using var activity = new Activity("test-request").Start();
        var context = new DefaultHttpContext();
        context.Request.Headers[CorrelationIdMiddleware.HeaderName] = "attacker-chosen fake-log-line";
        var logger = new TestLogger<CorrelationIdMiddleware>();
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(context);

        Assert.Equal(activity.TraceId.ToHexString(), context.Response.Headers[CorrelationIdMiddleware.HeaderName]);
        Assert.Equal(activity.TraceId.ToHexString(), ScopeValue(logger, "CorrelationId"));
    }

    [Fact]
    public async Task InvokeAsync_GeneratesATraceIdWhenThereIsNoActivity()
    {
        Activity.Current = null;
        var context = new DefaultHttpContext();
        var logger = new TestLogger<CorrelationIdMiddleware>();
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(context);

        var generated = context.Response.Headers[CorrelationIdMiddleware.HeaderName].ToString();
        Assert.Matches("^[0-9a-f]{32}$", generated);
        Assert.NotEqual(new string('0', 32), generated);
        Assert.Equal(generated, ScopeValue(logger, "TraceId"));
    }
}

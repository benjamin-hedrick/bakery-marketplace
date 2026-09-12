using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using BakeryMarketplace.Logging;

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

    [Fact]
    public async Task InvokeAsync_PreservesExistingCorrelationIdHeader()
    {
        const string customCorrelationId = "custom-corr-id-12345";
        var context = new DefaultHttpContext();
        context.Request.Headers[CorrelationIdMiddleware.HeaderName] = customCorrelationId;

        var logger = new TestLogger<CorrelationIdMiddleware>();
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(context);

        Assert.Equal(customCorrelationId, context.Response.Headers[CorrelationIdMiddleware.HeaderName]);
        Assert.Equal(customCorrelationId, context.Items[CorrelationIdMiddleware.HeaderName]);

        Assert.Single(logger.ScopeStates);
        var scope = Assert.IsAssignableFrom<IReadOnlyCollection<KeyValuePair<string, object>>>(logger.ScopeStates[0]);
        var pair = Assert.Single(scope);
        Assert.Equal("CorrelationId", pair.Key);
        Assert.Equal(customCorrelationId, pair.Value);
    }

    [Fact]
    public async Task InvokeAsync_GeneratesNewGuidWhenHeaderMissing()
    {
        var context = new DefaultHttpContext();
        var logger = new TestLogger<CorrelationIdMiddleware>();
        var middleware = new CorrelationIdMiddleware(_ => Task.CompletedTask, logger);

        await middleware.InvokeAsync(context);

        var generatedId = context.Response.Headers[CorrelationIdMiddleware.HeaderName].ToString();
        Assert.False(string.IsNullOrWhiteSpace(generatedId));
        Assert.True(Guid.TryParse(generatedId, out _));

        Assert.Single(logger.ScopeStates);
        var scope = Assert.IsAssignableFrom<IReadOnlyCollection<KeyValuePair<string, object>>>(logger.ScopeStates[0]);
        var pair = Assert.Single(scope);
        Assert.Equal("CorrelationId", pair.Key);
        Assert.Equal(generatedId, pair.Value);
    }
}

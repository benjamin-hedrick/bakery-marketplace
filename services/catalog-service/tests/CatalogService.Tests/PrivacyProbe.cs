using System.Diagnostics;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CatalogService.Tests;

/// <summary>
/// Records everything the hosted service writes to its logs (messages and structured values) and to its spans (names, tags and events) while a
/// test runs, so a test can show that a customer's allergen profile reached neither (NFR 3.7). A check that recorded nothing proves nothing, so
/// <see cref="AssertNothingOf"/> also fails when no span was seen.
/// </summary>
internal sealed class PrivacyProbe : IDisposable
{
    private readonly List<string> _logs = [];
    private readonly List<string> _spans = [];
    private readonly ActivityListener _listener;
    private readonly Provider _provider;

    public PrivacyProbe()
    {
        _provider = new Provider(_logs);
        _listener = new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = a =>
            {
                lock (_spans)
                {
                    _spans.Add(a.DisplayName);
                    _spans.AddRange(a.TagObjects.Select(t => $"{t.Key}={t.Value}"));
                    _spans.AddRange(a.Events.SelectMany(e => e.Tags.Select(t => $"{t.Key}={t.Value}")));
                }
            },
        };
        ActivitySource.AddActivityListener(_listener);
    }

    /// <summary>The same host with this probe attached to its logging.</summary>
    public WebApplicationFactory<Program> Attach(WebApplicationFactory<Program> factory) =>
        factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
            services.AddLogging(l => { l.SetMinimumLevel(LogLevel.Trace); l.AddProvider(_provider); })));

    public void AssertNothingOf(params string[] secrets)
    {
        lock (_logs)
        {
            foreach (var line in _logs)
                foreach (var secret in secrets)
                    Assert.False(line.Contains(secret, StringComparison.OrdinalIgnoreCase), $"'{secret}' was logged: {line}");
        }
        lock (_spans)
        {
            Assert.NotEmpty(_spans); // the listener did see the requests, so the check above means something
            foreach (var line in _spans)
                foreach (var secret in secrets)
                    Assert.False(line.Contains(secret, StringComparison.OrdinalIgnoreCase), $"'{secret}' was on a span: {line}");
        }
    }

    public void Dispose()
    {
        _listener.Dispose();
        _provider.Dispose();
    }

    private sealed class Provider(List<string> lines) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName) => new Capture(lines);
        public void Dispose() { }

        private sealed class Capture(List<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                lock (lines)
                {
                    lines.Add(formatter(state, exception) + (exception is null ? "" : " " + exception));
                    if (state is IEnumerable<KeyValuePair<string, object?>> pairs)
                        foreach (var p in pairs) lines.Add($"{p.Key}={p.Value}");
                }
            }
        }
    }
}

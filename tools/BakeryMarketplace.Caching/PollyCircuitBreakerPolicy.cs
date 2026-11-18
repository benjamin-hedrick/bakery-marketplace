using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;

namespace BakeryMarketplace.Caching;

/// <summary>
/// Polly-backed circuit breaker policy implementation.
/// Trips after <paramref name="exceptionsAllowedBeforeBreaking"/> consecutive failures,
/// stays open for <paramref name="durationOfBreak"/>, then moves to half-open to probe.
/// With a <paramref name="logger"/>, it logs each change of state once (opened, half-open, closed) instead of the callers logging every refused call
/// (register 205: a cache outage under load logged 300,915 warnings in a minute).
/// </summary>
public sealed partial class PollyCircuitBreakerPolicy : ICircuitBreakerPolicy
{
    private readonly AsyncCircuitBreakerPolicy _policy;

    public PollyCircuitBreakerPolicy(
        int exceptionsAllowedBeforeBreaking = 3,
        TimeSpan? durationOfBreak = null,
        ILogger<PollyCircuitBreakerPolicy>? logger = null)
    {
        var breakDuration = durationOfBreak ?? TimeSpan.FromSeconds(30);

        _policy = Policy
            .Handle<Exception>(ex => ex is not OperationCanceledException)
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking,
                breakDuration,
                onBreak: (exception, duration) =>
                {
                    if (logger is not null) LogOpened(logger, exception, duration.TotalSeconds);
                },
                onReset: () =>
                {
                    if (logger is not null) LogClosed(logger);
                },
                onHalfOpen: () =>
                {
                    if (logger is not null) LogHalfOpen(logger);
                });
    }

    public bool IsOpen =>
        _policy.CircuitState is CircuitState.Open or CircuitState.Isolated;

    public bool IsRefusal(Exception exception) => exception is BrokenCircuitException;

    public Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default)
    {
        return _policy.ExecuteAsync(operation, ct);
    }

    public Task<TResult> ExecuteAsync<TResult>(
        Func<CancellationToken, Task<TResult>> operation,
        CancellationToken ct = default)
    {
        return _policy.ExecuteAsync(operation, ct);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Circuit breaker opened for {Seconds} s after a primary failure; calls use the fallback until it closes")]
    private static partial void LogOpened(ILogger logger, Exception exception, double seconds);

    [LoggerMessage(Level = LogLevel.Information, Message = "Circuit breaker half-open: the next call tries the primary")]
    private static partial void LogHalfOpen(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Circuit breaker closed: the primary answered again")]
    private static partial void LogClosed(ILogger logger);
}

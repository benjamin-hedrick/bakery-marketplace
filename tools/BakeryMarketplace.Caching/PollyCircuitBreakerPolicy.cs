using Polly;
using Polly.CircuitBreaker;

namespace BakeryMarketplace.Caching;

/// <summary>
/// Polly-backed circuit breaker policy implementation.
/// Trips after <paramref name="exceptionsAllowedBeforeBreaking"/> consecutive failures,
/// stays open for <paramref name="durationOfBreak"/>, then moves to half-open to probe.
/// </summary>
public sealed class PollyCircuitBreakerPolicy : ICircuitBreakerPolicy
{
    private readonly AsyncCircuitBreakerPolicy _policy;

    public PollyCircuitBreakerPolicy(
        int exceptionsAllowedBeforeBreaking = 3,
        TimeSpan? durationOfBreak = null)
    {
        var breakDuration = durationOfBreak ?? TimeSpan.FromSeconds(30);

        _policy = Policy
            .Handle<Exception>(ex => ex is not OperationCanceledException)
            .CircuitBreakerAsync(exceptionsAllowedBeforeBreaking, breakDuration);
    }

    public bool IsOpen =>
        _policy.CircuitState is CircuitState.Open or CircuitState.Isolated;

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
}

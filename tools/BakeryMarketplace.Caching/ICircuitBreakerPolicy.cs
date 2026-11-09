namespace BakeryMarketplace.Caching;

/// <summary>
/// Circuit-breaker policy abstraction used by <see cref="ResilientCacheProvider"/>.
/// Implementations back this with Polly or a custom policy.
/// </summary>
public interface ICircuitBreakerPolicy
{
    /// <summary>
    /// Executes <paramref name="operation"/> through the circuit breaker.
    /// When the breaker is open the call is refused with the implementation's own exception (Polly's <c>BrokenCircuitException</c> for
    /// <see cref="PollyCircuitBreakerPolicy"/>), which <see cref="ResilientCacheProvider"/> treats like any other primary failure.
    /// </summary>
    Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default);

    /// <summary>
    /// Executes <paramref name="operation"/> through the circuit breaker and returns a result. An open breaker refuses the call as above.
    /// </summary>
    Task<TResult> ExecuteAsync<TResult>(Func<CancellationToken, Task<TResult>> operation, CancellationToken ct = default);

    /// <summary>True when the breaker is open (primary is considered unavailable).</summary>
    bool IsOpen { get; }
}

namespace BakeryMarketplace.Caching;

/// <summary>
/// Circuit-breaker policy abstraction used by <see cref="ResilientCacheProvider"/>.
/// Implementations back this with Polly or a custom policy.
/// </summary>
public interface ICircuitBreakerPolicy
{
    /// <summary>
    /// Executes <paramref name="operation"/> through the circuit breaker.
    /// Throws <see cref="CircuitBreakerOpenException"/> when the breaker is open.
    /// </summary>
    Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default);

    /// <summary>
    /// Executes <paramref name="operation"/> through the circuit breaker and returns a result.
    /// Throws <see cref="CircuitBreakerOpenException"/> when the breaker is open.
    /// </summary>
    Task<TResult> ExecuteAsync<TResult>(Func<CancellationToken, Task<TResult>> operation, CancellationToken ct = default);

    /// <summary>True when the breaker is open (primary is considered unavailable).</summary>
    bool IsOpen { get; }
}

/// <summary>Thrown by <see cref="ICircuitBreakerPolicy"/> when the circuit is open.</summary>
public class CircuitBreakerOpenException : Exception
{
    public CircuitBreakerOpenException() : base("Circuit breaker is open — primary cache is unavailable.") { }
}

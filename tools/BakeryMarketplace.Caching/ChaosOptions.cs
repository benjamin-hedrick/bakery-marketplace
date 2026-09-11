namespace BakeryMarketplace.Caching;

/// <summary>
/// Configuration for <see cref="ChaosCacheProvider"/>.
/// Controls what kinds of failures are injected.
/// </summary>
public class ChaosOptions
{
    /// <summary>
    /// Probability (0.0–1.0) that any individual cache operation fails with an exception.
    /// 0.0 = never fail, 1.0 = always fail.
    /// </summary>
    public double FailureRate { get; set; }

    /// <summary>
    /// When set, every operation is delayed by this duration before executing.
    /// </summary>
    public TimeSpan? InjectedLatency { get; set; }

    /// <summary>
    /// When set, all operations fail for this duration from the moment chaos is activated.
    /// After the window elapses, operations pass through normally (simulating recovery).
    /// </summary>
    public TimeSpan? OutageWindow { get; set; }
}

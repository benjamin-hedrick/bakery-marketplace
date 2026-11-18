using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Internal;

namespace NotificationService.Tests;

/// <summary>
/// A memory cache whose entries expire on the given clock, so a test of a time limit (a lease, a short cache entry) moves the clock
/// instead of sleeping on the real one (register 202: such sleeps failed in the CPU-limited Linux container).
/// </summary>
internal static class ManualClockCache
{
    public static MemoryCache Create(TimeProvider time) => new(new MemoryCacheOptions { Clock = new Clock(time) });

    private sealed class Clock(TimeProvider time) : ISystemClock
    {
        public DateTimeOffset UtcNow => time.GetUtcNow();
    }
}

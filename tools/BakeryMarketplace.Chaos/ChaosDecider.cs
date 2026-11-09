using System.Security.Cryptography;
using System.Text;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// Whether a fault applies is a pure function of (seed, layer, fault, operation key), never of call order or thread timing (ADR-0024), so one
/// scenario hits the same operations on every run, under concurrency and in either language. The number is SHA-256 over
/// <c>"{seed}|{layer}|{fault}|{key}"</c> (UTF-8), the first 8 bytes read big-endian as an unsigned integer, the low 11 bits dropped and the rest
/// divided by 2^53, which gives a value in [0, 1) exactly. The TypeScript library must give the same numbers; <c>chaos/test-vectors.json</c> holds
/// the proof both test suites check.
/// </summary>
public static class ChaosDecider
{
    public static double Unit(long seed, string layer, string fault, string key)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{seed}|{layer}|{fault}|{key}"));
        var value = System.Buffers.Binary.BinaryPrimitives.ReadUInt64BigEndian(hash.AsSpan(0, 8));
        return (value >> 11) / 9007199254740992.0; // 2^53
    }

    /// <summary>True when the fault applies at this <paramref name="rate"/> (0 never, 1 always).</summary>
    public static bool Applies(long seed, string layer, string fault, string key, double rate) =>
        rate > 0 && Unit(seed, layer, fault, key) < rate;
}

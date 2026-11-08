namespace BakeryMarketplace.Caching;

/// <summary>
/// Discriminated-union result for cache lookups.
/// A Hit carries the cached value; a Miss signals the key was not found (never throws).
/// </summary>
public readonly struct CacheResult<T>
{
    public bool Found { get; }
    public T? Value { get; }

    internal CacheResult(bool found, T? value)
    {
        Found = found;
        Value = value;
    }
}

/// <summary>Creates <see cref="CacheResult{T}"/> values. A non-generic factory, because static members on a generic type make every call name the type twice.</summary>
public static class CacheResult
{
    public static CacheResult<T> Miss<T>() => new(false, default);

    public static CacheResult<T> Hit<T>(T value) => new(true, value);
}

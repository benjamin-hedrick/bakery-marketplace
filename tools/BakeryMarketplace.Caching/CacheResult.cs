namespace BakeryMarketplace.Caching;

/// <summary>
/// Discriminated-union result for cache lookups.
/// A Hit carries the cached value; a Miss signals the key was not found (never throws).
/// </summary>
public readonly struct CacheResult<T>
{
    public bool Found { get; }
    public T? Value { get; }

    public static CacheResult<T> Miss() => new(false, default);
    public static CacheResult<T> Hit(T value) => new(true, value);

    private CacheResult(bool found, T? value)
    {
        Found = found;
        Value = value;
    }
}

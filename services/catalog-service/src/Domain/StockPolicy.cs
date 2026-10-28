namespace CatalogService.Domain;

/// <summary>What a customer sees instead of the exact count (ADR-0017). Strings, like <see cref="ListingStatuses"/>.</summary>
public static class StockStatuses
{
    public const string InStock = "inStock";
    public const string Low = "low";
    public const string SoldOut = "soldOut";
}

/// <summary>Stock rules for a listing (ADR-0017). Pure functions over the document, so they are easy to test.</summary>
public static class StockPolicy
{
    /// <summary>Placeholder until the human lead chooses one (WI-CAT-005 open point).</summary>
    public const int DefaultLowStockThreshold = 5;

    /// <summary>Upper bound for any quantity, limit or adjustment; keeps arithmetic far from int overflow.</summary>
    public const int MaxQuantity = 1_000_000;

    public static int ThresholdOf(ListingDocument d) => d.LowStockThreshold ?? DefaultLowStockThreshold;

    /// <summary>Made-to-order items are always in stock. A limited item is sold out at zero, low at or below its threshold.</summary>
    public static string StatusOf(ListingDocument d) => d.AvailableQuantity switch
    {
        null => StockStatuses.InStock,
        <= 0 => StockStatuses.SoldOut,
        var quantity when quantity <= ThresholdOf(d) => StockStatuses.Low,
        _ => StockStatuses.InStock,
    };

    /// <summary>True when a limited item is at or below its threshold (including sold out). Used to detect "crossing into low".</summary>
    public static bool IsLowOrOut(ListingDocument d) => d.AvailableQuantity is { } quantity && quantity <= ThresholdOf(d);
}

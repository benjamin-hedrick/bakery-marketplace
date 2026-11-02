namespace OrderingService.Streaming;

/// <summary>Settings of the vendor order stream (ADR-0021), section <c>VendorStream</c>. The defaults are the ADR's.</summary>
public sealed class VendorStreamOptions
{
    /// <summary>How often a comment line is sent on an idle stream, so ingress idle timeouts do not close it and the client can tell it is alive.</summary>
    public TimeSpan Heartbeat { get; set; } = TimeSpan.FromSeconds(15);

    /// <summary>The longest a stream lives, whatever the token says (ADR-0021 decision 3: 1 hour). The token's own expiry always ends it sooner if it is earlier.</summary>
    public TimeSpan MaxAge { get; set; } = TimeSpan.FromHours(1);

    /// <summary>Open streams per vendor on one instance. A sixth opens and the oldest is closed.</summary>
    public int MaxStreamsPerVendor { get; set; } = 5;

    /// <summary>Open streams on one instance across all vendors. Beyond it a new stream is refused with 503.</summary>
    public int MaxStreamsPerInstance { get; set; } = 500;

    /// <summary>Messages queued for one stream. A client that falls this far behind is dropped and resynchronizes with the list.</summary>
    public int QueueCapacity { get; set; } = 64;
}

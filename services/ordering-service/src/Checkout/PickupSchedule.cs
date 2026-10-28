using Microsoft.Extensions.Options;

namespace OrderingService.Checkout;

/// <summary>A selectable pickup slot. Both instants are UTC (first-slice contract D-7).</summary>
public sealed record PickupWindow(DateTimeOffset Start, DateTimeOffset End);

/// <summary>
/// Settings for the first slice's single pickup schedule (D-3, D-8): one set of local hours in one time zone, for every vendor. Per-vendor
/// hours and zones are deferred (open item 39). Bound from the <c>Pickup</c> configuration section.
/// </summary>
public sealed class PickupScheduleOptions
{
    /// <summary>An IANA zone id. The local hours below are converted to UTC with this zone's rules for each date, so daylight saving is handled.</summary>
    public string TimeZoneId { get; set; } = "America/New_York";

    public TimeOnly OpenLocal { get; set; } = new(8, 0);
    public TimeOnly CloseLocal { get; set; } = new(17, 0);
    public int SlotMinutes { get; set; } = 15;

    /// <summary>A window can be chosen only if it starts at least this long after now (D-8).</summary>
    public int LeadTimeMinutes { get; set; } = 30;

    /// <summary>How many local days are offered, counting today.</summary>
    public int HorizonDays { get; set; } = 3;
}

/// <summary>
/// The deterministic list of pickup windows (D-3): every <see cref="PickupScheduleOptions.SlotMinutes"/> minutes between the local opening and
/// closing times, for today and the next days, minus anything inside the lead time. Pure: "now" is always passed in, nothing reads a clock.
/// </summary>
public sealed class PickupSchedule
{
    private readonly PickupScheduleOptions _options;
    private readonly TimeZoneInfo _zone;

    public PickupSchedule(IOptions<PickupScheduleOptions> options)
    {
        _options = options.Value;
        var o = _options;

        try
        {
            _zone = TimeZoneInfo.FindSystemTimeZoneById(o.TimeZoneId);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw new InvalidOperationException(
                $"Pickup:TimeZoneId '{o.TimeZoneId}' is not a known time zone (use an IANA id such as America/New_York; the host needs time zone data).", e);
        }

        if (o.CloseLocal <= o.OpenLocal) throw new InvalidOperationException("Pickup:CloseLocal must be after Pickup:OpenLocal.");
        if (o.SlotMinutes is < 5 or > 120) throw new InvalidOperationException("Pickup:SlotMinutes must be between 5 and 120.");
        if ((o.CloseLocal - o.OpenLocal).TotalMinutes % o.SlotMinutes != 0)
            throw new InvalidOperationException("The opening hours must divide evenly into slots.");
        if (o.LeadTimeMinutes < 0) throw new InvalidOperationException("Pickup:LeadTimeMinutes cannot be negative.");
        if (o.HorizonDays is < 1 or > 14) throw new InvalidOperationException("Pickup:HorizonDays must be between 1 and 14.");
    }

    public IReadOnlyList<PickupWindow> WindowsAt(DateTimeOffset nowUtc)
    {
        var earliest = nowUtc.AddMinutes(_options.LeadTimeMinutes).UtcDateTime;
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(nowUtc, _zone).DateTime);
        var slot = TimeSpan.FromMinutes(_options.SlotMinutes);
        var windows = new List<PickupWindow>();

        for (var day = 0; day < _options.HorizonDays; day++)
        {
            var date = today.AddDays(day);
            for (var opens = _options.OpenLocal; opens.Add(slot) <= _options.CloseLocal && opens.Add(slot) > opens; opens = opens.Add(slot))
            {
                var local = date.ToDateTime(opens, DateTimeKind.Unspecified);
                if (_zone.IsInvalidTime(local)) continue; // a local time skipped by a clock change

                var start = TimeZoneInfo.ConvertTimeToUtc(local, _zone);
                if (start < earliest) continue;
                windows.Add(new PickupWindow(new DateTimeOffset(start, TimeSpan.Zero), new DateTimeOffset(start + slot, TimeSpan.Zero)));
            }
        }
        return windows;
    }

    /// <summary>True only for an exact slot from <see cref="WindowsAt"/>. Offsets in the input are fine: they are compared as instants.</summary>
    public bool IsSelectable(DateTimeOffset start, DateTimeOffset end, DateTimeOffset nowUtc) =>
        WindowsAt(nowUtc).Any(w => w.Start == start && w.End == end);
}

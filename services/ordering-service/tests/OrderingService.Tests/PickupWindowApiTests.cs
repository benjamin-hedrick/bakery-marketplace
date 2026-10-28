using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static OrderingService.Tests.OrderingFactory;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>GET /ordering/pickup-windows (WI-ORD-003, first-slice contract D-3, D-7, D-8): what is offered is exactly what checkout accepts.</summary>
public sealed class PickupWindowApiTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;
    private HttpClient _anon = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret);
        _anon = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _anon.Dispose();
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    private async Task<List<(DateTimeOffset Start, DateTimeOffset End)>> WindowsAsync(HttpClient? client = null, string vendor = Vendor)
    {
        var response = await (client ?? _anon).GetAsync($"/ordering/pickup-windows?vendorId={vendor}");
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("windows").EnumerateArray()
            .Select(w => (w.GetProperty("start").GetDateTimeOffset(), w.GetProperty("end").GetDateTimeOffset())).ToList();
    }

    [Fact]
    public async Task AnyoneCanReadTheWindows_AndTheyAreNeverCached()
    {
        var response = await _anon.GetAsync($"/ordering/pickup-windows?vendorId={Vendor}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task TheListIsTodaysRemainingSlotsPlusTwoMoreDays_InUtcFifteenMinutesEach()
    {
        // Pinned clock: 08:00 EST on 15 January (13:00Z). Lead time 30 minutes, so the first slot is 13:30Z.
        var windows = await WindowsAsync();

        Assert.Equal(34 + 36 + 36, windows.Count); // today 08:30..16:45 EST, then two full days
        Assert.Equal(new DateTimeOffset(2026, 1, 15, 13, 30, 0, TimeSpan.Zero), windows[0].Start);
        Assert.Equal(new DateTimeOffset(2026, 1, 17, 22, 0, 0, TimeSpan.Zero), windows[^1].End); // 17:00 EST on the 17th
        Assert.All(windows, w =>
        {
            Assert.Equal(TimeSpan.Zero, w.Start.Offset);
            Assert.Equal(TimeSpan.FromMinutes(15), w.End - w.Start);
        });
        Assert.Equal(windows.Select(w => w.Start), windows.Select(w => w.Start).OrderBy(s => s)); // ascending
    }

    [Fact]
    public async Task TheListFollowsTheClock()
    {
        _factory.Time.Now = new DateTimeOffset(2026, 1, 15, 22, 30, 0, TimeSpan.Zero); // 17:30 EST, after closing

        var windows = await WindowsAsync();

        Assert.Equal(new DateTimeOffset(2026, 1, 16, 13, 0, 0, TimeSpan.Zero), windows[0].Start); // tomorrow 08:00 EST
    }

    [Fact]
    public async Task DaylightSavingMovesTheUtcTimesButNotTheLocalHours()
    {
        _factory.Time.Now = new DateTimeOffset(2026, 3, 7, 9, 0, 0, TimeSpan.Zero); // the day before the clocks go forward

        var windows = await WindowsAsync();

        Assert.Contains(windows, w => w.Start == new DateTimeOffset(2026, 3, 7, 13, 0, 0, TimeSpan.Zero)); // 08:00 EST
        Assert.Contains(windows, w => w.Start == new DateTimeOffset(2026, 3, 8, 12, 0, 0, TimeSpan.Zero)); // 08:00 EDT, an hour earlier in UTC
    }

    [Fact]
    public async Task TheVendorIdIsRequired_ButDoesNotChangeTheSliceSchedule()
    {
        var blank = await _anon.GetAsync("/ordering/pickup-windows?vendorId=%20");
        var missing = await _anon.GetAsync("/ordering/pickup-windows");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, blank.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missing.StatusCode);
        Assert.True(JsonDocument.Parse(await missing.Content.ReadAsStringAsync()).RootElement.GetProperty("errors").TryGetProperty("vendorId", out _));
        Assert.Equal(await WindowsAsync(vendor: "vendor-shop-001"), await WindowsAsync(vendor: "vendor-indep-001"));
    }

    [Fact]
    public async Task OnlyGetIsAllowed() =>
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await _anon.PostAsync($"/ordering/pickup-windows?vendorId={Vendor}", null)).StatusCode);

    // ---- the offer and checkout agree -----------------------------------------------------------

    [Fact]
    public async Task EveryEdgeOfTheListIsAcceptedByCheckout()
    {
        var windows = await WindowsAsync();
        using var customer = _factory.CustomerClient();

        foreach (var window in new[] { windows[0], windows[windows.Count / 2], windows[^1] })
        {
            var response = await PostCheckout(customer, new
            {
                vendorId = Vendor,
                lineItems = new[] { new { listingId = "listing-latte-001", modifierIds = Array.Empty<string>(), quantity = 1 } },
                pickupWindow = new { start = window.Start, end = window.End },
            });

            Assert.True(response.StatusCode == HttpStatusCode.Created, $"{window.Start:O}: {response.StatusCode}");
        }
    }

    [Fact]
    public async Task SlotsJustOutsideTheListAreRefusedByCheckout()
    {
        var windows = await WindowsAsync();
        using var customer = _factory.CustomerClient();

        // one slot before the first offered (inside the lead time), the first slot of the day after the horizon (08:00 EST on the 18th), and 17:00 EST (closing)
        foreach (var start in new[] { windows[0].Start.AddMinutes(-15), new DateTimeOffset(2026, 1, 18, 13, 0, 0, TimeSpan.Zero), windows[^1].End })
        {
            var response = await PostCheckout(customer, new
            {
                vendorId = Vendor,
                lineItems = new[] { new { listingId = "listing-latte-001", modifierIds = Array.Empty<string>(), quantity = 1 } },
                pickupWindow = new { start, end = start.AddMinutes(15) },
            });

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("pickup_window_unavailable", JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString());
        }
    }

    [Fact]
    public async Task AWindowOfferedEarlierExpiresAsTheClockAdvances()
    {
        var first = (await WindowsAsync())[0];
        using var customer = _factory.CustomerClient();
        _factory.Time.Now = first.Start.AddMinutes(-10); // now inside the lead time of what was offered a moment ago

        var response = await PostCheckout(customer, new
        {
            vendorId = Vendor,
            lineItems = new[] { new { listingId = "listing-latte-001", modifierIds = Array.Empty<string>(), quantity = 1 } },
            pickupWindow = new { start = first.Start, end = first.End },
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.DoesNotContain(await WindowsAsync(), w => w.Start == first.Start); // and it is no longer offered
    }
}

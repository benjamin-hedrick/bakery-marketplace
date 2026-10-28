using Microsoft.Extensions.Options;
using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>First-slice contract D-3 / D-7 / D-8: 8:00 to 17:00 Eastern in 15-minute slots, stored and compared as UTC, daylight saving handled.</summary>
public class PickupScheduleTests
{
    private static PickupSchedule Schedule(Action<PickupScheduleOptions>? tweak = null)
    {
        var options = new PickupScheduleOptions();
        tweak?.Invoke(options);
        return new PickupSchedule(Options.Create(options));
    }

    private static DateTimeOffset Utc(int y, int m, int d, int h, int min = 0) => new(y, m, d, h, min, 0, TimeSpan.Zero);

    [Fact]
    public void InWinterTheDayRunsFrom13UtcToTheLastSlotStartingAt2145Utc()
    {
        // 07:00 EST on 15 January: eastern is UTC-5.
        var windows = Schedule().WindowsAt(Utc(2026, 1, 15, 12, 0)).Where(w => w.Start.Day == 15).ToList();

        Assert.Equal(36, windows.Count); // 9 hours of 15-minute slots
        Assert.Equal(Utc(2026, 1, 15, 13), windows[0].Start); // 08:00 EST
        Assert.Equal(Utc(2026, 1, 15, 21, 45), windows[^1].Start); // 16:45 EST
        Assert.Equal(Utc(2026, 1, 15, 22), windows[^1].End); // 17:00 EST
    }

    [Fact]
    public void InSummerTheSameLocalHoursAreAnHourEarlierInUtc()
    {
        // 07:00 EDT on 15 July: eastern is UTC-4.
        var windows = Schedule().WindowsAt(Utc(2026, 7, 15, 11, 0)).Where(w => w.Start.Day == 15).ToList();

        Assert.Equal(36, windows.Count);
        Assert.Equal(Utc(2026, 7, 15, 12), windows[0].Start); // 08:00 EDT
        Assert.Equal(Utc(2026, 7, 15, 21), windows[^1].End); // 17:00 EDT
    }

    [Fact]
    public void EveryWindowIsUtcAndFifteenMinutesLong()
    {
        var windows = Schedule().WindowsAt(Utc(2026, 7, 15, 11, 0));

        Assert.All(windows, w =>
        {
            Assert.Equal(TimeSpan.Zero, w.Start.Offset);
            Assert.Equal(TimeSpan.Zero, w.End.Offset);
            Assert.Equal(TimeSpan.FromMinutes(15), w.End - w.Start);
        });
    }

    [Fact]
    public void ADayCoveringTheSpringForwardChangeSwitchesFrom13UtcTo12Utc()
    {
        // Clocks go forward at 02:00 on 8 March 2026. Saturday 7th 08:00 is EST (13:00Z), Sunday 8th 08:00 is EDT (12:00Z).
        var windows = Schedule().WindowsAt(Utc(2026, 3, 7, 9, 0)); // 04:00 EST on the 7th

        Assert.Contains(windows, w => w.Start == Utc(2026, 3, 7, 13));
        Assert.Contains(windows, w => w.Start == Utc(2026, 3, 8, 12));
        Assert.Equal(Utc(2026, 3, 8, 12), windows.First(w => w.Start.Day == 8).Start);
    }

    [Fact]
    public void ADayCoveringTheFallBackChangeSwitchesFrom12UtcTo13Utc()
    {
        // Clocks go back at 02:00 on 1 November 2026. Saturday 31 October 08:00 is EDT (12:00Z), Sunday 1 November 08:00 is EST (13:00Z).
        var windows = Schedule().WindowsAt(Utc(2026, 10, 31, 9, 0)); // 05:00 EDT

        Assert.Equal(Utc(2026, 10, 31, 12), windows.First(w => w.Start.Day == 31).Start);
        Assert.Equal(Utc(2026, 11, 1, 13), windows.First(w => w.Start.Month == 11 && w.Start.Day == 1).Start);
    }

    [Fact]
    public void ASlotInsideTheLeadTimeIsNotOffered_AndOneExactlyAtItIs()
    {
        var schedule = Schedule(); // lead time 30 minutes
        var now = Utc(2026, 1, 15, 13, 0); // 08:00 EST, opening time

        var windows = schedule.WindowsAt(now);

        Assert.DoesNotContain(windows, w => w.Start == Utc(2026, 1, 15, 13, 15));
        Assert.Equal(Utc(2026, 1, 15, 13, 30), windows[0].Start); // starts exactly 30 minutes ahead: allowed
    }

    [Fact]
    public void AfterClosingTheFirstOfferIsTomorrowMorning()
    {
        var windows = Schedule().WindowsAt(Utc(2026, 1, 15, 22, 30)); // 17:30 EST

        Assert.Equal(Utc(2026, 1, 16, 13), windows[0].Start);
    }

    [Fact]
    public void BeforeOpeningTodaysFirstSlotIsOffered_NotTomorrows()
    {
        var windows = Schedule().WindowsAt(Utc(2026, 1, 15, 8, 0)); // 03:00 EST

        Assert.Equal(Utc(2026, 1, 15, 13), windows[0].Start);
    }

    [Fact]
    public void OnlyTheHorizonIsOffered()
    {
        var windows = Schedule(o => o.HorizonDays = 2).WindowsAt(Utc(2026, 1, 15, 8, 0));

        Assert.Equal(new[] { 15, 16 }, windows.Select(w => w.Start.Day).Distinct());
        Assert.Equal(72, windows.Count);
    }

    [Fact]
    public void ASlotIsSelectableOnlyIfItIsExactlyOneOfTheOfferedWindows()
    {
        var schedule = Schedule();
        var now = Utc(2026, 1, 15, 12, 0);

        Assert.True(schedule.IsSelectable(Utc(2026, 1, 15, 14), Utc(2026, 1, 15, 14, 15), now));
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 15, 14, 5), Utc(2026, 1, 15, 14, 20), now)); // off the grid
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 15, 14), Utc(2026, 1, 15, 14, 30), now)); // wrong length
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 15, 22), Utc(2026, 1, 15, 22, 15), now)); // 17:00 EST, after closing
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 15, 12, 45), Utc(2026, 1, 15, 13), now)); // before opening
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 15, 12, 0), Utc(2026, 1, 15, 12, 15), now)); // in the past
        Assert.False(schedule.IsSelectable(Utc(2026, 1, 20, 14), Utc(2026, 1, 20, 14, 15), now)); // beyond the horizon
    }

    [Fact]
    public void AnInstantWrittenWithAnOffsetIsComparedAsTheSameInstant()
    {
        var schedule = Schedule();
        var now = Utc(2026, 1, 15, 12, 0);
        var start = new DateTimeOffset(2026, 1, 15, 9, 0, 0, TimeSpan.FromHours(-5)); // 14:00Z

        Assert.True(schedule.IsSelectable(start, start.AddMinutes(15), now));
    }

    [Fact]
    public void TheClockIsAlwaysPassedIn_SoTheSameInputGivesTheSameWindows()
    {
        var schedule = Schedule();
        var now = Utc(2026, 7, 15, 11, 0);

        Assert.Equal(schedule.WindowsAt(now), schedule.WindowsAt(now));
    }

    [Theory]
    [InlineData("Not/AZone")]
    [InlineData("")]
    public void AnUnknownTimeZoneStopsStartup(string zone) =>
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.TimeZoneId = zone));

    [Fact]
    public void BadHoursStopStartup()
    {
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.CloseLocal = o.OpenLocal));
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.CloseLocal = new TimeOnly(17, 10))); // does not divide into 15-minute slots
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.SlotMinutes = 3));
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.LeadTimeMinutes = -1));
        Assert.Throws<InvalidOperationException>(() => Schedule(o => o.HorizonDays = 0));
    }
}

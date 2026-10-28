namespace CatalogService.Tests;

/// <summary>Open item 73: the event backend is chosen explicitly, never by silent fallback.</summary>
public class EventBackendTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("kafka")]
    public void TheServiceRefusesToStartWithoutAnExplicitEventBackend(string? backend)
    {
        using var factory = new CatalogFactory().WithWebHostBuilder(b => b.UseSetting("Events:Backend", backend));

        var failure = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Events:Backend", failure.ToString());
    }
}

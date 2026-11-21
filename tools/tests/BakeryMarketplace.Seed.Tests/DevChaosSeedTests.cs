using System.Text.Json;

namespace BakeryMarketplace.Seed.Tests;

/// <summary>
/// The dev chaos scenario (chaos/scenarios/dev-chaos.json, WI-CHAOS-006) and the seed data stay in step: every listing and card the scenario aims at is a
/// chaos data point that exists, so a fault can only reach chaos data and the regular tests are never disturbed.
/// </summary>
public sealed class DevChaosSeedTests
{
    private static string ScenarioPath()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "chaos", "scenarios", "dev-chaos.json");
            if (File.Exists(candidate)) return candidate;
        }

        throw new FileNotFoundException("chaos/scenarios/dev-chaos.json not found above " + AppContext.BaseDirectory);
    }

    /// <summary>Every string value under the scenario's where and signals sections that names a listing or a card token.</summary>
    private static List<string> Named(string prefix)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(ScenarioPath()));
        var found = new List<string>();
        void Walk(JsonElement e)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.Object:
                    foreach (var p in e.EnumerateObject()) Walk(p.Value);
                    break;
                case JsonValueKind.Array:
                    foreach (var x in e.EnumerateArray()) Walk(x);
                    break;
                case JsonValueKind.String when e.GetString()!.StartsWith(prefix, StringComparison.Ordinal):
                    found.Add(e.GetString()!);
                    break;
            }
        }

        Walk(doc.RootElement.GetProperty("where"));
        Walk(doc.RootElement.GetProperty("signals"));
        return found;
    }

    [Fact]
    public void Every_listing_the_scenario_names_is_a_seeded_chaos_listing_of_the_chaos_vendor()
    {
        var listings = SeedData.Listings().ToDictionary(l => l.Id);
        var named = Named("listing-");
        Assert.NotEmpty(named);
        foreach (var id in named)
        {
            Assert.True(listings.TryGetValue(id, out var listing), $"{id} is not seeded");
            Assert.Equal(SeedData.ChaosVendorId, listing!.VendorId);
            Assert.StartsWith("listing-zz-chaos-", id);
            Assert.Contains("(chaos test)", listing.Name);
        }
    }

    [Fact]
    public void Every_card_the_scenario_names_belongs_to_a_chaos_customer()
    {
        var named = Named("pm_");
        Assert.Equal([PaymentSeedData.ChaosLostPaymentToken], named);
        var card = Assert.Single(PaymentSeedData.PaymentMethods(), m => m.Token == PaymentSeedData.ChaosLostPaymentToken);
        Assert.Equal(PaymentSeedData.ChaosPaymentCustomerId, card.CustomerId);
    }

    [Fact]
    public void The_chaos_customers_are_mock_customers_and_each_has_an_accepted_card()
    {
        foreach (var id in new[] { PaymentSeedData.ChaosPaymentCustomerId, PaymentSeedData.ChaosStockCustomerId })
        {
            Assert.True(BakeryMarketplace.Auth.MockUsers.All.TryGetValue(id, out var user), $"{id} has no mock identity");
            Assert.Equal("Customer", user!.Role);
            Assert.Contains(PaymentSeedData.PaymentMethods(), m => m.CustomerId == id && m.Token.StartsWith("pm_", StringComparison.Ordinal));
        }
    }
}

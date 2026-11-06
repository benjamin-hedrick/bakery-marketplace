using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using BakeryMarketplace.Seed;
using OrderingService.Checkout;
using OrderingService.Persistence;

namespace BakeryMarketplace.Seed.Tests;

/// <summary>
/// WI-ORD-010: the saved payment methods of the seeded customers are SEED DATA (tools/BakeryMarketplace.Seed), not something a test sets at run time. These tests keep
/// the fixtures honest: each case the checkout, the apps and the flows need exists, they are written once, they match the mock identities, and what makes a token
/// valid or invalid is decided by ordering's own rule (<see cref="PaymentTokenValidator"/>), not by the seed.
/// </summary>
public sealed class SeedPaymentMethodsTests
{
    private readonly FakeRepository<PaymentMethodDocument> _methods = new(d => d.Id);

    private static IEnumerable<PaymentMethodDocument> For(string customerId) =>
        PaymentSeedData.PaymentMethods().Where(m => m.CustomerId == customerId).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id, StringComparer.Ordinal);

    [Fact]
    public async Task Seeding_writes_each_method_under_its_customers_id_and_again_changes_nothing()
    {
        var first = await new PaymentMethodSeeder(_methods).SeedAsync();
        var changed = await _methods.GetAsync("pm-alice-ok", PaymentSeedData.AliceId);
        changed!.Description = "edited by a developer";
        await _methods.SaveAsync(changed, changed.CustomerId);

        var again = await new PaymentMethodSeeder(_methods).SeedAsync();

        Assert.Equal((PaymentSeedData.PaymentMethods().Count, 0), first);
        Assert.Equal((0, PaymentSeedData.PaymentMethods().Count), again);
        Assert.Equal("edited by a developer", (await _methods.GetAsync("pm-alice-ok", PaymentSeedData.AliceId))!.Description);
        foreach (var expected in PaymentSeedData.PaymentMethods())
            Assert.Equal(expected.Token, (await _methods.GetAsync(expected.Id, expected.CustomerId))!.Token);
    }

    [Fact]
    public void Ids_are_unique_and_every_method_belongs_to_a_mock_customer()
    {
        var all = PaymentSeedData.PaymentMethods();
        var mockCustomers = MockUsers.All.Values.Where(u => u.Role == "Customer").Select(u => u.Id).ToHashSet();

        Assert.Equal(all.Count, all.Select(m => m.Id).Distinct().Count());
        Assert.All(all, m => Assert.Contains(m.CustomerId, mockCustomers));
        Assert.Equal(PaymentSeedData.AliceId, MockUsers.Customer.Id);
        Assert.Equal(PaymentSeedData.NoMethodsCustomerId, MockUsers.NoPaymentMethodsCustomer.Id);
    }

    [Fact]
    public void Every_mock_customer_has_an_accepted_method_except_the_one_with_none()
    {
        foreach (var customer in MockUsers.All.Values.Where(u => u.Role == "Customer").Select(u => u.Id).Distinct())
        {
            if (customer == PaymentSeedData.NoMethodsCustomerId) continue;
            Assert.Contains(For(customer), m => PaymentTokenValidator.Validate(m.Token).Valid);
        }
    }

    [Fact]
    public void Alice_has_an_accepted_method_first_and_a_method_the_rule_refuses()
    {
        var alice = For(PaymentSeedData.AliceId).ToList();

        Assert.True(PaymentTokenValidator.Validate(alice[0].Token).Valid); // the one a checkout preselects
        var refused = Assert.Single(alice, m => !PaymentTokenValidator.Validate(m.Token).Valid);
        Assert.Equal(PaymentSeedData.InvalidToken, refused.Token);
    }

    [Fact]
    public void Nobody_else_can_hit_a_decline_by_accident()
    {
        var invalid = PaymentSeedData.PaymentMethods().Where(m => !PaymentTokenValidator.Validate(m.Token).Valid).ToList();

        Assert.Equal([PaymentSeedData.AliceId], invalid.Select(m => m.CustomerId));
    }

    [Fact]
    public void Max_has_two_accepted_methods_and_the_no_methods_customer_has_none()
    {
        Assert.Equal(2, For(PaymentSeedData.SeveralCustomerId).Count(m => PaymentTokenValidator.Validate(m.Token).Valid));
        Assert.Empty(For(PaymentSeedData.NoMethodsCustomerId));
        Assert.Contains("payment", MockUsers.NoPaymentMethodsCustomer.Name, StringComparison.OrdinalIgnoreCase); // the login page says what the fixture is
    }

    [Fact]
    public async Task The_list_endpoints_store_shows_the_seeded_methods_in_order_without_tokens()
    {
        await new PaymentMethodSeeder(_methods).SeedAsync();
        var store = new PaymentMethodStore(_methods);

        var alice = await store.ListAsync(PaymentSeedData.AliceId);

        Assert.Equal(["pm-alice-ok", "pm-alice-refused"], alice.Select(m => m.Id));
        Assert.Empty(await store.ListAsync(PaymentSeedData.NoMethodsCustomerId));
        Assert.DoesNotContain("pm_seed", System.Text.Json.JsonSerializer.Serialize(alice));
    }
}

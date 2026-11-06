using BakeryMarketplace.Data;
using OrderingService.Persistence;

namespace BakeryMarketplace.Seed;

/// <summary>
/// Saved payment methods of the seeded customers (WI-ORD-010). Test state a flow needs is seed data, not something a test sets at run time (CLAUDE.md), so
/// the declined-payment case is a customer who has a saved method whose token is invalid; nothing special-cases it in code. The customers are the mock
/// identities of <c>BakeryMarketplace.Auth</c> (<c>MockUsers</c>); a test keeps the two lists in step. Tokens are opaque, fake and carry no card data
/// (ADR-0005, ADR-0007). The rule that tells a valid token from an invalid one is ordering's own (<c>PaymentTokenValidator</c>), not the seed's.
/// </summary>
public static class PaymentSeedData
{
    // The same ids the mock identities carry (MockUsers). Alice is "user-customer-1".
    public const string AliceId = "user-customer-1";
    public const string TreeNutAllergyCustomerId = SeedData.TreeNutAllergyCustomerId;
    public const string SesameAllergyCustomerId = SeedData.SesameAllergyCustomerId;
    public const string AvoidsDairyCustomerId = SeedData.AvoidsDairyCustomerId;
    public const string SeveralCustomerId = SeedData.SeveralCustomerId;

    /// <summary>The customer who has no saved payment method at all, so the "no methods" screen is covered by data.</summary>
    public const string NoMethodsCustomerId = "user-customer-nomethods";

    /// <summary>A token the checkout's token rule refuses (no <c>pm_</c> prefix, and a space).</summary>
    public const string InvalidToken = "invalid token";

    /// <summary>
    /// One row per method, with the case it is there for: every customer but the one with none has an accepted method; Alice also has a method whose
    /// token is invalid (the declined-payment case; the accepted one sorts first, so it is the one a checkout preselects); Max has two accepted methods so
    /// a dropdown with a real choice is covered.
    /// </summary>
    public static IReadOnlyList<PaymentMethodDocument> PaymentMethods() =>
    [
        Method("pm-alice-ok", AliceId, "Test card (accepted)", "pm_seed_alice_1", 0),
        Method("pm-alice-refused", AliceId, "Test card (refused)", InvalidToken, 1), // the declined-payment case
        Method("pm-treenut-ok", TreeNutAllergyCustomerId, "Test card (accepted)", "pm_seed_treenut_1", 0),
        Method("pm-sesame-ok", SesameAllergyCustomerId, "Test card (accepted)", "pm_seed_sesame_1", 0),
        Method("pm-avoiddairy-ok", AvoidsDairyCustomerId, "Test card (accepted)", "pm_seed_avoiddairy_1", 0),
        Method("pm-several-ok", SeveralCustomerId, "Test card (accepted)", "pm_seed_several_1", 0),
        Method("pm-several-ok-2", SeveralCustomerId, "Second test card (accepted)", "pm_seed_several_2", 1), // a real choice in the dropdown
        // NoMethodsCustomerId: deliberately none.
    ];

    private static PaymentMethodDocument Method(string id, string customerId, string description, string token, int secondsAfterStamp) =>
        new() { Id = id, CustomerId = customerId, Description = description, Token = token, CreatedAt = SeedData.Stamp.AddSeconds(secondsAfterStamp) };
}

/// <summary>Writes <see cref="PaymentSeedData"/> through <see cref="IRepository{T}"/>, only when absent (a method a developer changed afterwards survives a re-run), like the listings and profiles.</summary>
public sealed class PaymentMethodSeeder(IRepository<PaymentMethodDocument> methods)
{
    public async Task<(int Created, int Unchanged)> SeedAsync(CancellationToken ct = default)
    {
        int created = 0, unchanged = 0;
        foreach (var method in PaymentSeedData.PaymentMethods())
        {
            if (await methods.GetAsync(method.Id, method.CustomerId, ct) is not null)
            {
                unchanged++;
                continue;
            }
            await methods.SaveAsync(method, method.CustomerId, ct);
            created++;
        }
        return (created, unchanged);
    }
}

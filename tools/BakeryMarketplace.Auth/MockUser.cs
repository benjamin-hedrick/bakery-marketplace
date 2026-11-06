namespace BakeryMarketplace.Auth;

/// <summary>
/// Mock user model for local OIDC issuer.
/// See WI-AUTH-005.
/// </summary>
public record MockUser(
    string Id,
    string Name,
    string Email,
    string Role,
    string? VendorType = null
);

/// <summary>
/// Pre-configured mock users for dev/testing.
/// </summary>
public static class MockUsers
{
    public static readonly MockUser Customer = new("user-customer-1", "Alice Customer", "alice@customer.local", "Customer");
    // Customers with a saved allergen profile (WI-MOB-002). Identity rows only: the matching profiles are seed data (tools/BakeryMarketplace.Seed,
    // SeedData.CustomerProfiles), keyed by these ids, and each name says what the saved profile is so a login page and a "Signed in as" line explain
    // themselves. Alice has no profile. Dev-only fixtures; no authorization logic changes.
    public static readonly MockUser TreeNutAllergyCustomer = new("user-customer-treenut", "Nora (tree-nut allergy)", "nora@customer.local", "Customer");
    public static readonly MockUser SesameAllergyCustomer = new("user-customer-sesame", "Sam (sesame allergy)", "sam@customer.local", "Customer");
    public static readonly MockUser AvoidsDairyCustomer = new("user-customer-avoiddairy", "Dana (avoids dairy)", "dana@customer.local", "Customer");
    public static readonly MockUser SeveralCustomer = new("user-customer-several", "Max (dairy and tree-nut allergies, avoids gluten)", "max@customer.local", "Customer");

    // A customer with no saved payment methods (WI-ORD-010), so the "no methods" screen is covered by data (BakeryMarketplace.Seed, PaymentSeedData). No allergen profile either.
    public static readonly MockUser NoPaymentMethodsCustomer = new("user-customer-nomethods", "Nia (no saved payment methods)", "nia@customer.local", "Customer");

    public static readonly MockUser Vendor = new("user-vendor-1", "Bob Baker", "bob@bakery.local", "Vendor", "Shop");

    // Vendor owners for the ids WI-DEV-004 seeds (first-slice-contract section 7). Ownership needs token `sub` == listing `vendorId`,
    // so these let a local login edit exactly one seeded vendor's listings. Dev-only fixtures; no authorization logic changes.
    public static readonly MockUser ShopVendor = new("vendor-shop-001", "Corner Bakery (owner)", "owner@cornerbakery.local", "Vendor", "Shop");
    public static readonly MockUser IndependentVendor = new("vendor-indep-001", "Homemade Treats (owner)", "owner@homemade.local", "Vendor", "Independent");

    public static readonly MockUser Admin = new("user-admin-1", "Charlie Admin", "charlie@admin.local", "Admin");

    public static readonly IReadOnlyDictionary<string, MockUser> All = new Dictionary<string, MockUser>(StringComparer.OrdinalIgnoreCase)
    {
        [Customer.Id] = Customer,
        [TreeNutAllergyCustomer.Id] = TreeNutAllergyCustomer,
        [SesameAllergyCustomer.Id] = SesameAllergyCustomer,
        [AvoidsDairyCustomer.Id] = AvoidsDairyCustomer,
        [SeveralCustomer.Id] = SeveralCustomer,
        [NoPaymentMethodsCustomer.Id] = NoPaymentMethodsCustomer,
        [Vendor.Id] = Vendor,
        [ShopVendor.Id] = ShopVendor,
        [IndependentVendor.Id] = IndependentVendor,
        [Admin.Id] = Admin,
        ["customer"] = Customer,
        ["vendor"] = Vendor,
        ["admin"] = Admin
    };
}

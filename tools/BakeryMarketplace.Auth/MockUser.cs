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
    public static readonly MockUser Vendor = new("user-vendor-1", "Bob Baker", "bob@bakery.local", "Vendor", "Shop");

    // Vendor owners for the ids WI-DEV-004 seeds (first-slice-contract section 7). Ownership needs token `sub` == listing `vendorId`,
    // so these let a local login edit exactly one seeded vendor's listings. Dev-only fixtures; no authorization logic changes.
    public static readonly MockUser ShopVendor = new("vendor-shop-001", "Corner Bakery (owner)", "owner@cornerbakery.local", "Vendor", "Shop");
    public static readonly MockUser IndependentVendor = new("vendor-indep-001", "Homemade Treats (owner)", "owner@homemade.local", "Vendor", "Independent");

    public static readonly MockUser Admin = new("user-admin-1", "Charlie Admin", "charlie@admin.local", "Admin");

    public static readonly IReadOnlyDictionary<string, MockUser> All = new Dictionary<string, MockUser>(StringComparer.OrdinalIgnoreCase)
    {
        [Customer.Id] = Customer,
        [Vendor.Id] = Vendor,
        [ShopVendor.Id] = ShopVendor,
        [IndependentVendor.Id] = IndependentVendor,
        [Admin.Id] = Admin,
        ["customer"] = Customer,
        ["vendor"] = Vendor,
        ["admin"] = Admin
    };
}

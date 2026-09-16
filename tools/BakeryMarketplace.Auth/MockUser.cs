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
    public static readonly MockUser Admin = new("user-admin-1", "Charlie Admin", "charlie@admin.local", "Admin");

    public static readonly IReadOnlyDictionary<string, MockUser> All = new Dictionary<string, MockUser>(StringComparer.OrdinalIgnoreCase)
    {
        [Customer.Id] = Customer,
        [Vendor.Id] = Vendor,
        [Admin.Id] = Admin,
        ["customer"] = Customer,
        ["vendor"] = Vendor,
        ["admin"] = Admin
    };
}

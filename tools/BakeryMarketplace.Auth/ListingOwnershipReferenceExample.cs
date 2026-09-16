namespace BakeryMarketplace.Auth;

/// <summary>
/// Worked reference example for PUT /catalog/listings/{id} resource-ownership authorization.
/// Requires Vendor role + listing.VendorId == sub.
/// See WI-AUTH-002 and data-model-api-contracts.md.
/// </summary>
public record ListingResource(string ListingId, string VendorId) : IResourceWithOwnerId
{
    public string ResourceOwnerId => VendorId;
}

/// <summary>
/// Reference ownership handler for listing update endpoints.
/// </summary>
public sealed class ListingOwnershipHandler : ResourceOwnershipHandler<ListingResource>
{
    public ListingOwnershipHandler(IResourceOwnershipChecker ownershipChecker)
        : base(ownershipChecker)
    {
    }
}

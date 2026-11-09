using BakeryMarketplace.Auth;

namespace CatalogService.Api;

/// <summary>
/// A listing as the ownership check sees it: a vendor may change a listing only when the token's subject is the listing's vendor (ADR-0006, the
/// second layer after the role check). The mechanism is the shared <see cref="ResourceOwnershipHandler{TResource}"/>; the type is the catalog's.
/// </summary>
public record ListingResource(string ListingId, string VendorId) : IResourceWithOwnerId
{
    public string ResourceOwnerId => VendorId;
}

/// <summary>The ownership handler for <see cref="ListingResource"/>, registered once in <c>Program.cs</c> so the authorization service can find it.</summary>
public sealed class ListingOwnershipHandler(IResourceOwnershipChecker ownershipChecker) : ResourceOwnershipHandler<ListingResource>(ownershipChecker);

namespace BakeryMarketplace.Auth;

/// <summary>
/// Interface implemented by domain resources that have a distinct owner identifier.
/// See WI-AUTH-002.
/// </summary>
public interface IResourceWithOwnerId
{
    /// <summary>The owner identifier (e.g. vendorId or customerId matching caller's 'sub').</summary>
    string ResourceOwnerId { get; }
}

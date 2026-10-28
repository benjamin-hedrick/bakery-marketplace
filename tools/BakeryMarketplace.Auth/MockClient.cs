namespace BakeryMarketplace.Auth;

/// <summary>
/// A client registered with the local mock issuer for the OAuth2 client credentials grant (ADR-0018, WI-AUTH-006).
/// The secret comes from configuration (generated into the git-ignored <c>.env</c> by <c>scripts/dev/init-env.mjs</c>), never from source.
/// </summary>
/// <param name="ClientId">Becomes the token's <c>sub</c> and <c>client_id</c>.</param>
/// <param name="Secret">At least <see cref="MinimumSecretLength"/> characters.</param>
/// <param name="Roles">App roles granted in the <c>roles</c> claim, for example <see cref="ServiceRoles.StockReserve"/>.</param>
/// <param name="Audience">The only audience this client may request; the issuer's default audience when null.</param>
public sealed record MockClient(string ClientId, string Secret, IReadOnlyList<string> Roles, string? Audience = null)
{
    public const int MinimumSecretLength = 16;

    /// <summary>Redacts the secret so a logged or printed registration never shows it.</summary>
    public override string ToString() => $"MockClient {{ ClientId = {ClientId}, Roles = [{string.Join(", ", Roles)}], Audience = {Audience} }}";

    internal void Validate()
    {
        if (string.IsNullOrWhiteSpace(ClientId)) throw new ArgumentException("A mock client needs a client id.");
        if (Secret is null || Secret.Length < MinimumSecretLength)
            throw new ArgumentException($"The secret of mock client '{ClientId}' must be at least {MinimumSecretLength} characters.");
    }
}

using System.Text.RegularExpressions;

namespace OrderingService.Checkout;

/// <summary>The verdict on a payment token: valid, or invalid with a fixed reason. The reason never contains the token.</summary>
public sealed record PaymentTokenCheck(bool Valid, string? Reason = null)
{
    public static readonly PaymentTokenCheck Ok = new(true);
}

/// <summary>
/// Business rule (WI-ORD-010): what a payment token must look like before the checkout will try to authorize it. This is ordering's own rule and
/// stays when a real provider replaces the stub (ADR-0005): the provider's token has a known shape, and a malformed one is refused here, before
/// any provider is called. A token must be non-empty, start with <c>pm_</c>, be at most 64 characters and contain only letters, digits, <c>_</c>
/// and <c>-</c>. The tokens in the seed data that are meant to be refused are simply tokens that fail this rule.
/// </summary>
public static partial class PaymentTokenValidator
{
    public const string Prefix = "pm_";
    public const int MaxLength = 64;

    public const string Empty = "The token is empty.";
    public const string WrongPrefix = "The token does not start with the expected prefix.";
    public const string TooLong = "The token is too long.";
    public const string BadCharacters = "The token contains characters that are not allowed.";

    [GeneratedRegex("^[A-Za-z0-9_-]+$")]
    private static partial Regex Allowed();

    public static PaymentTokenCheck Validate(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return new PaymentTokenCheck(false, Empty);
        if (!token.StartsWith(Prefix, StringComparison.Ordinal)) return new PaymentTokenCheck(false, WrongPrefix);
        if (token.Length > MaxLength) return new PaymentTokenCheck(false, TooLong);
        if (!Allowed().IsMatch(token)) return new PaymentTokenCheck(false, BadCharacters);
        return PaymentTokenCheck.Ok;
    }
}

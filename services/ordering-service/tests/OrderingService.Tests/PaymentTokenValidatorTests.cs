using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>WI-ORD-010: the rule that a payment token must satisfy before checkout tries to authorize it. Every branch of the rule.</summary>
public sealed class PaymentTokenValidatorTests
{
    [Theory]
    [InlineData("pm_a")]
    [InlineData("pm_test_valid_token_1")]
    [InlineData("pm_Ab9-_x")]
    public void AWellFormedTokenIsValid(string token) => Assert.True(PaymentTokenValidator.Validate(token).Valid);

    [Fact]
    public void ATokenOfExactlyTheMaximumLengthIsValidAndOneMoreIsNot()
    {
        var longest = "pm_" + new string('a', PaymentTokenValidator.MaxLength - 3);
        Assert.Equal(PaymentTokenValidator.MaxLength, longest.Length);
        Assert.True(PaymentTokenValidator.Validate(longest).Valid);

        var check = PaymentTokenValidator.Validate(longest + "a");
        Assert.False(check.Valid);
        Assert.Equal(PaymentTokenValidator.TooLong, check.Reason);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ANullEmptyOrBlankTokenIsInvalid(string? token)
    {
        var check = PaymentTokenValidator.Validate(token);
        Assert.False(check.Valid);
        Assert.Equal(PaymentTokenValidator.Empty, check.Reason);
    }

    [Theory]
    [InlineData("invalid token")]
    [InlineData("tok_abc")]
    [InlineData("PM_abc")] // the prefix is case-sensitive
    [InlineData(" pm_abc")]
    public void ATokenWithoutTheExpectedPrefixIsInvalid(string token)
    {
        var check = PaymentTokenValidator.Validate(token);
        Assert.False(check.Valid);
        Assert.Equal(PaymentTokenValidator.WrongPrefix, check.Reason);
    }

    [Theory]
    [InlineData("pm_has space")]
    [InlineData("pm_semi;colon")]
    [InlineData("pm_new\nline")]
    [InlineData("pm_ünicode")]
    [InlineData("pm_trailing ")]
    public void ATokenWithOtherCharactersIsInvalid(string token)
    {
        var check = PaymentTokenValidator.Validate(token);
        Assert.False(check.Valid);
        Assert.Equal(PaymentTokenValidator.BadCharacters, check.Reason);
    }

    [Theory]
    [InlineData("invalid token")]
    [InlineData("pm_bad token")]
    public void TheReasonNeverContainsTheToken(string token) =>
        Assert.DoesNotContain(token, PaymentTokenValidator.Validate(token).Reason ?? "", StringComparison.Ordinal);
}

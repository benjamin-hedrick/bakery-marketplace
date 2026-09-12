using Microsoft.Extensions.Configuration;
using BakeryMarketplace.Secrets;

namespace BakeryMarketplace.Secrets.Tests;

public class SecretValidatorTests
{
    private static IConfiguration BuildConfiguration(IDictionary<string, string?> inMemoryData) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(inMemoryData)
            .Build();

    [Fact]
    public void ValidateRequiredSecrets_MissingKey_ThrowsSecretValidationException()
    {
        var config = BuildConfiguration(new Dictionary<string, string?>());

        var ex = Assert.Throws<SecretValidationException>(() =>
            SecretValidator.ValidateRequiredSecrets(config, new[] { "Stripe:SecretKey" }));

        Assert.Equal("Stripe:SecretKey", ex.SecretName);
        Assert.Contains("missing", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ValidateRequiredSecrets_EmptyValue_ThrowsSecretValidationException()
    {
        var config = BuildConfiguration(new Dictionary<string, string?>
        {
            ["Stripe:SecretKey"] = "   "
        });

        var ex = Assert.Throws<SecretValidationException>(() =>
            SecretValidator.ValidateRequiredSecrets(config, new[] { "Stripe:SecretKey" }));

        Assert.Equal("Stripe:SecretKey", ex.SecretName);
        Assert.Contains("whitespace", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ValidateUriSecret_InvalidUri_ThrowsSecretValidationException()
    {
        var config = BuildConfiguration(new Dictionary<string, string?>
        {
            ["Auth:Authority"] = "not-a-valid-url"
        });

        var ex = Assert.Throws<SecretValidationException>(() =>
            SecretValidator.ValidateUriSecret(config, "Auth:Authority"));

        Assert.Equal("Auth:Authority", ex.SecretName);
        Assert.Contains("not a valid absolute URI", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ValidateSecretPrefix_MismatchPrefix_ThrowsSecretValidationException()
    {
        var config = BuildConfiguration(new Dictionary<string, string?>
        {
            ["Stripe:SecretKey"] = "live_key_secret_123"
        });

        var ex = Assert.Throws<SecretValidationException>(() =>
            SecretValidator.ValidateSecretPrefix(config, "Stripe:SecretKey", "sk_test_"));

        Assert.Equal("Stripe:SecretKey", ex.SecretName);
        Assert.Contains("prefix 'sk_test_'", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_ValidConfiguration_PassesWithoutException()
    {
        var config = BuildConfiguration(new Dictionary<string, string?>
        {
            ["Stripe:SecretKey"] = "sk_test_1234567890",
            ["Auth:Authority"] = "https://auth.bakerymarketplace.local/v1"
        });

        // Act & Assert (does not throw)
        SecretValidator.ValidateRequiredSecrets(config, new[] { "Stripe:SecretKey", "Auth:Authority" });
        SecretValidator.ValidateUriSecret(config, "Auth:Authority");
        SecretValidator.ValidateSecretPrefix(config, "Stripe:SecretKey", "sk_test_");
    }
}

using Microsoft.Extensions.Configuration;

namespace BakeryMarketplace.Secrets;

/// <summary>
/// Fail-fast startup validator for required secrets and configuration entries.
/// Inspects configuration entries and throws <see cref="SecretValidationException"/> if missing or malformed.
/// See ADR-0007 and WI-SEC-003.
/// </summary>
public static class SecretValidator
{
    /// <summary>
    /// Validates that specified configuration keys exist and contain non-whitespace strings.
    /// </summary>
    public static void ValidateRequiredSecrets(IConfiguration configuration, IEnumerable<string> secretKeys)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(secretKeys);

        foreach (var key in secretKeys)
        {
            var value = configuration[key];

            if (value is null)
            {
                throw new SecretValidationException(key, "Required secret/configuration key is missing.");
            }

            if (string.IsNullOrWhiteSpace(value))
            {
                throw new SecretValidationException(key, "Required secret/configuration value is empty or contains only whitespace.");
            }
        }
    }

    /// <summary>
    /// Validates that a configuration key contains a valid absolute URI.
    /// </summary>
    public static void ValidateUriSecret(IConfiguration configuration, string secretKey)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        if (string.IsNullOrEmpty(secretKey)) throw new ArgumentNullException(nameof(secretKey));

        ValidateRequiredSecrets(configuration, new[] { secretKey });
        var value = configuration[secretKey]!;

        if (!Uri.TryCreate(value, UriKind.Absolute, out _))
        {
            throw new SecretValidationException(secretKey, "The value is not a valid absolute URI (it is not shown: it may carry a credential).");
        }
    }

    /// <summary>
    /// Validates that a secret value starts with a required prefix (e.g. 'sk_test_' or 'whsec_').
    /// </summary>
    public static void ValidateSecretPrefix(IConfiguration configuration, string secretKey, string requiredPrefix)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        if (string.IsNullOrEmpty(secretKey)) throw new ArgumentNullException(nameof(secretKey));
        if (string.IsNullOrEmpty(requiredPrefix)) throw new ArgumentNullException(nameof(requiredPrefix));

        ValidateRequiredSecrets(configuration, new[] { secretKey });
        var value = configuration[secretKey]!;

        if (!value.StartsWith(requiredPrefix, StringComparison.Ordinal))
        {
            throw new SecretValidationException(secretKey, $"Secret value must start with prefix '{requiredPrefix}'.");
        }
    }
}

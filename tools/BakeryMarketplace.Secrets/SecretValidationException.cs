namespace BakeryMarketplace.Secrets;

/// <summary>
/// Exception thrown when startup secret validation fails due to missing or malformed secrets.
/// See ADR-0007 and WI-SEC-003.
/// </summary>
public class SecretValidationException : Exception
{
    public string SecretName { get; }

    public SecretValidationException(string secretName, string message)
        : base($"Secret validation failed for '{secretName}': {message}")
    {
        SecretName = secretName ?? throw new ArgumentNullException(nameof(secretName));
    }

    public SecretValidationException(string secretName, string message, Exception innerException)
        : base($"Secret validation failed for '{secretName}': {message}", innerException)
    {
        SecretName = secretName ?? throw new ArgumentNullException(nameof(secretName));
    }
}

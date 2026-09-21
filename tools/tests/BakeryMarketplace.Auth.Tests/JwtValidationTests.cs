using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using BakeryMarketplace.Auth;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// Unit tests for JWT bearer token validation and resource ownership checking.
/// See WI-AUTH-001.
/// </summary>
public class JwtValidationTests
{
    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RsaSecurityKey _signingKey;
    private const string ExpectedIssuer = "https://auth.bakerymarketplace.local/v1";
    private const string WrongIssuer = "https://untrusted-issuer.com/v1";
    private const string ExpectedAudience = "bakery-api";

    public JwtValidationTests()
    {
        _signingKey = new RsaSecurityKey(_rsa);
    }

    private string CreateToken(
        string issuer = ExpectedIssuer,
        string audience = ExpectedAudience,
        TimeSpan? lifetime = null,
        IEnumerable<Claim>? claims = null,
        SecurityKey? keyToSignWith = null)
    {
        var handler = new JwtSecurityTokenHandler();
        var now = DateTime.UtcNow;
        var expires = now.Add(lifetime ?? TimeSpan.FromHours(1));

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            NotBefore = now.AddMinutes(-1),
            Expires = expires,
            Subject = claims != null ? new ClaimsIdentity(claims) : new ClaimsIdentity(),
            SigningCredentials = new SigningCredentials(keyToSignWith ?? _signingKey, SecurityAlgorithms.RsaSha256)
        };

        var token = handler.CreateToken(descriptor);
        return handler.WriteToken(token);
    }

    private TokenValidationParameters GetValidationParameters(string validIssuer = ExpectedIssuer)
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = validIssuer,
            ValidateAudience = true,
            ValidAudience = ExpectedAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = _signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    }

    [Fact]
    public void ValidateToken_ValidToken_Succeeds()
    {
        var handler = new JwtSecurityTokenHandler();
        var token = CreateToken(claims: [new Claim("sub", "user-123"), new Claim("roles", "Vendor")]);

        var principal = handler.ValidateToken(token, GetValidationParameters(), out var validatedToken);

        Assert.NotNull(principal);
        Assert.NotNull(validatedToken);
        var sub = principal.FindFirst("sub")?.Value ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Assert.Equal("user-123", sub);
    }

    [Fact]
    public void ValidateToken_ExpiredToken_ThrowsException()
    {
        var handler = new JwtSecurityTokenHandler();
        var token = CreateToken(lifetime: TimeSpan.FromSeconds(-10));

        Assert.Throws<SecurityTokenExpiredException>(() =>
            handler.ValidateToken(token, GetValidationParameters(), out _));
    }

    [Fact]
    public void ValidateToken_TamperedSignature_ThrowsException()
    {
        var handler = new JwtSecurityTokenHandler();
        using var wrongRsa = RSA.Create(2048);
        var wrongKey = new RsaSecurityKey(wrongRsa);

        // Signed with a different key than configured in validation params
        var token = CreateToken(keyToSignWith: wrongKey);

        Assert.ThrowsAny<SecurityTokenException>(() =>
            handler.ValidateToken(token, GetValidationParameters(), out _));
    }

    [Fact]
    public void ValidateToken_WrongIssuer_ThrowsException()
    {
        var handler = new JwtSecurityTokenHandler();
        // Issued by wrong authority (different issuer than configured)
        var token = CreateToken(issuer: WrongIssuer);

        Assert.Throws<SecurityTokenInvalidIssuerException>(() =>
            handler.ValidateToken(token, GetValidationParameters(validIssuer: ExpectedIssuer), out _));
    }

    [Fact]
    public void ValidateToken_MissingRolesClaim_DoesNotHaveRoleClaim()
    {
        var handler = new JwtSecurityTokenHandler();
        var token = CreateToken(claims: [new Claim("sub", "user-123")]); // missing 'roles' claim

        var principal = handler.ValidateToken(token, GetValidationParameters(), out _);

        Assert.Null(principal.FindFirst("roles"));
    }

    [Fact]
    public void ResourceOwnershipChecker_MatchesSubClaim_ReturnsTrue()
    {
        var checker = new ResourceOwnershipChecker();
        var claims = new[] { new Claim("sub", "vendor-42") };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

        var isOwner = checker.IsOwner(user, "vendor-42");

        Assert.True(isOwner);
    }

    [Fact]
    public void ResourceOwnershipChecker_MismatchSubClaim_ReturnsFalse()
    {
        var checker = new ResourceOwnershipChecker();
        var claims = new[] { new Claim("sub", "vendor-42") };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

        var isOwner = checker.IsOwner(user, "vendor-99");

        Assert.False(isOwner);
    }

    [Fact]
    public void ValidateToken_SignedWithRsaKey_ValidatedWithJwksKey_Succeeds()
    {
        // 1. Export JWKS from MockOidcIssuer parameters
        using var rsa = RSA.Create(2048);
        var signingKey = new RsaSecurityKey(rsa) { KeyId = "test-key-1" };
        var params_ = rsa.ExportParameters(false);

        var jwksJson = $"{{\"keys\":[{{\"kty\":\"RSA\",\"use\":\"sig\",\"kid\":\"test-key-1\",\"alg\":\"RS256\",\"n\":\"{Base64UrlEncoder.Encode(params_.Modulus)}\",\"e\":\"{Base64UrlEncoder.Encode(params_.Exponent)}\"}}]}}";

        var keySet = new JsonWebKeySet(jwksJson);
        var jsonWebKey = keySet.Keys.First();

        // 2. Sign token with signingKey
        var token = CreateToken(claims: [new Claim("sub", "user-123")], keyToSignWith: signingKey);

        // 3. Validate token with jsonWebKey
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = ExpectedIssuer,
            ValidateAudience = true,
            ValidAudience = ExpectedAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jsonWebKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(token, validationParams, out var _);
        Assert.NotNull(principal);
    }
}

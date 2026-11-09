using System.Security.Claims;
using BakeryMarketplace.Auth;

namespace BakeryMarketplace.Auth.Tests;

public class ClaimsExtensionsTests
{
    private static ClaimsPrincipal Principal(params Claim[] claims) => new(new ClaimsIdentity(claims, "test"));

    [Fact]
    public void SubjectId_is_the_sub_claim()
    {
        Assert.Equal("customer-1", Principal(new Claim("sub", "customer-1")).SubjectId());
    }

    [Fact]
    public void SubjectId_falls_back_to_the_name_identifier_claim()
    {
        Assert.Equal("customer-2", Principal(new Claim(ClaimTypes.NameIdentifier, "customer-2")).SubjectId());
    }

    [Fact]
    public void SubjectId_prefers_sub_when_both_are_present()
    {
        Assert.Equal("a", Principal(new Claim(ClaimTypes.NameIdentifier, "b"), new Claim("sub", "a")).SubjectId());
    }

    [Fact]
    public void SubjectId_is_null_without_either_claim()
    {
        Assert.Null(Principal(new Claim("role", "vendor")).SubjectId());
    }
}

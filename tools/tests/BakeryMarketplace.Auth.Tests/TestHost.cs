using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// An in-memory server for a test: the web host is configured by the test and run on <see cref="TestServer"/> through the generic host
/// (<c>HostBuilder.ConfigureWebHost</c> with <c>UseTestServer</c>), the supported replacement for <c>new TestServer(new WebHostBuilder())</c>,
/// which ASP.NET Core 10 deprecates (ASPDEPR004, ASPDEPR008). Disposing it stops and disposes the whole host. It starts synchronously, as the
/// deprecated constructor did, so a test that built a server in an expression still can.
/// </summary>
internal sealed class TestHost : IDisposable
{
    private readonly IHost _host;
    private readonly TestServer _server;

    private TestHost(IHost host)
    {
        _host = host;
        _server = host.GetTestServer();
    }

    public static TestHost Start(Action<IWebHostBuilder> configure)
    {
        ArgumentNullException.ThrowIfNull(configure);
        var host = new HostBuilder()
            .ConfigureWebHost(web =>
            {
                web.UseTestServer();
                configure(web);
            })
            .Build();
        host.Start();
        return new TestHost(host);
    }

    public HttpClient CreateClient() => _server.CreateClient();

    public HttpMessageHandler CreateHandler() => _server.CreateHandler();

    public void Dispose() => _host.Dispose();
}

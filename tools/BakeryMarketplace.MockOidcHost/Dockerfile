# Local development, and the disposable cloud dev environment (WI-DEP-001; the host enforces its own rules, see MockOidcDeployment). Build context is the repository root (see docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY tools/BakeryMarketplace.Secrets/ tools/BakeryMarketplace.Secrets/
COPY tools/BakeryMarketplace.Auth/ tools/BakeryMarketplace.Auth/
COPY tools/BakeryMarketplace.MockOidcHost/ tools/BakeryMarketplace.MockOidcHost/
RUN dotnet publish tools/BakeryMarketplace.MockOidcHost/BakeryMarketplace.MockOidcHost.csproj \
    -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5100
EXPOSE 5100
USER app
ENTRYPOINT ["dotnet", "BakeryMarketplace.MockOidcHost.dll"]

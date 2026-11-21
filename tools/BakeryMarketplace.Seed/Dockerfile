# The seed as an image, for the deployed dev environment's seed job (WI-DEP-001, register 224). Build context is the repository root:
#   docker build -f tools/BakeryMarketplace.Seed/Dockerfile -t bakery-seed .
# It runs once and exits. Where it may write is the seed's own guard (SeedTarget): the local emulator, or the dev environment only when the job sets
# Seed__AllowDeployedDev=true and Deployment__Environment=dev. Configuration comes from the environment; nothing is baked in, no secret is in the image.
# The aspnet base, not the plain runtime: the seed references the catalog and ordering services, which need the ASP.NET Core shared framework.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY tools/ tools/
COPY services/ services/
RUN dotnet publish tools/BakeryMarketplace.Seed/BakeryMarketplace.Seed.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER app
ENTRYPOINT ["dotnet", "BakeryMarketplace.Seed.dll"]

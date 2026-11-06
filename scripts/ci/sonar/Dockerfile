# The analysis image for scripts/ci/sonar-scan.mjs: the .NET 10 SDK, a Java runtime (the scanner engine needs one), the Node 24 binary
# (for the JavaScript and TypeScript analysis) and the SonarScanner for .NET, which analyses C# and, in the same run, the JS/TS files.
FROM node:24-bookworm-slim AS node
FROM mcr.microsoft.com/dotnet/sdk:10.0
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/* \
    && dotnet tool install --global dotnet-sonarscanner
ENV PATH="${PATH}:/root/.dotnet/tools"

# Image scan, 2026-11-23

Trivy: `aquasec/trivy sha256:8f6bb947dbc5`. High or critical findings that have a fix fail the scan; the rest are reported.

| Image | Critical | High | Medium | Low | Unknown | Fixable high or critical |
|---|---:|---:|---:|---:|---:|---:|
| `bakery-catalog:scan` | 0 | 5 | 40 | 6 | 0 | 5 |
| `bakery-ordering:scan` | 0 | 5 | 40 | 6 | 0 | 5 |
| `bakery-bff:scan` | 1 | 43 | 112 | 90 | 19 | 6 |
| `bakery-web:scan` | 1 | 43 | 112 | 90 | 19 | 6 |
| `bakery-mock-oidc:scan` | 0 | 5 | 40 | 6 | 0 | 5 |
| `bakery-seed:scan` | 0 | 5 | 40 | 6 | 0 | 5 |
| `jaegertracing/jaeger:2.22.0` | 0 | 9 | 27 | 5 | 1 | 9 |
| `mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-EN20261019` | 8 | 74 | 89 | 14 | 2 | 80 |
| `mcr.microsoft.com/dotnet/aspire-dashboard:13.6.2` | 0 | 0 | 0 | 0 | 0 | 0 |
| `otel/opentelemetry-collector-contrib:0.164.0` | 0 | 2 | 2 | 0 | 1 | 2 |
| `redis:7.4-alpine` | 0 | 0 | 1 | 0 | 0 | 0 |

## High or critical findings with a fix

### `bakery-catalog:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-109518 | apt | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-catalog_scan.tar (ubuntu 24.04) |
| CVE-2026-109518 | libapt-pkg6.0t64 | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-catalog_scan.tar (ubuntu 24.04) |
| CVE-2026-114146 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114147 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114149 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |

### `bakery-ordering:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-109518 | apt | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-ordering_scan.tar (ubuntu 24.04) |
| CVE-2026-109518 | libapt-pkg6.0t64 | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-ordering_scan.tar (ubuntu 24.04) |
| CVE-2026-114146 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114147 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114149 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |

### `bakery-bff:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-102276 | brace-expansion | 5.0.9 | 5.0.10, 3.0.7, 2.1.5, 1.1.19 | HIGH | Node.js |
| CVE-2026-102278 | brace-expansion | 5.0.9 | 5.0.11, 3.0.8, 2.1.6, 1.1.20 | HIGH | Node.js |
| CVE-2026-109383 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |
| CVE-2026-109869 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |
| CVE-2026-19534 | undici | 6.28.0 | 6.28.1, 7.29.1, 8.10.2 | HIGH | Node.js |
| CVE-2026-87018 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |

### `bakery-web:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-102276 | brace-expansion | 5.0.9 | 5.0.10, 3.0.7, 2.1.5, 1.1.19 | HIGH | Node.js |
| CVE-2026-102278 | brace-expansion | 5.0.9 | 5.0.11, 3.0.8, 2.1.6, 1.1.20 | HIGH | Node.js |
| CVE-2026-109383 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |
| CVE-2026-109869 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |
| CVE-2026-19534 | undici | 6.28.0 | 6.28.1, 7.29.1, 8.10.2 | HIGH | Node.js |
| CVE-2026-87018 | undici | 6.28.0 | 6.29.1, 7.30.1, 8.12.2 | HIGH | Node.js |

### `bakery-mock-oidc:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-109518 | apt | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-mock-oidc_scan.tar (ubuntu 24.04) |
| CVE-2026-109518 | libapt-pkg6.0t64 | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-mock-oidc_scan.tar (ubuntu 24.04) |
| CVE-2026-114146 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114147 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114149 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |

### `bakery-seed:scan`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-109518 | apt | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-seed_scan.tar (ubuntu 24.04) |
| CVE-2026-109518 | libapt-pkg6.0t64 | 2.8.3 | 2.8.4ubuntu0.1 | HIGH | /scan/bakery-seed_scan.tar (ubuntu 24.04) |
| CVE-2026-114146 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114147 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |
| CVE-2026-114149 | Microsoft.AspNetCore.App.Runtime.linux-x64 | 10.0.14 | 8.0.34, 9.0.23, 10.0.15, 11.0.0 | HIGH | usr/share/dotnet/shared/Microsoft.AspNetCore.App/10.0.14/Microsoft.AspNetCore.App.deps.json |

### `jaegertracing/jaeger:2.22.0`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-107891 | musl | 1.2.6-r2 | 1.2.6-r3 | HIGH | /scan/jaegertracing_jaeger_2.22.0.tar (alpine 3.24.2) |
| CVE-2026-107891 | musl-utils | 1.2.6-r2 | 1.2.6-r3 | HIGH | /scan/jaegertracing_jaeger_2.22.0.tar (alpine 3.24.2) |
| CVE-2026-85091 | zlib | 1.3.2-r0 | 1.3.2-r1 | HIGH | /scan/jaegertracing_jaeger_2.22.0.tar (alpine 3.24.2) |
| CVE-2026-78661 | golang.org/x/net | v0.58.0 | 0.62.0 | HIGH | cmd/jaeger/jaeger-linux |
| CVE-2026-78669 | golang.org/x/net | v0.58.0 | 0.60.0 | HIGH | cmd/jaeger/jaeger-linux |
| CVE-2026-111943 | stdlib | v1.27.1 | 1.26.10, 1.27.3 | HIGH | cmd/jaeger/jaeger-linux |
| CVE-2026-78667 | stdlib | v1.27.1 | 1.26.9, 1.27.2 | HIGH | cmd/jaeger/jaeger-linux |
| CVE-2026-78669 | stdlib | v1.27.1 | 1.26.9, 1.27.2 | HIGH | cmd/jaeger/jaeger-linux |
| CVE-2026-97031 | stdlib | v1.27.1 | 1.26.9, 1.27.2 | HIGH | cmd/jaeger/jaeger-linux |

### `mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-EN20261019`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-111181 | body-parser | 1.20.3 | 2.4.0, 1.20.9 | HIGH | Node.js |
| CVE-2026-90711 | proxy-addr | 2.0.7 | 2.0.8 | CRITICAL | Node.js |
| CVE-2026-32287 | github.com/antchfx/xpath | v1.3.4 | 1.3.6 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-41602 | github.com/apache/thrift | v0.21.0 | 0.23.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-43871 | github.com/apache/thrift | v0.21.0 | 0.24.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-32285 | github.com/buger/jsonparser | v1.1.1 | 1.1.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-63811 | github.com/dvsekhvalnov/jose2go | v1.6.0 | 1.7.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-68156 | github.com/expr-lang/expr | v1.17.2 | 1.17.7 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-116587 | github.com/go-jose/go-jose/v4 | v4.0.5 | 4.1.6 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-34986 | github.com/go-jose/go-jose/v4 | v4.0.5 | 4.1.4 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33815 | github.com/jackc/pgx/v5 | v5.7.4 | 5.9.0 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-33816 | github.com/jackc/pgx/v5 | v5.7.4 | 5.9.0 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-63209 | github.com/klauspost/compress | v1.18.0 | 1.18.7 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-42151 | github.com/prometheus/prometheus | v0.300.1 | 0.311.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-42154 | github.com/prometheus/prometheus | v0.300.1 | 0.311.3, 0.305.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77405 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-77408 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-77411 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-77403 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77404 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77406 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77407 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77410 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-77412 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-79921 | github.com/rabbitmq/amqp091-go | v1.10.0 | 1.13.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-24051 | go.opentelemetry.io/otel/sdk | v1.35.0 | 1.40.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39883 | go.opentelemetry.io/otel/sdk | v1.35.0 | 1.43.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-47913 | golang.org/x/crypto | v0.37.0 | 0.43.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39828 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39829 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39830 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39831 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39832 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39835 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-42508 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-46595 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-46597 | golang.org/x/crypto | v0.37.0 | 0.52.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56854 | golang.org/x/crypto | v0.37.0 | 0.55.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56864 | golang.org/x/mod | v0.24.0 | 0.40.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56865 | golang.org/x/mod | v0.24.0 | 0.40.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-25681 | golang.org/x/net | v0.39.0 | 0.55.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-27136 | golang.org/x/net | v0.39.0 | 0.55.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33814 | golang.org/x/net | v0.39.0 | 0.53.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39821 | golang.org/x/net | v0.39.0 | 0.55.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-46600 | golang.org/x/net | v0.39.0 | 0.56.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-78661 | golang.org/x/net | v0.39.0 | 0.62.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-78669 | golang.org/x/net | v0.39.0 | 0.60.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56851 | golang.org/x/text | v0.24.0 | 0.41.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56852 | golang.org/x/text | v0.24.0 | 0.39.0 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33186 | google.golang.org/grpc | v1.71.1 | 1.79.3 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2026-84304 | google.golang.org/grpc | v1.71.1 | 1.83.1 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-84445 | google.golang.org/grpc | v1.71.1 | 1.82.2, 1.83.2, 1.84.0-dev.0.20260825144003-d5a41119e0e3, 1.85.0-dev.0.20260825072537-93e31b48545e | HIGH | usr/local/bin/otelcol-contrib |
| GHSA-hrxh-6v49-42gf | google.golang.org/grpc | v1.71.1 | 1.82.1 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-68121 | stdlib | v1.24.2 | 1.24.13, 1.25.7, 1.26.0-rc.3 | CRITICAL | usr/local/bin/otelcol-contrib |
| CVE-2025-22874 | stdlib | v1.24.2 | 1.24.4 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-61726 | stdlib | v1.24.2 | 1.24.12, 1.25.6 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2025-61729 | stdlib | v1.24.2 | 1.24.11, 1.25.5 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-111943 | stdlib | v1.24.2 | 1.26.10, 1.27.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-25679 | stdlib | v1.24.2 | 1.25.8, 1.26.1 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-27145 | stdlib | v1.24.2 | 1.25.11, 1.26.4 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-32280 | stdlib | v1.24.2 | 1.25.9, 1.26.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-32281 | stdlib | v1.24.2 | 1.25.9, 1.26.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-32283 | stdlib | v1.24.2 | 1.25.9, 1.26.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33811 | stdlib | v1.24.2 | 1.25.10, 1.26.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33814 | stdlib | v1.24.2 | 1.25.10, 1.26.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-33818 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39820 | stdlib | v1.24.2 | 1.25.10, 1.26.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39821 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39822 | stdlib | v1.24.2 | 1.25.12, 1.26.5, 1.27.0-rc.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-39836 | stdlib | v1.24.2 | 1.25.10, 1.26.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-42499 | stdlib | v1.24.2 | 1.25.10, 1.26.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-42504 | stdlib | v1.24.2 | 1.25.11, 1.26.4 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56853 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56858 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56859 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56860 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-56862 | stdlib | v1.24.2 | 1.25.13, 1.26.6, 1.27.0-rc.3 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-78667 | stdlib | v1.24.2 | 1.26.9, 1.27.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-78669 | stdlib | v1.24.2 | 1.26.9, 1.27.2 | HIGH | usr/local/bin/otelcol-contrib |
| CVE-2026-97031 | stdlib | v1.24.2 | 1.26.9, 1.27.2 | HIGH | usr/local/bin/otelcol-contrib |

### `otel/opentelemetry-collector-contrib:0.164.0`

| Id | Package | Installed | Fixed in | Severity | Layer |
|---|---|---|---|---|---|
| CVE-2026-116587 | github.com/go-jose/go-jose/v4 | v4.1.5 | 4.1.6 | HIGH | otelcol-contrib |
| CVE-2026-78661 | golang.org/x/net | v0.61.0 | 0.62.0 | HIGH | otelcol-contrib |


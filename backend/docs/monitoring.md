# Application monitoring

The API exposes provider-neutral probes:

- `GET /health/live` returns `200` while the process can serve requests.
- `GET /health/ready` returns `200` only when PostgreSQL accepts a `SELECT 1`; database failure returns `503`.
- `GET /health/metrics` returns process uptime and RSS/heap memory bytes. It does not expose database details or user data.

Configure the deployment platform to use `/health/live` for liveness and `/health/ready` for readiness. Keep the probes on the internal network where the host supports that option. The metrics endpoint is intentionally small; use a platform collector to scrape or forward it if time-series monitoring is required.

Each HTTP response includes an `X-Request-ID` header. The API emits one JSON log record per request with the request ID, method, route template, status, and duration. Unhandled server errors add a structured exception event. Neither request bodies nor query strings are logged; internal error messages and stack traces are not returned to callers. Client error responses include the request ID to correlate support reports with server logs.

No external monitoring account, telemetry exporter, alert policy, or deployment-specific probe configuration is provisioned by this repository. Add those after selecting the production host.

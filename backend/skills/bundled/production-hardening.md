# Production Hardening

Reduce operational risk before shipping.

## Steps
- Add sane caps and timeouts for unbounded operations.
- Ensure graceful startup and shutdown paths for background services.
- Return machine-readable metadata for frontend diagnostics and observability.
- Keep security boundaries explicit (path guards, command safelists, auth checks).

## Output
- Hardening changes and why each lowers risk.
- Any new environment variables and defaults.
- Known residual risks requiring monitoring.

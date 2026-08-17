# Cron jobs

The app has three scheduled endpoints that must be triggered periodically. They
are protected by `CRON_SECRET` — every request must send
`Authorization: Bearer <CRON_SECRET>`.

| Endpoint | What it does | Suggested cadence |
| --- | --- | --- |
| `GET /api/cron/followups` | Sends due reminders, cart-recovery nudges, review requests | every 15 min |
| `GET /api/cron/webhooks` | Flushes the outbound-webhook delivery queue (POST + retry) | every 5 min |
| `GET /api/cron/broadcasts` | Sends scheduled LINE promo broadcasts | every 5 min |

## Vercel Hobby (free)

Hobby only allows **daily** crons, which is too infrequent here, so `vercel.json`
intentionally defines **no** crons. Drive the endpoints with an external
scheduler instead:

- **cron-job.org** — create three jobs, each with a custom header
  `Authorization: Bearer <CRON_SECRET>`.
- **Cloudflare Workers** — a scheduled Worker that `fetch()`es the three URLs
  with the same header.

## Vercel Pro

On Pro you can run them natively — add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/followups", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/webhooks", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/broadcasts", "schedule": "*/5 * * * *" }
  ]
}
```

Vercel Cron sends its own `Authorization` header derived from the project's
`CRON_SECRET`, so the same guard works.

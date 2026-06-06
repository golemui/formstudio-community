# FormStudio Community Edition

An AI-powered form builder, open-source edition. Runs entirely on Cloudflare Workers.
Only requires an Anthropic API key.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/golemui/formstudio-community)

---

## Quick start (local development)

```sh
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in your ANTHROPIC_API_KEY
npm install
npm run dev
```

- Angular: <http://localhost:5200>
- Worker:  <http://localhost:8787>

The Angular dev server proxies `/api/*` requests to the Worker (see `proxy.conf.json`).

---

## Deployment

One-time setup:

```sh
wrangler login
npm run deploy
wrangler secret put ANTHROPIC_API_KEY
```

---

## No database, no accounts

This edition has no auth layer -- the studio opens directly. No D1, no KV, no session tokens.

---

## Scripts

| Script               | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Start Angular + Wrangler Worker in watch mode                      |
| `npm run build`      | Production Angular build into `dist/browser/`                      |
| `npm run deploy`     | Build and deploy to Cloudflare Workers (requires `wrangler login`) |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts`                             |

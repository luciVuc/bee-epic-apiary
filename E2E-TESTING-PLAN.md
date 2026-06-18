# Bee Epic Apiary — Root E2E Testing Plan

Orchestration plan for testing all three sub-projects together: `services/` (Cloudflare Worker), `web/` (customer storefront), and `admin/` (admin panel).

**Executor**: AI agent with Playwright browser automation.
**Monitoring**: Throughout every test, the agent MUST continuously monitor:

- **Console**: Page console messages — fail on any `console.error`, `console.warn`, uncaught exceptions, or unhandled promise rejections
- **Network**: All API requests/responses — fail on any HTTP 4xx/5xx status, connection errors, timeouts, or CORS errors
- **DOM**: Unexpected elements like error banners, blank screens, infinite spinners (>10s), or layout breakage

---

## Pre-flight: Ensure Services API is Running

Before any test, ensure the services API server is running on port 8787. Kill any existing process on that port and restart cleanly.

```bash
# Kill any existing wrangler dev or process on port 8787
pkill -f "wrangler dev" || true
# Also kill any process stuck on port 8787
lsof -ti:8787 | xargs kill -9 2>/dev/null || true
# Wait for port to be free
sleep 2
```

Then install dependencies (if not already installed):

```bash
npm run services:install && npm run web:install && npm run admin:install
```

**Expected**: All node_modules installed without errors.

---

## Launch All Three Dev Servers

Start all servers in parallel with a single command, **or** start them individually. The AI agent must start each server in a separate background process and monitor its startup logs to confirm readiness.

**Option A — Single terminal (concurrently):**

```bash
npm run dev
```

**Option B — Three separate processes (recommended for E2E):**

```bash
# Start services worker first
npx wrangler dev --port 8787 &
sleep 5  # Wait for Wrangler to start

# Then start UI dev servers
npm run web:dev &
npm run admin:dev &
```

**Expected**:

- `services:dev` → Wrangler outputs `[wrangler]` logs, worker live on `http://localhost:8787`
- `web:dev` → Vite outputs `➜ Local: http://localhost:5173/`
- `admin:dev` → Vite outputs `➜ Local: http://localhost:5174/`

---

## Verify All Endpoints Are Reachable

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/products
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
curl -s -o /dev/null -w "%{http_code}" http://localhost:5174
```

**Expected**: `200` for all three.

---

## Verify CORS Flow

1. From `http://localhost:5174` (admin), make a `GET /api/products` request (proxied to worker).
2. Response must include `Access-Control-Allow-Origin` header.

---

## Run Web E2E Tests

```bash
# Web tests require services + web servers running
# Follow the plan in web/E2E-TESTING-PLAN.md
```

---

## Run Admin E2E Tests

```bash
# Admin tests require services + admin servers running
# Follow the plan in admin/E2E-TESTING-PLAN.md
```

---

## Shutdown & Cleanup

```bash
# Kill all dev servers
pkill -f "wrangler dev" || true
pkill -f "vite" || true
# Force-free ports if lingering
lsof -ti:8787 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
```

**Expected**: All processes terminate cleanly, ports are freed.

---

## Stripe Clean-Up

After E2E tests, clean up created Stripe test resources:

```bash
curl -s http://localhost:8787/products | \
  jq '.data[] | select(.name | startswith("E2E")) | .id' | \
  while read id; do
    curl -X DELETE "http://localhost:8787/products/$id" \
      -H "Authorization: Bearer dev-api-key-change-me"
  done
```

Best practice: always run cleanup after test completion to avoid accumulating test products in Stripe.

---

## Post-Deployment: Cloudflare Pages

After E2E testing, deploy all 3 projects to Cloudflare:

```bash
# Deploy worker + web Pages + admin Pages
npm run deploy
```

Or deploy individually:

```bash
npm run services:deploy   # Worker
npm run web:deploy        # Web storefront (Pages)
npm run admin:deploy      # Admin panel (Pages)
```

---

## Test Data Reset

```js
// Browser console / Playwright evaluate:
localStorage.removeItem("beeEpicCart");
localStorage.removeItem("beeEpicAdminSettings");
```

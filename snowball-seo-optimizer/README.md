# SEO Meta Optimizer Lite — Shopify App

An embedded Shopify app that fetches products, scores their SEO quality, displays results in Polaris Admin UI, allows editing SEO fields, and keeps scores updated via webhooks.

---

## Quick Start

### Prerequisites
- Node.js 20+ 
- A [Shopify Partner account](https://partners.shopify.com) (free)
- A Shopify Development Store
- Shopify CLI installed: `npm install -g @shopify/cli@latest`

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd snowball-seo-optimizer
npm install

# 2. Set up the database
npx prisma migrate deploy
npx prisma generate

# 3. Start the dev server (handles OAuth + ngrok tunnel automatically)
npm run dev
```

The CLI will:
1. Open a browser to connect your Shopify Partner app
2. Start an ngrok tunnel (your public URL)
3. Prompt you to install the app on your dev store

### Environment Variables

`shopify app dev` auto-populates `.env` with your credentials. The full `.env` looks like:

```
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-tunnel.trycloudflare.com
SCOPES=read_products,write_products
DATABASE_URL="file:./prisma/dev.sqlite"
```

---

## Architecture

```
app/
├── routes/
│   ├── app._index.tsx          # Main Polaris dashboard (UI entry point)
│   ├── app.tsx                 # Auth guard + AppProvider layout
│   ├── api.products.tsx        # GET (list) + POST (sync/bulk-rescore)
│   ├── api.products.$id.tsx    # PUT (update SEO fields)
│   ├── auth.tsx                # OAuth login handler
│   ├── webhooks.products.update.tsx   # products/update webhook
│   ├── webhooks.app.uninstalled.tsx   # Cleanup on uninstall
│   └── webhooks.app.scopes_update.tsx # Scope change acknowledgment
├── services/
│   ├── seoService.server.ts    # Pure SEO scoring logic (no side effects)
│   └── productService.server.ts # Shopify GraphQL + DB operations
├── db.server.ts                # Prisma client singleton
├── shopify.server.ts           # Shopify SDK config + webhook registration
└── routes.ts                   # File-system based routing config

prisma/
├── schema.prisma               # Session + Product models
└── migrations/                 # SQLite migration history
```

### Key Design Decisions

- **`seoService.server.ts` is pure** — takes data in, returns `{ score, issues }` with zero side effects. Easy to unit test or swap out the scoring rules.
- **`productService.server.ts` owns all I/O** — Shopify GraphQL calls and all DB operations live here, keeping routes thin.
- **SQLite via Prisma** — zero setup, single file, sufficient for this scope. Swap to Postgres by changing `provider` in `schema.prisma`.
- **React Router flat-file routing** — `app/routes/` maps directly to URL paths via the `@react-router/fs-routes` flat convention.

---

## SEO Scoring Logic

Each product gets a score from 0–100. Deductions:

| Check | Deduction | Issue Badge |
|-------|-----------|-------------|
| Title Missing (empty) | −50 | `Title Missing` |
| Title < 30 chars | −10 | `Title Too Short` |
| Title > 60 chars | −10 | `Title Too Long` |
| Meta Missing (empty) | −40 | `Meta Missing` |
| Meta < 120 chars | −20 | `Meta Too Short` |
| Meta > 160 chars | −10 | `Meta Too Long` |
| Keyword missing in meta | −10 | `Keyword Missing` |

**Primary Keyword**: Defined as the first 2–3 words of the product title. The app checks if these words appear anywhere in the meta description (case-insensitive).

### Implementation Note: Fallback vs Import
Shopify defaults to using the product title and description if SEO meta fields are not set by the user. Our app explicitly **imports** these defaults into our local database during sync. This ensures that users always see a baseline score and can immediately identify products that need better optimization (e.g., if the default description is too short).

---

## Webhook Verification

HMAC verification is handled **automatically** by `@shopify/shopify-app-react-router`. When `authenticate.webhook(request)` is called:

1. It reads the `X-Shopify-Hmac-Sha256` header
2. Computes `HMAC-SHA256(body, SHOPIFY_API_SECRET)`
3. Compares in constant time (timing-safe)
4. Returns `401` if invalid — your handler code never runs

You do **not** need to implement this yourself. The SDK enforces it on every call.

---

## Idempotency Handling

The `products/update` webhook can fire multiple times for the same update (Shopify guarantees at-least-once delivery). We handle this in `productService.server.ts`:

```ts
// rescoreProduct() checks before processing:
if (existing?.shopifyUpdatedAt === webhookUpdatedAt) {
  return false; // already processed — skip
}
```

Each product stores `shopifyUpdatedAt` (the `updatedAt` timestamp from Shopify's payload). If the incoming webhook carries the same timestamp as what we've stored, we skip re-scoring. This makes the handler **idempotent** — safe to call multiple times with the same data.

---

## What I'd Improve for Production

| Area | Improvement |
|------|-------------|
| **Database** | Switch from SQLite to Postgres (connection pooling, concurrent writes) |
| **Job Queue** | Move `syncProducts` to a background job (Bull/Inngest) — don't block the HTTP response |
| **Rate Limiting** | Implement Shopify GraphQL cost tracking + retry-after backoff |
| **Webhooks** | Add a dead-letter queue + retry mechanism for failed webhook processing |
| **Auth** | Token refresh handling + multi-session support |
| **AI Meta Gen** | OpenAI integration to auto-generate improved meta descriptions |

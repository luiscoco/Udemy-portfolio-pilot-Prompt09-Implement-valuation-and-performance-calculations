# Valuation and Performance Calculations

This learning activity adds financial calculations and a private portfolio summary API to PortfolioPilot, a teaching project for managing stock portfolios. The calculations use USD stocks and long-only positions: users can sell shares they own, but cannot sell more than they hold. The next activity connects these results to the frontend.

## 1. Purpose and Learning Goals

The prompt asked the coding agent to calculate remaining shares, weighted average acquisition cost, remaining cost basis, realized gain or loss, market value, unrealized gain or loss, and allocation weights. It also required correct fee handling, explicit missing/stale quote behavior, tests, and an API that only exposes a user's own portfolios.

These rules matter because small arithmetic errors can accumulate across trades. Treating an unavailable price as zero can also invent a loss. Students will learn how to:

- Write a **pure function**: the same inputs produce the same output, without database access or changing the inputs.
- Preserve decimal precision instead of using JavaScript's binary floating-point `Number` for money.
- Replay a **ledger**, the ordered history of purchases and sales, and reject a sale that exceeds inventory at any point in that history.
- Separate accounting results from results that require a market quote.
- Use authentication to enforce **ownership**, so one user's portfolio cannot be read by another user.
- Test calculations independently, then test the API with real sessions and PostgreSQL.

### Financial terms used here

| Term | Meaning |
| --- | --- |
| Remaining quantity | Shares still owned after purchases and sales |
| Acquisition cost | Purchase cost, including buy fees |
| Weighted average acquisition cost | Remaining acquisition basis divided by remaining shares |
| Remaining cost basis | Acquisition cost assigned to shares still owned |
| Sold cost basis | Acquisition cost assigned to shares already sold |
| Realized gain/loss | Sale proceeds after sell fees, minus the sold basis |
| Market value | Remaining shares multiplied by a usable quote price |
| Unrealized gain/loss | Market value minus remaining basis |
| Allocation weight | A position's share of total market value; `0.25` means 25% |

Gains are not described as time-weighted investment returns. That kind of return measures performance while accounting for the timing of money entering or leaving a portfolio; it was not implemented in this activity.

## 2. Implementation Steps Actually Performed

The implementation followed this sequence:

1. **Inspected the existing project.** Read the project contract, current state, milestone 09 scope, architecture decisions, ledger validation, transaction services, authentication, database schema, and existing tests. Checked installed Prisma isolation definitions and Next.js route documentation before using those APIs.
2. **Added exact decimal arithmetic.** Created `packages/domain/src/decimal.ts`. It represents values as reduced fractions using `BigInt`, JavaScript's integer type for arbitrarily large whole numbers. Fractions preserve repeating averages without rounding during each sale. No dependency was added.
3. **Added the pure summary calculation.** Created `packages/domain/src/valuation.ts` and exported it from `packages/domain/src/index.ts`. It sorts trades by UTC timestamp and database ledger order, includes buy fees in basis, subtracts sell fees from proceeds, and validates historical inventory. UTC timestamps here use the form `2025-01-02T00:00:00.000Z`; `Z` means UTC.
4. **Defined quote and rounding rules.** Added explicit quote states and output-only rounding. A partial sale removes a proportional share of basis without changing the remaining unit cost. Calculations use original quantity, price and fees rather than the ledger's already-rounded `amount` field.
5. **Added the owner-scoped service and API.** Created `packages/db/src/summary-service.ts`, updated database exports and API authorization, and added `apps/api/app/api/portfolios/[id]/summary/route.ts`. Added the shared summary schema in `packages/contracts/src/index.ts`. A schema validates the response shape; financial values cross JSON as strings. The service reads the ledger and quotes in a **repeatable-read transaction**, which keeps related database reads on one consistent snapshot.
6. **Added meaningful tests.** Created `packages/domain/src/valuation.test.ts` and extended `apps/api/lib/portfolio.integration.test.ts`. Coverage includes the reference case, liquidation and repurchase, fractional shares, repeating averages, missing/stale/invalid quotes, allocation, rounding, and invalid chronological inventory. The API test checks real session ownership and archived portfolio access.
7. **Restored packages and ran checks.** Used the pinned lockfile to install dependencies, then ran typecheck, tests, the browser dependency boundary check, and the production build. Inspected and reused the existing disposable PostgreSQL databases. Initial Prisma cache and Docker access failures were resolved with the required local access; final checks passed. Changed the domain test script to search only `src`, because compiled tests in `dist` were otherwise running twice.
8. **Recorded the results.** Updated [project state](docs/project-state.md), created [lesson 09](docs/lessons/09-valuation-and-performance.md) and [ADR 0005](docs/decisions/0005-exact-valuation-and-quote-policy.md), and updated the decision index. An ADR is an architecture decision record: it explains a design choice and its tradeoffs.

No database schema or migration was changed. No dependencies were upgraded, application data reset, cloud resources created, or code deployed, committed or pushed. This workspace was not a Git repository.

### Commands used during implementation

The npm commands were run through the installed Node 24.21.0/npm CLI because the local npm launcher had an execution issue. With a working Node/npm installation, the equivalent commands are:

```powershell
npm ci --ignore-scripts --offline
npm run typecheck
npm run test
npm run check:browser-boundary
npm run test --workspace @portfolio-pilot/api
npm run build
```

The final `npm run test` had both dedicated database test URLs set, as shown below. Offline installation worked because packages were already cached; students without that cache should use `npm ci`.

## 3. Results Achieved

### Verified reference calculation

The automated tests verified this ledger:

| Step | Trade | Accounting result |
| --- | --- | --- |
| 1 | Buy 10 shares at $100, fee $2 | Basis $1,002 |
| 2 | Buy 5 shares at $120, fee $1 | Basis $1,603 for 15 shares |
| 3 | Sell 6 shares at $130, fee $3 | Net proceeds $777; sold basis $641.20; realized gain $135.80 |
| 4 | Value the remaining 9 shares at $125 | Remaining basis $961.80; market value $1,125; unrealized gain $163.20 |

The average unit cost before and after the partial sale is the same. Its output string is `"106.8666666667"`; the internal value retains the exact fraction.

With the fresh synthetic $125 quote used by the API acceptance test, the response includes the following verified values. This is an excerpt, not the complete response:

```json
{
  "summary": {
    "valuationComplete": true,
    "remainingCostBasis": "961.80",
    "soldCostBasis": "641.20",
    "realizedGainLoss": "135.80",
    "marketValue": "1125.00",
    "unrealizedGainLoss": "163.20"
  }
}
```

### Rounding and quote behavior

Internal arithmetic is exact. At the output boundary, USD amounts use two decimal places; quantities, average unit costs, and allocation ratios use ten. Rounding is half up, with negative ties away from zero: `1.005` becomes `1.01`, and `-0.005` becomes `-0.01`. Totals are calculated before rounding, so displayed position amounts may not sum exactly to displayed totals.

Quotes are fresh when their age is at most 15 minutes relative to the summary timestamp. Future quotes are excluded. Each position reports `fresh`, `stale`, `missing`, `invalid`, or `not_required` when fully liquidated. Available quote metadata includes the provider, timestamp and synthetic-data label.

A missing, stale or invalid quote does not become a zero price. That position's market value and unrealized gain are `null`, meaning unavailable. If any open position cannot be valued, portfolio market/unrealized totals and all allocation weights are also `null`. Cost basis and realized gains remain available. Empty or fully liquidated portfolios can be valued at zero without quotes.

### API behavior verified with PostgreSQL

```text
GET /api/portfolios/:id/summary
```

The endpoint returns `{ summary }` with `Cache-Control: no-store`, telling clients not to cache private financial responses. The authenticated session supplies ownership; a browser cannot select an owner by sending a user ID. Anonymous requests return HTTP 401. A foreign portfolio and a nonexistent portfolio both return 404. Archived portfolios remain readable.

### Observed check results

| Check | Recorded milestone 09 result |
| --- | --- |
| Pinned offline installation | 347 packages added; zero audit vulnerabilities reported |
| `npm run typecheck` | Passed across all workspaces after Prisma cache access was resolved |
| `npm run build` | Passed for web, API and worker; summary route present in build output |
| `npm run check:browser-boundary` | Passed; browser dependencies do not include backend-only packages |
| Final `npm run test` with both database URLs | 55 tests passed, none skipped |
| Domain tests within the final run | Eight distinct tests passed, including seven new valuation tests |
| API tests within the final run | All 26 passed, including nine portfolio PostgreSQL acceptance tests |

An earlier run without test database URLs skipped 17 integration tests and included duplicate compiled domain tests. Source-only domain discovery corrected that duplication before the final run. These results describe the implementation run; creating this README did not rerun the application checks.

## 4. How to Run and Verify

Run commands from the repository root. Command examples use PowerShell.

### Prerequisites

- Node.js 24.21.0 and npm 11.19.0, matching the project toolchain. See [versions](docs/versions.md).
- For the application and API integration tests: local PostgreSQL with the existing migrations applied. Docker Desktop must be running if using the provided containers.
- Redis is included in the local application setup, but financial calculations and summary acceptance do not require Redis.
- No AI, market-data or Microsoft Entra credentials are needed for the local demo. Demo sign-in uses seeded Alice/Bob accounts and must remain a local development setting.

### Install and verify pure calculations

```powershell
node --version
npm --version
npm ci
npm run build:types
npm run test --workspace @portfolio-pilot/domain
npm run typecheck
npm run build
npm run check:browser-boundary
```

The domain tests need no database or provider credentials. The expected domain result is eight tests passed. `build:types` compiles shared packages and generates the Prisma client before consumers import them. If Prisma reports `EPERM` on its engine cache, resolve that local filesystem permission and rerun `npm run build:types`; this was the initial implementation blocker, not a calculation failure.

### Start the local application

The following setup follows the existing local-demo workflow; it was not a new infrastructure setup performed in milestone 09. Preserve an existing `.env.local` and merge needed settings instead of overwriting it.

```powershell
npm run infra:start
if (!(Test-Path apps/api/.env.local)) {
  Copy-Item apps/api/.env.example apps/api/.env.local
}
$env:DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5432/portfolio_pilot'
$env:NODE_ENV='development'
$env:ALLOW_DEMO_SEED='true'
npm run build:types
npm run migrate:deploy --workspace @portfolio-pilot/db
npm run seed:demo --workspace @portfolio-pilot/db
npm run dev
```

The example credentials are public local-only values. In `apps/api/.env.local`, keep `DATA_MODE=mock`, `DEMO_AUTH_ENABLED=true` and `AUTH_BASE_URL=http://localhost:5173`. Leave Entra and AI credentials absent for this demo. Seeding is an explicit development fixture operation, not a way to correct financial history. See [lesson 07](docs/lessons/07-authentication-and-authorization.md) for authentication setup.

Open exactly **http://localhost:5173** and choose Alice. Vite serves the React frontend on port 5173 and proxies `/api` requests to Next.js on port 3001.

### Manual browser-console demonstration

These are instructions for a manual check, not a browser smoke test performed during milestone 09. In browser developer tools, run:

```javascript
const send = async (path, method = 'GET', body, key) => {
  const response = await fetch('/api/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
};
const created = await send('portfolios', 'POST', {
  name: 'Lesson 09 ' + crypto.randomUUID(), currency: 'USD'
});
const id = created.body.portfolio.id;
const trade = {
  security: { symbol: 'ACME', exchangeMic: 'XNAS', currency: 'USD' },
  side: 'BUY', quantity: '10', price: '100', fees: '2',
  occurredAt: '2025-01-02T00:00:00.000Z'
};
await send(`portfolios/${id}/transactions`, 'POST', trade, crypto.randomUUID());
await send(`portfolios/${id}/transactions`, 'POST', {
  ...trade, quantity: '5', price: '120', fees: '1',
  occurredAt: '2025-01-03T00:00:00.000Z'
}, crypto.randomUUID());
await send(`portfolios/${id}/transactions`, 'POST', {
  ...trade, side: 'SELL', quantity: '6', price: '130', fees: '3',
  occurredAt: '2025-01-04T00:00:00.000Z'
}, crypto.randomUUID());
await send(`portfolios/${id}/summary`);
```

An **idempotency key** identifies one posting request so retrying that same request with the same key does not create a duplicate trade. `ACME/XNAS` is a seeded synthetic security, not real investment evidence.

Expected with historical seed quotes: remaining quantity `"9.0000000000"`, remaining basis `"961.80"`, realized gain `"135.80"`, and unavailable market/unrealized values with stale quote status. The $1,125/$163.20 valuation requires a fresh $125 quote; the automated acceptance test supplies one temporarily. Sign out, sign in as Bob, and request the saved Alice portfolio ID: expect 404.

### Reproduce database acceptance checks

An **integration test** checks components working together. These tests call actual Route Handlers with signed sessions and PostgreSQL; they do not start or exercise a browser.

The implementation reused the existing `portfolio-pilot-m06-verify` container on port 5546, with migrated databases named `portfolio_m08_verify` and `portfolio_m07_auth_verify`. For that same prepared environment:

```powershell
$env:PORTFOLIO_TEST_DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5546/portfolio_m08_verify'
$env:AUTH_TEST_DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5546/portfolio_m07_auth_verify'
npm run test
```

Expected: 55 tests passed, none skipped. To run only API checks, use:

```powershell
npm run test --workspace @portfolio-pilot/api
```

Expected with both URLs: 26 API tests passed. The new summary test creates a fresh synthetic $125 quote and removes it afterward, along with its temporary portfolio. Tests also seed fixtures and create sessions in these disposable databases.

If the verification container/databases are absent, prepare isolated local databases using the earlier [portfolio test setup](docs/lessons/08-portfolio-and-transaction-apis.md#focused-postgresql-acceptance) and [authentication test setup](docs/lessons/07-authentication-and-authorization.md#acceptance-verification). Database creation is a one-time step; do not recreate existing databases. Tests require the documented database names and a loopback host. Never use application data for these suites. Without their respective URLs, the integration suites explicitly skip; that does not verify API ownership.

## 5. Limitations and Unfinished Work

- **Frontend integration is next.** Financial screens still show teaching fixtures. Milestone 10 will connect them to these private APIs.
- **No browser smoke test was performed for the summary route.** Real session/PostgreSQL acceptance passed; the console steps above are the remaining manual check.
- **Freshness is a simple age rule.** The 15-minute policy does not account for exchange hours, holidays or provider-specific delays. Live quote ingestion remains later work.
- **Long histories may be expensive.** Summary calculation replays the full ledger; exact fraction sizes can grow with many trades.
- **Rounded displays can differ.** Rounded rows may not sum exactly to rounded totals, and rounded allocation ratios may not sum exactly to one.
- **Build warnings remain.** Vite reported module-level `use client` directive warnings; Next.js reported three existing Node/Edge instrumentation warnings. They did not prevent the verified build.
- **Real Microsoft Entra sign-in remains unverified** without tenant credentials. Local demo authentication was used for this activity.
- **Scope is deliberately limited.** No time-weighted returns, dividends, taxes, FX conversion, corporate actions, leverage, short selling or broker trade execution were added.

No required local check remained blocked at the end of milestone 09. Initial filesystem/container permission issues were resolved and checks rerun. No public deployment was performed.

## Further Reading

- [Project contract](AGENTS.md)
- [Current project state and detailed verification record](docs/project-state.md)
- [Milestone plan](docs/project-plan.md)
- [Lesson 09: calculation rules and tests](docs/lessons/09-valuation-and-performance.md)
- [ADR 0005: exact valuation and quote policy](docs/decisions/0005-exact-valuation-and-quote-policy.md)

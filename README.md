# VERUN Solana opportunity scan client

This repository now contains a local Solana devnet x402 client and a public
product/client guide. Opportunity scans are the paid action in the shared
[VERUN ASP gateway](https://github.com/verun-ai/verun-asp-gateway-mcp/pull/3).
Opportunity details, explicit mandate checks and handoff preparation remain free.
Payment does not establish investor eligibility or execute an investment.

The validator, score and SBT implementation is retired. Existing API routes return
HTTP 410. The historical implementation remains at
`b9996739567e4c60024d6d1ed428437bd920cf58`.

**Status:** implementation candidate, not activated or funded-tested. Development
price: 5,000 atomic Circle devnet USDC units (0.005 test USDC) per scan. This is not
a mainnet price. See [migration work packages](docs/PRODUCT_MIGRATION.md).

## Local setup

Use Node.js 22.13+ on macOS/Linux and `npm ci`. A reviewed gateway with the Solana
adapter enabled must exist before a real test can run. Do not point this client
at the old Solana demo or assume the gateway draft has been deployed.

1. Copy `client.config.example.json` to a private local `client.config.json`.
   Replace both placeholders with the operator-approved canonical HTTPS scan URL
   and merchant receiving address. Obtain these independently of a 402 response.
2. Put the gateway's **REST ASP token** in a private file (mode 0600). The MCP token
   is separate. Never paste either token into a browser, prompt or ticket.
3. For an authorized funded devnet test only, use an existing locally controlled
   devnet payer keypair file: JSON array of 64 bytes, mode 0600. The client neither
   generates/funds a wallet nor prints its private key. Never use a mainnet key.
4. Export the following paths. The CLI does not automatically load `.env`:

```sh
export VERUN_CLIENT_CONFIG_FILE=/absolute/private/client.config.json
export VERUN_GATEWAY_TOKEN_FILE=/absolute/private/gateway-token
export SOLANA_PAYER_KEYPAIR_FILE=/absolute/private/devnet-payer.keypair.json
```

Token and key files must be owned by the current user, private and not symlinks.
The dedicated state directory is created with mode 0700; state files use 0600.
The directory must remain private. `.verun-client/` is ignored by Git.

## Prepare, approve and recover

Edit `query.example.json` or create your own query. The shared gateway validates
its search schema before billing. Do not supply `requestId` or `paymentSignature`;
the client creates and persists the request ID before its first network call.

```sh
npm run scan -- prepare --query query.example.json --state .verun-client/scan.json
```

Preparation requests payment requirements without paying. Review the query,
recipient, 0.005 test-USDC price, Solana devnet network and expiry. To explicitly
approve this test payment:

```sh
npm run scan -- pay --state .verun-client/scan.json --approve-test-usdc
```

The official SVM SDK builds a v0 USDC transfer with the gateway's opaque scan
reference as its memo. The client saves the signed payload durably **before**
submitting it. It prints the gateway's actual scan result and bound receipt only
on validated success; empty results are still a completed paid scan.

```sh
npm run scan -- status --state .verun-client/scan.json
npm run scan -- retry --state .verun-client/scan.json
```

A retry reuses the exact saved body, request ID and signed payload. It never
re-signs or creates a new purchase. It also recovers an unpaid preparation whose
response was lost. It is safe to restart the CLI between these commands.

Keep private state until settlement and fulfillment are resolved. Do not delete
it, edit it or generate a fresh ID to recover uncertain settlement. A gateway
`reconciliation`, `verifying` or `settling` state requires operator investigation.
An expired signed payment is not automatically refreshed. An interrupted process
leaves a `.lock` file: confirm that process has stopped, retain the state, then
remove only its stale lock and inspect status. The gateway remains the authority
for settlement; local file locking is an additional concurrency safeguard.

A genuinely new scan uses a new state filename after the prior purchase is
resolved. This client currently supports one configured gateway principal and a
local keypair signer. Browser wallet integration is deferred until the gateway's
public end-user authentication model is defined; the public site never receives
the shared ASP token or holds payer keys.

## Public guide and retired routes

`npm run api` serves `public/` on `http://127.0.0.1:3010`. It does not proxy scans or
load payment credentials. Only public files are served. `/api/health` reports
`payments: local-client-only`; that is not gateway/payment readiness.

`score`, `evaluate`, `validators`, `mint-sbt`, `revoke-sbt`, `sbt-status`, `sbt-list`,
`config-check` and `funding-status` return HTTP 410 under both `/` and `/api/`.
Old faucet, key-printing, memo self-transfer and simulated investment scripts have
been removed. See [deployment and rollback](DEPLOY.md).

## Verification

```sh
npm run check
npm audit
# Build the matching gateway candidate first, then test the actual HTTP boundary:
VERUN_GATEWAY_SOURCE=/absolute/path/to/verun-asp-gateway-solana npm run test:gateway
```

Unit/entry-point tests cover recovery, private storage, explicit approval,
request/policy mismatch, legacy route retirement, static-file isolation and real
SDK transaction construction/signature verification. The companion integration
suite uses the actual gateway HTTP routes, SQLite and catalog, deliberately loses
a paid response, then recovers the stored scan with exactly one signature and
one mocked settlement. RPC reads and facilitator settlement are mocked. These
checks do not prove funded on-chain settlement, fee sponsorship or live deployment.

SDK versions match the gateway: `@x402/core` and `@x402/svm` 2.19.0, Solana Kit
5.1.0. `client/policy.js` mirrors the gateway signer policy; changes must update
both and rerun the companion test. `qs` is overridden to patched 6.16.0; inherited
`body-parser` and `proxy-addr` lockfile entries were updated without a framework
major upgrade. The client audit reports zero vulnerabilities at this checkpoint.

Reference: [official x402 buyer integration](https://docs.x402.org/getting-started/quickstart-for-buyers).

# Migration to paid opportunity scans

Decision confirmed by Nils on 8 October 2026. VERUN no longer uses the validator
consensus product model. Solana x402 will gate opportunity scans in the shared
ASP gateway. Details, mandate checks and handoff preparation remain free.

## Implementation sequence

1. SOL-01 — product boundary, source evidence and work ledger.
2. SOL-02 — opt-in Solana devnet configuration and official SVM SDK.
3. SOL-03 — durable scan-bound settlement/fulfillment across REST and MCP.
4. SOL-04 — replace this repo's validator/SBT demo with the gateway client; retire
   old public score, evaluation, mint/revoke and funding mutation routes.
5. SOL-05 — rewrite UI, agent instructions, economics and deployment docs around
   actual paid scans; remove simulated investment execution.
6. SOL-06 — integration review, drift/rollback checks and authorized devnet E2E.

Canonical implementation ledger: `docs/solana-work-packages.md` in
`verun-ai/verun-asp-gateway-mcp`, branch `feat/solana-paid-opportunity-scans`.
Wiki page: **VERUN Solana Paid Opportunity Scans**.

## Current checkpoint — client migration

SOL-01–03 are implemented in gateway draft PR #3. SOL-04/05 now have a
local CLI and public guide candidate in this repository. No application deployment,
funded payment, investment execution or mainnet activation has been performed.

- Real prepare/approve/status/retry CLI using the official SVM SDK, pinned
  devnet USDC and a separately approved endpoint/recipient.
- Private durable state, payload persistence before submission and identical
  recovery across process restarts. No automatically renewed payment.
- Every old score/validator/SBT/config/funding route returns 410; old signing,
  funding and fake execution code removed. Static serving is limited to public/.
- Public copy, agent instructions and deployment guide describe opportunity scans.
  Browser wallet integration is deferred until end-user authentication is defined;
  a shared gateway secret must not be put in a public browser. The usable payer
  integration in this package is the local CLI.
- Tests include the actual local routes, serverless handlers, official SDK local
  signing, and a companion actual gateway HTTP/SQLite/catalog test recovering a
  lost response with one signature and one mocked settlement.

The gateway candidate uses 0.005 test USDC per scan. Production restrictions stay.
Preserve baseline `b9996739567e4c60024d6d1ed428437bd920cf58` for historical reference.
SOL-06 remains pending operator configuration, funded acceptance and release review.

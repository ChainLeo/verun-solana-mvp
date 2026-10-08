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

## Current checkpoint

SOL-01–03 are implemented/documented as a local gateway candidate; SOL-04 has a
payer-side signing helper but this repo's legacy runtime is not migrated yet.
The full plan must not be read as completed work. No application deployment,
funded payment or mainnet activation has been performed.

The new gateway candidate uses 0.005 test USDC per scan on Solana devnet,
server-authoritative pricing, signed opaque request references and durable
replay/fulfillment controls. Its executable production restrictions remain.

Do not adapt `evaluateAgent` into the new payment service. Reuse the ASP gateway
catalog, mandate/handoff contract and new SVM adapter. Old memo self-transfers
are not payment receipts and caller-supplied scores are not authorization.

Preserve baseline commit `b9996739567e4c60024d6d1ed428437bd920cf58` for historical
reference/rollback. The next package removes the legacy surface rather than
silently changing old score API calls into paid requests.

# Verun Solana MVP

The Trust Layer for Agentic Finance — anchored on **Solana Devnet**.

A 2-of-3 validator consensus protocol that scores AI agents and writes every verdict to Solana as a memo-anchored transaction (sha256 of the verdict payload, anchored via an SPL-Memo instruction + 1-lamport self-transfer).

This repo is a Solana port of [`verun-stellar-mvp`](https://github.com/Fahad00674/verun-stellar-mvp). Same API surface, same validator logic, same UI — only the chain has changed.

> **Secrets policy.** `.env.example` ships with placeholders only. Real keys live in your local `.env` (gitignored) and in Vercel project env vars. Run `npm run genkey` on first checkout — never commit `.env`.

## Quick start (local)

```bash
npm install
cp .env.example .env

# 1. Generate a fresh keypair and fund it via Devnet airdrop
npm run genkey
# Paste the printed SOLANA_PUBLIC + SOLANA_SECRET (b58) into .env,
# replacing the PASTE_BASE58_* placeholders.

# 2. Sanity check
npm run check    # prints address + SOL balance
npm run selftx   # submits a real Devnet TX, prints explorer URL

# 3. Run the API
npm run api      # http://localhost:3010
```

Smoke test the live endpoints:

```bash
chmod +x scripts/smoke-live.sh
./scripts/smoke-live.sh http://localhost:3010
# All five checks should print green-tickable values.
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health`          | Service heartbeat |
| GET  | `/api/validators`      | List validator set |
| GET  | `/api/config-check`    | Validate SOLANA_SECRET, RPC reachability |
| GET  | `/api/funding-status`  | Account balance + auto-airdrops if missing |
| POST | `/api/score`           | Run validators only (no anchor) |
| POST | `/api/evaluate`        | Run validators + anchor verdict on Solana Devnet |
| POST | `/api/mint-sbt`        | Issue protocol-custodial SBT credential |
| POST | `/api/revoke-sbt`      | Kill-switch: revoke an SBT credential |
| GET  | `/api/sbt-status`      | Read latest credential state for one agent |
| GET  | `/api/sbt-list`        | List all currently-credentialed agents |

## Architecture mapping (Stellar → Solana)

| Stellar concept                       | Solana mapping                              |
|---------------------------------------|---------------------------------------------|
| Horizon Server                        | `Connection` (devnet RPC)                   |
| Friendbot funding                     | `connection.requestAirdrop()`               |
| `Memo.hash` + 1-stroop self-payment   | SPL-Memo instruction + 1-lamport self-transfer |
| `manageData(name, value)` registry    | SPL-Memo audit trail (`vtrust-mint:` / `vtrust-revoke:` prefixes) on protocol account |
| `account.data_attr[key]` lookup       | `getSignaturesForAddress` + parse memos     |
| `manageData(name, null)` revoke       | `vtrust-revoke:<agentId>:...` memo TX       |

The SBT registry is the protocol account's transaction history of memo-tagged events. Latest event per `agentId` is the current state. Anyone can verify by running `getSignaturesForAddress(issuer)` against any Solana RPC — no Verun API call required.

> **Upgrade path:** drop in Token-2022 NonTransferable mints or Metaplex Core assets behind the same `/api/{mint,revoke,status,list}-sbt` surface when needed for production.

## SBT scaling tradeoff (honest grant note)

The MVP's SBT model — memo events on the protocol account, scanned via `getSignaturesForAddress` — is **deliberately the simplest pattern that preserves the "anyone can verify on-chain" property of the Stellar version**. It is not a long-term scaling choice. The honest constraints:

| Property | Current MVP | Implication |
|---|---|---|
| Lookup complexity | `O(n)` over recent signatures | `/api/sbt-status` and `/api/sbt-list` walk the protocol account's signature history each call. |
| Scan window | `SBT_SCAN_LIMIT` env (default 200) | Only the last N transactions are inspected. A credential minted 1000 mints ago will appear as "not credentialed" if the cap is 200. |
| `getSignaturesForAddress` ceiling | 1000 per call (Solana RPC limit) | True history requires paginated calls with `before` cursors — not implemented in the MVP. Practical demo cap is ~1000 lifetime mint+revoke events per protocol wallet. |
| Per-call cost | 1 RPC request + N parsed-tx fetches in batches | On free public RPC this is the bottleneck — `/api/sbt-list` against 200 events takes 3–10s. Paid RPC (Helius / Triton / QuickNode) brings it under 1s. |
| Cache | None | Every request hits RPC. A 30-second LRU on `agentId → state` would absorb most demo load. |
| Eventual consistency | ~1–3s after `sendAndConfirmTransaction` returns | A status check immediately after mint may show `credentialed=false`; the SBT demo script sleeps 2s to compensate. |

**What the production version looks like.** Three options, ordered by lift:

1. **Add an indexer.** Subscribe to the protocol account via WebSocket (`onLogs`), build an in-memory `agentId → latest_event` map, persist to Postgres / Redis. Lookup becomes `O(1)`. The on-chain transactions stay the source of truth — anyone can still rebuild the index from the chain.
2. **Switch to Token-2022 NonTransferable mints.** Each agent gets a dedicated mint with `NonTransferable` extension; protocol holds mint + freeze authority. Status becomes "does the issuer's ATA hold a non-zero balance?", which is a single `getTokenAccountBalance` call. Revoke = burn. Scales to millions of credentials, but loses the single-account-as-registry simplicity.
3. **Custom on-chain program.** A small Anchor program with a PDA per agent storing `(tier, score, ts, revoked_at)`. `O(1)` lookup, fully on-chain state, no indexer needed. This is the model regulators will eventually want for a MiCA audit. Cost: ~1 week to build + audit.

The `/api/{mint,revoke,status,list}-sbt` surface is shaped to be invariant under all three migrations — only `src/sbt.js` swaps out.

## Environment variables

See `.env.example`. Required: `SOLANA_SECRET`. Optional: `SOLANA_PUBLIC`, `SOLANA_RPC`, `SOLANA_CLUSTER`, `SBT_SCAN_LIMIT`.

## Deploy

See `DEPLOY.md` for the GitHub + Vercel walkthrough.

## License

MIT — © 2026 BCP Partners GmbH

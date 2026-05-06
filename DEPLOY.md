# Deploy `verun-solana-mvp` to Vercel

Total time: ~10 minutes including the Devnet sanity passes. You'll end with a public URL where every endpoint returns green ticks against real Solana Devnet.

> **Secrets policy.** `.env.example` ships with placeholders only. The real protocol keypair lives in your local `.env` (gitignored) and in Vercel project env vars. Never commit a real `SOLANA_SECRET` — even on Devnet, leaked keys get drained by airdrop-farming bots within minutes and produce noisy explorer history.

---

## 1. Install + generate a fresh keypair

```bash
cd verun-solana-mvp
npm install
cp .env.example .env
npm run genkey
```

Expected output:

```
────────────────────────────────────────────────────────────
 Solana devnet keypair
────────────────────────────────────────────────────────────
 SOLANA_PUBLIC      = <base58 address, ~44 chars>
 SOLANA_SECRET (b58)= <base58 string, ~88 chars>
 SOLANA_SECRET (json)= [<64 numbers>]
────────────────────────────────────────────────────────────
 Funding via devnet airdrop...
 Funded ✓   sig: <base58 signature>
 Balance   : 1 SOL
```

**Action:** open `.env` in an editor and paste the `SOLANA_PUBLIC` and `SOLANA_SECRET (b58)` values into the placeholder lines.

### If `genkey` reports "Airdrop failed" / 429

Public Devnet RPC throttles airdrops aggressively. The keypair is still valid — fund it manually:

```bash
# Option A: solana CLI
solana airdrop 1 <SOLANA_PUBLIC> --url devnet

# Option B: web faucet (handles captcha)
open https://faucet.solana.com
# paste the SOLANA_PUBLIC, request 1 SOL on Devnet

# Option C: rotate to a different RPC for the airdrop
SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=<your-key> npm run genkey
```

After funding, confirm:

```bash
npm run check
```

Expected:

```
address       : <SOLANA_PUBLIC>
balance_sol   : 1
balance_lamports: 1000000000
explorer      : https://explorer.solana.com/address/<SOLANA_PUBLIC>?cluster=devnet
```

If `balance_sol` is `0`, the airdrop hasn't landed — wait 10s and re-run, or use the web faucet.

---

## 2. Real Devnet self-test

```bash
npm run selftx
```

Expected output:

```
sig     : <base58 signature, ~88 chars>
explorer: https://explorer.solana.com/tx/<signature>?cluster=devnet
```

**Verify by clicking the explorer URL.** You should see:

- ✅ Status: **Success**
- ✅ Block: a slot number ~5 seconds old
- ✅ Instructions: **2** — `Memo Program: verun-selftest:<sha256>` and `System Program: Transfer 1 lamport (self → self)`
- ✅ Fee: ~5000 lamports

If the explorer page shows "Transaction not found", the RPC has lag — wait 10s and refresh.

### Failure modes

| Symptom | Fix |
|---|---|
| `Error: Attempt to debit an account but found no record of a prior credit` | Wallet not funded. Run `solana airdrop 1 <pubkey> --url devnet` from your Mac. |
| `Error: 429 Too Many Requests` | Public Devnet RPC rate-limited you. Wait 30s and retry, or set `SOLANA_RPC` to a paid endpoint. |
| `Blockhash not found` (rare) | Network blip. Re-run — `sendAndConfirmTransaction` builds a fresh blockhash each call. |
| Hangs >30s with no output | RPC unreachable. `curl https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'` — should return `{"result":"ok"}`. |

---

## 3. Boot the API + run the 5 green ticks against real Devnet

In one terminal:

```bash
npm run api
# verun-solana-mvp API on :3010
```

In another terminal:

```bash
chmod +x scripts/smoke-live.sh
./scripts/smoke-live.sh http://localhost:3010
```

Expected output (real Devnet):

```
== Verun Solana MVP live smoke ==
Base: http://localhost:3010

[1/5] health ............ true
[2/5] validators ........ 3
[3/5] funding status .... 0.99999...           # SOL balance
[4/5] config check ...... true                 # secret_present
true                                            # secret_valid
true                                            # rpc_reachable
[5/5] evaluate .......... true                 # success
LOW                                             # consensus
true                                            # permitted
<base58 signature>                              # anchor.txid (REAL)
https://explorer.solana.com/tx/<sig>?cluster=devnet
Smoke done.
```

**Click the explorer URL from line [5/5].** You should see a confirmed Devnet transaction with the SPL-Memo + 1-lamport-transfer pattern. That's your live on-chain proof.

### Failure modes for the smoke test

| Symptom | Fix |
|---|---|
| `[1/5] health` fails immediately | API server not running. Confirm `npm run api` is alive on :3010. |
| `[3/5] funding status` reports `null` for `balance.sol` | Airdrop never landed. Run `solana airdrop 1 <pubkey> --url devnet`. |
| `[4/5] config check` shows `secret_valid=false` | Your `.env` has malformed `SOLANA_SECRET`. Should be base58 (~88 chars) OR a JSON array of 64 numbers. Re-paste from `npm run genkey` output. |
| `[5/5] evaluate` shows `anchor.error` instead of a txid | The verdict computed locally but the Devnet TX failed. Common causes: rate-limit (retry), insufficient balance (re-airdrop), bad RPC (switch). The verdict itself is still valid; only the on-chain anchor failed. |

---

## 4. SBT lifecycle demo against real Devnet

```bash
chmod +x scripts/sbt-demo.sh
BASE=http://localhost:3010 ./scripts/sbt-demo.sh agt_fahad_001 720
```

Expected output:

```
[1/5] Checking current credential status...
      Credentialed before mint: false

[2/5] Minting VTRUST credential under protocol authority...
      ✓ Mint successful
        Tier         : MED
        Sig          : <base58 signature>
        Slot         : <number>
        Explorer     : https://explorer.solana.com/tx/<sig>?cluster=devnet
        Issuer       : <SOLANA_PUBLIC>

[3/5] Public verification (anyone, no auth required)...
      → on-chain credential = MED  (credentialed=True)

[4/5] Simulating MiFID II kill-switch — revoking credential...
      ✓ Revoke successful
        Revoke Sig   : <base58 signature>
        Explorer     : https://explorer.solana.com/tx/<sig>?cluster=devnet

[5/5] Re-verifying after revoke...
      ✓ Credential cleared on-chain — kill-switch confirmed

┌─ Lifecycle Complete ─...
```

If step `[3/5]` returns `credentialed=False` immediately after a successful mint, RPC index lag is to blame — `getSignaturesForAddress` can take 1-3s on public Devnet RPC to surface a fresh signature. The script already sleeps 2s; bump it if you see this consistently.

---

## 5. Push to GitHub

Once the local 5/5 + SBT lifecycle pass:

```bash
git init
git add .
git commit -m "verun-solana-mvp: initial port from stellar"
gh repo create verun-solana-mvp --public --source=. --push
```

Confirm `.env` is **not** in the commit (`.gitignore` handles this — verify with `git ls-files | grep env`; should only show `.env.example`).

---

## 6. Deploy to Vercel

```bash
vercel link        # pick or create project named "verun-solana-mvp"

# Add env vars (each command prompts for the value)
vercel env add SOLANA_SECRET production   # paste base58 secret from your .env
vercel env add SOLANA_PUBLIC production   # paste base58 pubkey from your .env
vercel env add SOLANA_RPC production       # https://api.devnet.solana.com
vercel env add SOLANA_CLUSTER production   # devnet

vercel --prod
```

After the deploy completes you'll get a URL like `https://verun-solana-mvp.vercel.app`.

> **Production reliability note:** the public Devnet RPC rate-limits hard. For anything beyond a demo, swap `SOLANA_RPC` to a paid provider (Helius / Triton / QuickNode free tiers all work). The `/api/sbt-list` and `/api/sbt-status` endpoints call `getSignaturesForAddress` which is the most rate-sensitive — see the SBT scaling note in `README.md`.

---

## 7. Live green-tick check on Vercel

```bash
./scripts/smoke-live.sh https://verun-solana-mvp.vercel.app
```

Same expected output as step 3, but the `anchor.txid` is now produced by the Vercel-deployed function instead of your local Mac. Click the explorer link to confirm.

---

## 8. Manual verification curls

```bash
BASE=https://verun-solana-mvp.vercel.app

curl -s $BASE/api/health
curl -s $BASE/api/validators | jq
curl -s $BASE/api/config-check | jq .checks
curl -s $BASE/api/funding-status | jq

curl -s -X POST $BASE/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"agt_demo","score":820,"operation":"transfer"}' | jq

curl -s -X POST $BASE/api/mint-sbt \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"agt_fahad_001","score":720,"operation":"transfer"}' | jq

curl -s "$BASE/api/sbt-status?agentId=agt_fahad_001" | jq
curl -s "$BASE/api/sbt-list" | jq
```

---

## What next

- Lock the validator set to your real partners by editing `src/validators.json`.
- For mainnet, change `SOLANA_RPC` to a mainnet provider URL and `SOLANA_CLUSTER` to `mainnet-beta`, then fund the protocol wallet from a real wallet (no airdrop on mainnet).
- For a true on-chain non-transferable token, swap `src/sbt.js` to Token-2022 NonTransferable mints or Metaplex Core SoulBound assets — the `/api/{mint,revoke,status,list}-sbt` surface stays identical.

# Verun Network — Agent Integration Guide (Solana)

> **For AI agents:** Copy the system prompt below into your agent's system instructions to connect to Verun Network on Solana.

---

## System Prompt (copy-paste ready)

```
You are an AI agent operating within the Verun Network trust framework on Solana.

Before executing any financial operation, request a Verun trust evaluation.

== HOW TO EVALUATE ==
POST https://verun-solana-mvp.vercel.app/api/evaluate
Body: { "agentId": "YOUR_AGENT_ID", "score": YOUR_SCORE, "operation": "transfer" }

== OPERATION GATES ==
read        → score 300+
transfer    → score 500+
order       → score 600+

== VERDICT RULES ==
permitted: true   → proceed with the operation
permitted: false  → stop, escalate to human supervisor
Always store the returned txid as your on-chain audit trail.

== HUMAN ESCALATION ==
If verdict is denied or pending, notify the human supervisor.
Never execute financial operations without a valid Verun verdict.

Network: Solana Devnet
Validators: tokenforge · BCP Partners
Docs: https://verun-solana-mvp.vercel.app/docs.html
```

---

## API Reference

### Evaluate Agent

```bash
curl -L -X POST https://verun-solana-mvp.vercel.app/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_my_agent","score":820,"operation":"transfer"}'
```

**Response:**
```json
{
  "success": true,
  "verdict": {
    "consensus": "LOW",
    "permitted": true,
    "operation": "transfer",
    "score": 820
  },
  "anchor": {
    "txid": "SOLANA_DEVNET_SIGNATURE",
    "ledger": "12345678",
    "explorer": "https://explorer.solana.com/?cluster=devnet/tx/..."
  }
}
```

### Health Check

```bash
curl -L https://verun-solana-mvp.vercel.app/api/health
```

---

## Operation Gates

| operation | Min. Score | Use case |
|-----------|-----------|----------|
| `read` | 300+ | Query platform data, price feeds |
| `transfer` | 500+ | Send tokens, initiate payments |
| `order` | 600+ | Place trade orders, mint tokens |

---

## Score Tiers

| Tier | Score | Access |
|------|-------|--------|
| HIGH | 800+ | Full autonomous access |
| MED | 600+ | Transfer + order |
| LOW | 300+ | Read only |
| BLOCK | <300 | No access |

---

## On-Chain Proof

Every evaluation is anchored as a **Memo Instruction on Solana Devnet**: a 1-lamport self-payment whose memo is `sha256(verdict_payload)`. Verify any `txid` at: https://explorer.solana.com/?cluster=devnet

---

## Validators

| Name | Type | Policy |
|------|------|--------|
| tokenforge | Founding Validator | Chain API (eWpG, BaFin) |
| BCP Partners | Founding Validator | Score-based |
| Test Validator | Testnet only | Score-based |

2-of-3 consensus required for a valid verdict.

---

## Links

- **Landing Page:** https://verun-solana-mvp.vercel.app
- **Tech Docs:** https://verun-solana-mvp.vercel.app/docs.html
- **GitHub:** https://github.com/Fahad00674/verun-solana-mvp
- **Contact:** https://www.bcpp.io/contact-us

© 2026 BCP Partners GmbH

/**
 * Verun SBT — Protocol-custodial Soulbound credential on Solana Devnet.
 *
 * Architecture (parallel to the Stellar port):
 *   • Agent identity is the `agentId` STRING. Agents do NOT hold keys —
 *     this is the EU AI Act / MiFID II "single responsible party" model.
 *   • The credential registry is the protocol account's TRANSACTION HISTORY
 *     of SPL-Memo instructions tagged with our `vtrust:` prefix.
 *   • `mint`   = TX containing memo `vtrust-mint:<agentId>:<tier>:<score>:<ts>`
 *   • `revoke` = TX containing memo `vtrust-revoke:<agentId>:<reason>:<ts>`
 *   • `status` and `list` = scan the protocol account's recent signatures,
 *     parse memos, build current state from the latest event per agentId.
 *
 * Why memos vs. PDAs:
 *   On Stellar the analogous approach is `manageData`, which is a
 *   queryable key-value entry on the issuer account. Solana's closest
 *   pattern WITHOUT deploying a custom on-chain program is the SPL-Memo
 *   audit trail: every event is permanent on-chain, anyone can verify by
 *   running `getSignaturesForAddress(issuer)` and inspecting memos. Same
 *   verifiability story, no extra contract to audit.
 *
 * Upgrade path (post-MVP):
 *   Drop in a Token-2022 NonTransferable mint per agent, or Metaplex Core
 *   asset with the SoulBound / PermanentFreeze plugin. Both sit behind
 *   the same /api/{mint,revoke,status,list}-sbt surface.
 */
require('dotenv').config();
const crypto = require('crypto');
const {
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getConnection,
  getKeypair,
  ensureFunded,
  explorerTx,
  explorerAccount,
  memoInstruction,
} = require('./solana');

const MAX_AGENT_LEN = 50;
const MEMO_PREFIX_MINT = 'vtrust-mint';
const MEMO_PREFIX_REVOKE = 'vtrust-revoke';
// Solana memos are not strictly capped at 64 bytes, but we keep them tight
// for explorer readability & cheap parsing.

function tierFromScore(score) {
  if (score >= 800) return 'LOW';
  if (score >= 600) return 'MED';
  if (score >= 300) return 'HIGH';
  return 'BLOCK';
}

function safeAgentKey(agentId) {
  return String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, MAX_AGENT_LEN);
}

// ────────────────────────────────────────────────────────────────────
// Memo encoding/parsing
// Format: `vtrust-mint:<agentId>:<tier>:<score>:<isoTs>:<hash8>`
//         `vtrust-revoke:<agentId>:<reason>:<isoTs>:<hash8>`
// `<hash8>` is the first 8 hex chars of sha256(payloadJson) — for
// tamper-evidence; the full hash is also written by the bundled memo
// payload below.
// ────────────────────────────────────────────────────────────────────
function encodeMintMemo({ agentId, tier, score, ts, hashHex }) {
  return `${MEMO_PREFIX_MINT}:${agentId}:${tier}:${score}:${ts}:${hashHex.slice(0, 8)}`;
}
function encodeRevokeMemo({ agentId, reason, ts, hashHex }) {
  const safeReason = String(reason || 'unspecified').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  return `${MEMO_PREFIX_REVOKE}:${agentId}:${safeReason}:${ts}:${hashHex.slice(0, 8)}`;
}

function parseMemo(memoText) {
  if (!memoText || typeof memoText !== 'string') return null;
  if (memoText.startsWith(MEMO_PREFIX_MINT + ':')) {
    const parts = memoText.split(':');
    // ['vtrust-mint', agentId, tier, score, ts..., hash8]
    if (parts.length < 6) return null;
    const [, agentId, tier, score, ...rest] = parts;
    const hash8 = rest.pop();
    const ts = rest.join(':');
    return { kind: 'mint', agentId, tier, score: Number(score), ts, hash8 };
  }
  if (memoText.startsWith(MEMO_PREFIX_REVOKE + ':')) {
    const parts = memoText.split(':');
    if (parts.length < 5) return null;
    const [, agentId, reason, ...rest] = parts;
    const hash8 = rest.pop();
    const ts = rest.join(':');
    return { kind: 'revoke', agentId, reason, ts, hash8 };
  }
  return null;
}

/**
 * Solana places memo text into the transaction's logMessages and inner
 * instructions. The most reliable extraction path is to inspect the parsed
 * transaction's instructions for the SPL-Memo program and decode `data`.
 */
function extractMemosFromParsedTx(parsedTx) {
  if (!parsedTx || !parsedTx.transaction || !parsedTx.transaction.message) return [];
  const memos = [];
  const ixs = parsedTx.transaction.message.instructions || [];
  for (const ix of ixs) {
    // jsonParsed shape: { program: 'spl-memo', parsed: '<text>', programId: '...' }
    if (ix.program === 'spl-memo' && typeof ix.parsed === 'string') {
      memos.push(ix.parsed);
    } else if (ix.programId && ix.programId.toString === 'function' &&
               ix.programId.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
      // Fallback: raw instruction shape — `data` is base58-encoded bytes
      try {
        const bs58 = require('bs58').default || require('bs58');
        memos.push(Buffer.from(bs58.decode(ix.data)).toString('utf8'));
      } catch (_) { /* skip */ }
    }
  }
  return memos;
}

// ────────────────────────────────────────────────────────────────────
// MINT — issue / refresh credential
// ────────────────────────────────────────────────────────────────────
async function mintSBT({ agentId, score }) {
  if (!agentId) throw new Error('agentId required');
  score = Number(score);
  if (Number.isNaN(score)) throw new Error('score must be a number');
  if (score < 300) {
    throw new Error(`score ${score} below minimum SBT threshold (300). Verdict was BLOCK.`);
  }

  const tier = tierFromScore(score);
  const ts = new Date().toISOString();
  const safeId = safeAgentKey(agentId);
  const credentialPayload = { type: 'verun-sbt', agentId: safeId, tier, score, ts };
  const credentialHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(credentialPayload))
    .digest();
  const hashHex = credentialHash.toString('hex');
  const memoText = encodeMintMemo({ agentId: safeId, tier, score, ts, hashHex });

  const conn = getConnection();
  const kp = getKeypair();
  const pub = kp.publicKey;
  await ensureFunded(pub);

  const tx = new Transaction()
    .add(memoInstruction(memoText))
    .add(SystemProgram.transfer({ fromPubkey: pub, toPubkey: pub, lamports: 1 }));

  const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });

  let slot = '';
  try {
    const info = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    slot = String(info?.slot ?? '');
  } catch (_) {}

  return {
    success: true,
    agentId: safeId,
    tier,
    score,
    ts,
    key: `vtrust_${safeId}`, // kept for response-shape parity with Stellar
    txid: sig,
    ledger: slot,
    credential_hash: hashHex,
    network: 'solana-devnet',
    issuer: pub.toBase58(),
    explorer: explorerTx(sig),
    issuer_explorer: explorerAccount(pub.toBase58()),
    memo: memoText,
  };
}

// ────────────────────────────────────────────────────────────────────
// REVOKE — kill-switch (writes a revoke memo to the issuer account)
// ────────────────────────────────────────────────────────────────────
async function revokeSBT({ agentId, reason = 'unspecified' }) {
  if (!agentId) throw new Error('agentId required');
  const safeId = safeAgentKey(agentId);
  const ts = new Date().toISOString();
  const revokePayload = { type: 'verun-sbt-revoke', agentId: safeId, reason, ts };
  const revokeHash = crypto.createHash('sha256').update(JSON.stringify(revokePayload)).digest();
  const hashHex = revokeHash.toString('hex');
  const memoText = encodeRevokeMemo({ agentId: safeId, reason, ts, hashHex });

  const conn = getConnection();
  const kp = getKeypair();
  const pub = kp.publicKey;

  const tx = new Transaction()
    .add(memoInstruction(memoText))
    .add(SystemProgram.transfer({ fromPubkey: pub, toPubkey: pub, lamports: 1 }));

  const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });

  let slot = '';
  try {
    const info = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    slot = String(info?.slot ?? '');
  } catch (_) {}

  return {
    success: true,
    revoked: true,
    agentId: safeId,
    key: `vtrust_${safeId}`,
    reason,
    txid: sig,
    ledger: slot,
    revoke_hash: hashHex,
    explorer: explorerTx(sig),
    memo: memoText,
  };
}

// ────────────────────────────────────────────────────────────────────
// SCAN — pull recent vtrust memos from the protocol account
// ────────────────────────────────────────────────────────────────────
const SCAN_LIMIT = Number(process.env.SBT_SCAN_LIMIT || 200);

async function scanCredentialEvents() {
  const conn = getConnection();
  const kp = getKeypair();
  const pub = kp.publicKey;

  const sigs = await conn.getSignaturesForAddress(pub, { limit: SCAN_LIMIT });
  if (!sigs.length) return { issuer: pub.toBase58(), events: [] };

  // Fetch parsed transactions in small batches to be RPC-friendly.
  const events = [];
  const BATCH = 15;
  for (let i = 0; i < sigs.length; i += BATCH) {
    const slice = sigs.slice(i, i + BATCH);
    const txs = await Promise.all(
      slice.map((s) =>
        conn
          .getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
          .catch(() => null)
      )
    );
    for (let j = 0; j < txs.length; j++) {
      const t = txs[j];
      if (!t) continue;
      const memos = extractMemosFromParsedTx(t);
      for (const m of memos) {
        const parsed = parseMemo(m);
        if (!parsed) continue;
        events.push({
          ...parsed,
          txid: slice[j].signature,
          slot: t.slot,
          blockTime: t.blockTime || null,
          explorer: explorerTx(slice[j].signature),
        });
      }
    }
  }
  // events come back newest-first because getSignaturesForAddress returns
  // signatures newest-first. Preserve that.
  return { issuer: pub.toBase58(), events };
}

/**
 * Fold the event stream into per-agent current state. Newest event wins.
 */
function foldEventsToState(events) {
  const seen = new Set();
  const state = {}; // agentId -> latest event
  // events is newest-first → first occurrence per agentId IS the latest.
  for (const e of events) {
    if (seen.has(e.agentId)) continue;
    seen.add(e.agentId);
    state[e.agentId] = e;
  }
  return state;
}

// ────────────────────────────────────────────────────────────────────
// STATUS — read latest credential event for a single agent
// ────────────────────────────────────────────────────────────────────
async function statusSBT({ agentId }) {
  if (!agentId) throw new Error('agentId required');
  const safeId = safeAgentKey(agentId);
  const { issuer, events } = await scanCredentialEvents();
  const state = foldEventsToState(events);
  const latest = state[safeId];

  if (!latest) {
    return {
      ok: true,
      agentId: safeId,
      credentialed: false,
      key: `vtrust_${safeId}`,
      issuer,
      issuer_explorer: explorerAccount(issuer),
    };
  }

  if (latest.kind === 'revoke') {
    return {
      ok: true,
      agentId: safeId,
      credentialed: false,
      key: `vtrust_${safeId}`,
      issuer,
      issuer_explorer: explorerAccount(issuer),
      last_event: latest,
    };
  }

  // mint event — currently credentialed
  return {
    ok: true,
    agentId: safeId,
    credentialed: true,
    key: `vtrust_${safeId}`,
    issuer,
    credential: {
      tier: latest.tier,
      score: latest.score,
      ts: latest.ts,
    },
    last_event: latest,
    issuer_explorer: explorerAccount(issuer),
    verify_url: latest.explorer,
  };
}

// ────────────────────────────────────────────────────────────────────
// LIST — every currently-credentialed agent under this issuer
// ────────────────────────────────────────────────────────────────────
async function listSBT() {
  const { issuer, events } = await scanCredentialEvents();
  const state = foldEventsToState(events);
  const credentials = [];
  for (const [agentId, ev] of Object.entries(state)) {
    if (ev.kind !== 'mint') continue;
    credentials.push({
      key: `vtrust_${agentId}`,
      agentId,
      credential: { tier: ev.tier, score: ev.score, ts: ev.ts },
      txid: ev.txid,
      explorer: ev.explorer,
    });
  }
  return {
    ok: true,
    issuer,
    issuer_explorer: explorerAccount(issuer),
    total: credentials.length,
    credentials,
    scanned_events: events.length,
  };
}

module.exports = {
  mintSBT,
  revokeSBT,
  statusSBT,
  listSBT,
  tierFromScore,
  // exported for tests
  encodeMintMemo,
  encodeRevokeMemo,
  parseMemo,
  foldEventsToState,
};

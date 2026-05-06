/**
 * Verun Solana MVP — Solana helpers
 * Centralised wallet/signer + devnet airdrop logic.
 *
 * Mirrors src/stellar.js from the original Stellar port. Same surface,
 * different chain.
 */
require('dotenv').config();
const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const COMMITMENT = process.env.SOLANA_COMMITMENT || 'confirmed';

// SPL Memo program v2 (canonical)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function normalizeSecret(raw) {
  return String(raw || '').trim().replace(/^['"`]+|['"`]+$/g, '');
}

function getConnection() {
  return new Connection(SOLANA_RPC, COMMITMENT);
}

/**
 * Accepts either a base58-encoded secret OR a JSON array of 64 bytes
 * (the format `solana-keygen` writes). Either works.
 */
function getKeypair() {
  const raw = normalizeSecret(process.env.SOLANA_SECRET);
  if (!raw) throw new Error('SOLANA_SECRET env var missing');
  try {
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e) {
    throw new Error(`SOLANA_SECRET could not be decoded (try base58 or JSON-array form): ${e.message}`);
  }
}

function explorerTx(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${SOLANA_CLUSTER}`;
}

function explorerAccount(addr) {
  return `https://explorer.solana.com/address/${addr}?cluster=${SOLANA_CLUSTER}`;
}

/**
 * Build a SPL-Memo instruction. Memos are arbitrary UTF-8 text. We keep
 * ours well under 200 bytes.
 */
function memoInstruction(text) {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, 'utf8'),
  });
}

/**
 * Auto-fund the configured devnet account via airdrop if its balance is
 * below `minSol`. Public devnet RPC rate-limits airdrops, so this is
 * best-effort. Returns { funded, alreadyExisted, lamports, sig? }.
 */
async function ensureFunded(publicKey, minSol = 0.05) {
  const conn = getConnection();
  const pk = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
  const lamports = await conn.getBalance(pk);
  if (lamports >= minSol * LAMPORTS_PER_SOL) {
    return { funded: true, alreadyExisted: true, lamports };
  }
  try {
    const sig = await conn.requestAirdrop(pk, 1 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, COMMITMENT);
    const lamports2 = await conn.getBalance(pk);
    return { funded: lamports2 > 0, alreadyExisted: false, lamports: lamports2, sig };
  } catch (e) {
    return {
      funded: lamports > 0,
      alreadyExisted: lamports > 0,
      lamports,
      error: e.message || String(e),
      hint: 'Devnet airdrop limited. Use https://faucet.solana.com or `solana airdrop 1 <pubkey> --url devnet`.',
    };
  }
}

module.exports = {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  MEMO_PROGRAM_ID,
  SOLANA_RPC,
  SOLANA_CLUSTER,
  COMMITMENT,
  getConnection,
  getKeypair,
  ensureFunded,
  explorerTx,
  explorerAccount,
  normalizeSecret,
  memoInstruction,
};

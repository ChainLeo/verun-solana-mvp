/**
 * On-chain anchor for a Verun verdict on Solana Devnet.
 *
 * Strategy: a single transaction with two instructions:
 *   1. SPL-Memo instruction whose data is `verun-eval:<sha256_hex>`
 *   2. SystemProgram.transfer of 1 lamport (self → self) — rent-zero, just
 *      makes the transaction non-empty in some explorers and mirrors the
 *      Stellar 1-stroop self-payment pattern.
 *
 * Result: a real Devnet TX with explorer link, equivalent to the Stellar
 * `Memo.hash + 1-stroop self-payment` anchor from the original MVP.
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
  memoInstruction,
} = require('./solana');

async function anchorEvaluation(payload) {
  const conn = getConnection();
  const kp = getKeypair();
  const pub = kp.publicKey;

  await ensureFunded(pub);

  const json = JSON.stringify(payload);
  const digest = crypto.createHash('sha256').update(json).digest(); // 32 bytes
  const memoText = `verun-eval:${digest.toString('hex')}`;

  const tx = new Transaction()
    .add(memoInstruction(memoText))
    .add(
      SystemProgram.transfer({
        fromPubkey: pub,
        toPubkey: pub,
        lamports: 1,
      })
    );

  const sig = await sendAndConfirmTransaction(conn, tx, [kp], {
    commitment: 'confirmed',
  });

  // Try to fetch slot for parity with Stellar `ledger` field.
  let slot = '';
  try {
    const txInfo = await conn.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    slot = String(txInfo?.slot ?? '');
  } catch (_) { /* non-fatal */ }

  return {
    txid: sig,
    ledger: slot, // kept name `ledger` for API parity with Stellar version
    network: 'solana-devnet',
    memo_hash: digest.toString('hex'),
    payload_hash: digest.toString('hex'),
    payload_size: json.length,
    explorer: explorerTx(sig),
    rpc: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  };
}

module.exports = { anchorEvaluation };

require('dotenv').config();
const crypto = require('crypto');
const {
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getConnection,
  getKeypair,
  ensureFunded,
  explorerTx,
  memoInstruction,
} = require('../src/solana');

(async () => {
  const kp = getKeypair();
  const pub = kp.publicKey;
  const conn = getConnection();

  await ensureFunded(pub);

  const payload = `verun-selftest-${Date.now()}`;
  const digest = crypto.createHash('sha256').update(payload).digest();
  const memoText = `verun-selftest:${digest.toString('hex')}`;

  const tx = new Transaction()
    .add(memoInstruction(memoText))
    .add(SystemProgram.transfer({ fromPubkey: pub, toPubkey: pub, lamports: 1 }));

  const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });
  console.log('sig     :', sig);
  console.log('explorer:', explorerTx(sig));
})().catch((e) => {
  console.error('ERR:', e.message || e);
  process.exit(1);
});

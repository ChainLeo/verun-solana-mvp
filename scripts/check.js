require('dotenv').config();
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getConnection, getKeypair, explorerAccount } = require('../src/solana');

(async () => {
  const kp = getKeypair();
  const pub = kp.publicKey.toBase58();
  const conn = getConnection();
  const lamports = await conn.getBalance(kp.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;

  console.log('address       :', pub);
  console.log('balance_sol   :', sol);
  console.log('balance_lamports:', lamports);
  console.log('explorer      :', explorerAccount(pub));
})().catch((e) => { console.error('ERR:', e.message || e); process.exit(1); });

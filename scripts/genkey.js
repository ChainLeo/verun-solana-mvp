/**
 * Generate a fresh Solana devnet keypair AND fund it via airdrop.
 * Usage:  npm run genkey   (or:  node scripts/genkey.js )
 *
 * Prints the secret + public key. Copy them into Vercel env vars:
 *   SOLANA_SECRET = <base58 string>   (or JSON-array form is also accepted)
 *   SOLANA_PUBLIC = <base58 address>
 */
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

(async () => {
  const kp = Keypair.generate();
  const pub = kp.publicKey.toBase58();
  const secB58 = bs58.encode(kp.secretKey);
  const secJson = JSON.stringify(Array.from(kp.secretKey));

  console.log('────────────────────────────────────────────────────────────');
  console.log(' Solana devnet keypair');
  console.log('────────────────────────────────────────────────────────────');
  console.log(' SOLANA_PUBLIC      =', pub);
  console.log(' SOLANA_SECRET (b58)=', secB58);
  console.log(' SOLANA_SECRET (json)=', secJson);
  console.log('────────────────────────────────────────────────────────────');
  console.log(' Funding via devnet airdrop...');

  const conn = new Connection(RPC, 'confirmed');
  try {
    const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, 'confirmed');
    const lamports = await conn.getBalance(kp.publicKey);
    console.log(' Funded ✓   sig:', sig);
    console.log(' Balance   :', lamports / LAMPORTS_PER_SOL, 'SOL');
  } catch (e) {
    console.log(' Airdrop failed:', e.message);
    console.log(' Manual fund :', `solana airdrop 1 ${pub} --url devnet`);
    console.log(' Or use      : https://faucet.solana.com');
  }
  console.log('');
  console.log(' Save the SECRET above somewhere safe — it cannot be recovered.');
  console.log(' Set SOLANA_SECRET (and optionally SOLANA_PUBLIC) in Vercel.');
})().catch((e) => { console.error('ERR:', e.message || e); process.exit(1); });

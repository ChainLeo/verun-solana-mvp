const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const {
  getConnection,
  getKeypair,
  ensureFunded,
  explorerAccount,
  PublicKey,
} = require('../src/solana');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let address = process.env.SOLANA_PUBLIC || null;
    if (!address) {
      try {
        address = getKeypair().publicKey.toBase58();
      } catch (e) {
        return res.status(500).json({ ok: false, error: `SOLANA_SECRET not configured: ${e.message}` });
      }
    }

    let fundResult = null;
    try {
      fundResult = await ensureFunded(address);
    } catch (e) {
      fundResult = { funded: false, error: e.message };
    }

    const conn = getConnection();
    const lamports = await conn.getBalance(new PublicKey(address));
    const sol = lamports / LAMPORTS_PER_SOL;

    res.status(200).json({
      ok: true,
      network: 'solana-devnet',
      address,
      explorer: explorerAccount(address),
      airdrop: fundResult,
      balance: {
        sol,
        lamports,
        funded: lamports > 0,
        recommendedMinSol: 0.05,
      },
      faucet: 'https://faucet.solana.com',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};

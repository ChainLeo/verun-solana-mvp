module.exports = async function handler(req, res) {
  res.status(200).json({ ok: true, service: 'verun-solana-mvp', network: 'solana-devnet' });
};

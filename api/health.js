export default function health(_req, res) {
  return res.json({ ok: true, service: 'verun-solana-client', mode: 'documentation', payments: 'local-client-only', network: 'solana-devnet' });
}

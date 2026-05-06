const { Keypair, PublicKey, Connection } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secretRaw = (process.env.SOLANA_SECRET || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  const rpcUrl = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
  const cluster = process.env.SOLANA_CLUSTER || 'devnet';
  const configuredAddress = process.env.SOLANA_PUBLIC || null;

  let secretValid = false;
  let derivedAddress = null;
  let secretError = null;

  if (secretRaw) {
    try {
      let kp;
      if (secretRaw.startsWith('[')) {
        kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretRaw)));
      } else {
        kp = Keypair.fromSecretKey(bs58.decode(secretRaw));
      }
      secretValid = true;
      derivedAddress = kp.publicKey.toBase58();
    } catch (e) {
      secretError = e.message || String(e);
    }
  }

  let rpcReachable = false;
  let rpcStatus = null;
  let rpcError = null;
  try {
    const conn = new Connection(rpcUrl, 'confirmed');
    const slot = await conn.getSlot();
    rpcStatus = slot;
    rpcReachable = typeof slot === 'number';
  } catch (e) {
    rpcError = e.message || String(e);
  }

  return res.status(200).json({
    ok: true,
    checks: {
      secret_present: Boolean(secretRaw),
      secret_valid: secretValid,
      secret_error: secretError,
      derived_address: derivedAddress,
      configured_address: configuredAddress,
      address_match: Boolean(
        derivedAddress && configuredAddress && derivedAddress === configuredAddress
      ),
      rpc_url: rpcUrl,
      rpc_reachable: rpcReachable,
      rpc_status: rpcStatus,
      rpc_error: rpcError,
      cluster,
    },
    hints: [
      'If secret_valid=false, re-save SOLANA_SECRET in Vercel — base58 string OR JSON array of 64 bytes.',
      'If address_match=false, update SOLANA_PUBLIC to the secret-derived address (or remove it to skip the check).',
      'After fixing env vars, redeploy and retest /api/funding-status + /api/evaluate.',
    ],
  });
};

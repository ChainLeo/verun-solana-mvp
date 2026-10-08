import assert from 'node:assert/strict';
import { ASSET } from '../client/policy.js';
export function mockRpc() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(String(url), 'https://api.devnet.solana.com');
    const request = JSON.parse(options.body); calls.push(request.method);
    let value;
    if (request.method === 'getAccountInfo') {
      assert.equal(request.params[0], ASSET);
      const mint = Buffer.alloc(82); mint[44] = 6; mint[45] = 1;
      value = { executable: false, lamports: 1, owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', rentEpoch: 0, space: 82, data: [mint.toString('base64'), 'base64'] };
    } else if (request.method === 'getLatestBlockhash') {
      value = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000 };
    } else { throw new Error('Unexpected RPC method: ' + request.method); }
    return Response.json({ jsonrpc: '2.0', id: request.id, result: { context: { slot: 1 }, value } });
  };
  return { fetchImpl, calls };
}

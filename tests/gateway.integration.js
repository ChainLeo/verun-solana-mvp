import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { generateKeyPairSigner, getBase58Decoder } from '@solana/kit';
import { ScanClient } from '../client/scan.js';
import { signChallenge, NETWORK, ASSET } from '../client/policy.js';
import { mockRpc } from './rpc-fixture.js';

// Build the companion gateway first. This suite deliberately requires an explicit
// source path and exercises its real HTTP entry point, SQLite and catalog.
test('official SVM client → actual gateway HTTP → durable scan and recovered result', async t => {
  assert.ok(process.env.VERUN_GATEWAY_SOURCE, 'Set VERUN_GATEWAY_SOURCE to the built companion checkout');
  const root = path.resolve(process.env.VERUN_GATEWAY_SOURCE);
  const { createGatewayApp } = await import(pathToFileURL(path.join(root, 'dist/server/server.js')));
  const { loadConfig } = await import(pathToFileURL(path.join(root, 'dist/server/config.js')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verun-gateway-integration-'));
  const file = path.join(dir, 'scan.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const payer = await generateKeyPairSigner(); const recipient = await generateKeyPairSigner(); const sponsor = await generateKeyPairSigner();
  const config = { resourceUrl: 'https://gateway.example.test/api/opportunities/x402', recipient: recipient.address };
  const token = 'test_api_key_at_least_24_chars';
  let settlements = 0; let signatures = 0;
  const gateway = createGatewayApp('<div></div>', loadConfig({ NODE_ENV: 'test', PAYMENT_DATABASE_PATH: path.join(dir, 'payments.sqlite'),
    ASP_API_KEY: token, VERUN_MCP_BEARER_TOKEN: 'separate_mcp_test_token_at_least_24_chars', STRIPE_ENABLED: 'false', X402_ENABLED: 'true',
    X402_PROVIDER: 'solana', X402_NETWORK: NETWORK, X402_ASSET: ASSET, X402_PAY_TO: recipient.address, SOLANA_RESOURCE_URL: config.resourceUrl }), {
    facilitator: {
      getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK, extra: { feePayer: sponsor.address } }], extensions: [], signers: { 'solana:*': [sponsor.address] } }),
      verify: async () => ({ isValid: true, payer: payer.address }),
      settle: async () => { settlements++; return { success: true, transaction: getBase58Decoder().decode(new Uint8Array(64).fill(9)), network: NETWORK }; },
    },
  });
  await gateway.initialize();
  const server = gateway.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); gateway.paymentStore.close(); });
  const liveFetch = globalThis.fetch;
  const rpc = mockRpc(); t.mock.method(globalThis, 'fetch', rpc.fetchImpl);
  let loseResponse = true;
  const fetchImpl = async (url, options) => {
    const response = await liveFetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options);
    // Lose the first response after the real gateway has fulfilled the scan.
    if (options.headers['Payment-Signature'] && loseResponse) { loseResponse = false; await response.arrayBuffer(); throw new Error('simulated_lost_response'); }
    return response;
  };
  const makeClient = () => new ScanClient({ config, token, fetchImpl, sign: async (...args) => {
    signatures++; return signChallenge(args[0], payer, args[1], args[2]);
  } });
  const client = makeClient(); await client.prepare(file, { query: 'credit', limit: 3 });
  assert.equal(settlements, 0); assert.equal(signatures, 0);
  await assert.rejects(client.pay(file, true), /gateway_response_unavailable/);
  const status = await makeClient().status(file); assert.equal(status.status, 'settled'); assert.equal(status.fulfillment, 'completed');
  const result = await makeClient().retry(file);
  assert.equal(result.state, 'scan_unlocked'); assert.equal(result.fulfillmentReused, true);
  assert.ok(Array.isArray(result.opportunities)); assert.ok(result.opportunities.length > 0);
  assert.equal(result.receipt.payer, payer.address); assert.equal(result.receipt.payTo, recipient.address);
  assert.equal(settlements, 1); assert.equal(signatures, 1);
  assert.deepEqual(rpc.calls, ['getAccountInfo', 'getLatestBlockhash']);
});

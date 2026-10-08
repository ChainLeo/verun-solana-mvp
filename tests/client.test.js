import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSigner, getBase58Decoder } from '@solana/kit';
import { ScanClient } from '../client/scan.js';
import { NETWORK, ASSET, AMOUNT, validateChallenge } from '../client/policy.js';
import { readPrivate, saveState, withStateLock } from '../client/storage.js';

const recipient = await generateKeyPairSigner();
const sponsor = await generateKeyPairSigner();
const config = { resourceUrl: 'https://gateway.example.test/api/opportunities/x402', recipient: recipient.address };
const transaction = getBase58Decoder().decode(new Uint8Array(64).fill(7));
const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture({ failPaid = false, failPrepare = false, mutate = () => {}, paidStatus = 200 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verun-client-test-')); dirs.push(dir);
  const file = path.join(dir, 'scan.json'); const requests = []; let signs = 0;
  const fetchImpl = async (url, options) => {
    const input = options.body ? JSON.parse(options.body) : undefined;
    const signed = options.headers['Payment-Signature'];
    requests.push({ url: String(url), options, input, signed });
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (!input) return Response.json({ status: 'settled', fulfillment: 'completed' });
    if (signed) {
      // Proves payload persisted before any settlement-capable network call.
      assert.equal(JSON.parse(readPrivate(file)).signature, signed);
      if (failPaid) { failPaid = false; throw new Error('network_lost secret-should-not-escape'); }
      const state = JSON.parse(readPrivate(file));
      const data = { state: 'scan_unlocked', provider: 'solana', opportunities: [], receipt: {
        transaction, requestId: input.requestId, challengeId: state.challenge.challengeId,
        network: NETWORK, asset: ASSET, amount: AMOUNT, payTo: config.recipient,
      } };
      mutate(data, true); return Response.json(data, { status: paidStatus });
    }
    assert.equal(JSON.parse(readPrivate(file)).input.requestId, input.requestId);
    if (failPrepare) { failPrepare = false; throw new Error('lost'); }
    const challengeId = 'scan_' + 'a'.repeat(48);
    const data = { challengeId, provider: 'solana', testOnly: true, requestId: input.requestId,
      expiresAt: new Date(Date.now() + 300_000).toISOString(), paymentState: 'issued',
      paymentRequired: { x402Version: 2, resource: { url: config.resourceUrl }, accepts: [{
        scheme: 'exact', network: NETWORK, asset: ASSET, amount: AMOUNT, payTo: config.recipient,
        maxTimeoutSeconds: 300, extra: { feePayer: sponsor.address, memo: challengeId },
      }] } };
    mutate(data, false); return Response.json(data, { status: 402 });
  };
  const sign = async () => { signs++; return 'test-signed-payload'; };
  const client = new ScanClient({ config, token: 'test-token', fetchImpl, sign });
  return { client, file, requests, signs: () => signs, reopen: () => new ScanClient({ config, token: 'test-token', fetchImpl, sign }) };
}
test('prepare, explicit approval, paid empty result, free status and identical retry', async () => {
  const f = fixture();
  const prepared = await f.client.prepare(f.file, { query: 'credit' });
  assert.equal(prepared.state, 'prepared'); assert.equal(f.signs(), 0);
  await assert.rejects(f.client.pay(f.file, false), /explicit_devnet/);
  const result = await f.client.pay(f.file, true);
  assert.deepEqual(result.opportunities, []); assert.equal(f.signs(), 1);
  assert.equal((await f.client.status(f.file)).status, 'settled');
  assert.deepEqual(await f.reopen().retry(f.file), result);
  assert.equal(f.signs(), 1);
  assert.deepEqual(f.requests.at(-1).input, f.requests[1].input);
  assert.equal(f.requests.at(-1).signed, f.requests[1].signed);
  await assert.rejects(f.client.pay(f.file, true), /already_signed/);
  await assert.rejects(f.client.prepare(f.file, {}), /state_exists/);
});
test('lost paid response survives process reopen without signing again', async () => {
  const f = fixture({ failPaid: true }); await f.client.prepare(f.file, {});
  await assert.rejects(f.client.pay(f.file, true), error => /gateway_response_unavailable/.test(error.message) && !error.message.includes('secret'));
  assert.equal(JSON.parse(readPrivate(f.file)).phase, 'signed');
  await f.reopen().retry(f.file); assert.equal(f.signs(), 1);
  assert.equal(f.requests[1].signed, f.requests[2].signed);
});
test('lost unpaid response retains request ID and retries without payment', async () => {
  const f = fixture({ failPrepare: true }); await assert.rejects(f.client.prepare(f.file, {}));
  await f.reopen().retry(f.file);
  assert.deepEqual(f.requests[0].input, f.requests[1].input); assert.equal(f.signs(), 0);
});
for (const field of ['network', 'asset', 'amount', 'payTo']) test(`rejects changed ${field} before signing`, async () => {
  const f = fixture({ mutate: (data, paid) => { if (!paid) data.paymentRequired.accepts[0][field] = 'unapproved'; } });
  await assert.rejects(f.client.prepare(f.file, {})); assert.equal(f.signs(), 0);
});
for (const scenario of ['memo', 'expiry', 'resource', 'request', 'extra']) test(`rejects challenge ${scenario} mismatch`, async () => {
  const f = fixture({ mutate: (data, paid) => {
    if (paid) return;
    if (scenario === 'memo') data.challengeId = 'scan_' + 'b'.repeat(48);
    if (scenario === 'expiry') data.expiresAt = new Date(0).toISOString();
    if (scenario === 'resource') data.paymentRequired.resource.url = 'https://attacker.test/api/opportunities/x402';
    if (scenario === 'request') data.requestId = 'different';
    if (scenario === 'extra') data.paymentRequired.accepts[0].extra.instructions = [];
  } });
  await assert.rejects(f.client.prepare(f.file, {})); assert.equal(f.signs(), 0);
});
test('a signed request remains retryable after challenge expiry', async () => {
  const f = fixture(); await f.client.prepare(f.file, {}); await f.client.pay(f.file, true);
  const state = JSON.parse(readPrivate(f.file)); state.challenge.expiresAt = new Date(0).toISOString(); saveState(f.file, state);
  await f.client.retry(f.file); assert.equal(f.signs(), 1);
});
test('uncertain settlement and invalid receipts never report completion or re-sign', async () => {
  for (const options of [{ paidStatus: 503 }, { mutate: (data, paid) => { if (paid) data.receipt.requestId = 'wrong'; } }]) {
    const f = fixture(options); await f.client.prepare(f.file, {});
    await assert.rejects(f.client.pay(f.file, true));
    assert.equal(JSON.parse(readPrivate(f.file)).phase, 'signed');
    await assert.rejects(f.client.retry(f.file)); assert.equal(f.signs(), 1);
  }
});
test('rejects edited input and changed operator policy on recovery', async () => {
  const f = fixture(); await f.client.prepare(f.file, {});
  const state = JSON.parse(readPrivate(f.file)); state.input.query = 'changed'; saveState(f.file, state);
  await assert.rejects(f.client.pay(f.file, true), /state_or_configuration/);
});
test('private state permissions, symlink rejection and concurrent lock', async () => {
  const f = fixture(); await f.client.prepare(f.file, {});
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
  const link = f.file + '.link'; fs.symlinkSync(f.file, link); assert.throws(() => readPrivate(link));
  await withStateLock(f.file, async () => { await assert.rejects(f.client.pay(f.file, true), /EEXIST/); });
  fs.chmodSync(f.file, 0o644); assert.throws(() => readPrivate(f.file), /private_file/);
});
test('rejects query payment controls and insecure endpoint', async () => {
  const f = fixture(); await assert.rejects(f.client.prepare(f.file, { requestId: 'user-provided' }));
  assert.throws(() => new ScanClient({ config: { ...config, resourceUrl: 'http://gateway.test/api/opportunities/x402' }, token: 'test' }));
});

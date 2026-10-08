import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSigner, getTransactionDecoder, getCompiledTransactionMessageDecoder } from '@solana/kit';
import { signChallenge, NETWORK, ASSET, AMOUNT } from '../client/policy.js';

// Real official SDK transaction construction and local signature, with all RPC
// reads stubbed. No faucet, network call, transfer or funded wallet is used.
import { mockRpc } from './rpc-fixture.js';
test('official SDK signs a v0 USDC transfer and exact gateway memo locally', async t => {
  const signer = await generateKeyPairSigner(); const sponsor = await generateKeyPairSigner(); const recipient = await generateKeyPairSigner();
  const config = { resourceUrl: 'https://gateway.example.test/api/opportunities/x402', recipient: recipient.address };
  const challengeId = 'scan_' + 'a'.repeat(48); const requestId = 'offline-sdk-test-0001';
  const challenge = { provider: 'solana', testOnly: true, requestId, challengeId, expiresAt: new Date(Date.now() + 300_000).toISOString(),
    paymentRequired: { x402Version: 2, resource: { url: config.resourceUrl }, accepts: [{ scheme: 'exact', network: NETWORK, asset: ASSET, amount: AMOUNT, payTo: recipient.address, maxTimeoutSeconds: 300, extra: { feePayer: sponsor.address, memo: challengeId } }] } };
  const rpc = mockRpc(); t.mock.method(globalThis, 'fetch', rpc.fetchImpl);
  const header = await signChallenge(challenge, signer, config, requestId);
  const payload = JSON.parse(Buffer.from(header, 'base64').toString());
  const transaction = getTransactionDecoder().decode(Buffer.from(payload.payload.transaction, 'base64'));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  assert.equal(message.version, 0); assert.equal(message.staticAccounts[0], sponsor.address);
  const memo = message.instructions.find(ix => message.staticAccounts[ix.programAddressIndex] === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  assert.equal(Buffer.from(memo.data).toString(), challengeId);
  const transfer = message.instructions.find(ix => message.staticAccounts[ix.programAddressIndex] === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const data = Buffer.from(transfer.data); assert.equal(data[0], 12); assert.equal(data.readBigUInt64LE(1), 5000n); assert.equal(data[9], 6);
  assert.ok(message.staticAccounts.includes(ASSET));
  assert.equal(await crypto.subtle.verify('Ed25519', signer.keyPair.publicKey, transaction.signatures[signer.address], transaction.messageBytes), true);
  assert.equal(transaction.signatures[sponsor.address], null);
  assert.deepEqual(rpc.calls, ['getAccountInfo', 'getLatestBlockhash']);
});

import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getBase58Encoder } from '@solana/kit';
import { configSchema, validateChallenge, NETWORK, ASSET, AMOUNT } from './policy.js';
import { readPrivate, saveState, withStateLock } from './storage.js';

export class ClientError extends Error {}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ScanClient {
  constructor({ config, token, fetchImpl = fetch, sign }) {
    this.config = configSchema.parse(config);
    if (typeof token !== 'string' || !token.trim() || /\s/.test(token.trim())) throw new ClientError('invalid_gateway_token');
    this.token = token.trim(); this.fetch = fetchImpl; this.sign = sign;
  }
  async request(url, body, signature) {
    try {
      const response = await this.fetch(url, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(signature ? { 'Payment-Signature': signature } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let size = 0; const chunks = [];
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error('response_too_large');
        chunks.push(chunk);
      }
      return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    } catch { throw new ClientError('gateway_response_unavailable; keep state and use status/retry; never create a new payment to recover'); }
  }
  load(file) {
    const state = JSON.parse(readPrivate(file));
    if (state.version !== 1 || !isDeepStrictEqual(state.config, this.config) || state.inputHash !== digest(state.input)) throw new ClientError('state_or_configuration_changed');
    return state;
  }
  async prepare(file, query) {
    return withStateLock(file, async () => {
      if (fs.existsSync(file)) throw new ClientError('state_exists; use status/retry');
      if (!query || typeof query !== 'object' || Array.isArray(query) || 'requestId' in query || 'paymentSignature' in query) throw new ClientError('query_must_not_supply_payment_or_request_id');
      const input = { ...query, requestId: randomUUID() };
      const state = { version: 1, config: this.config, input, inputHash: digest(input), phase: 'preparing' };
      // Persist the ID before network access, including if the unpaid response is lost.
      saveState(file, state);
      return this.prepareExisting(file, state);
    });
  }
  async prepareExisting(file, state) {
    const result = await this.request(this.config.resourceUrl, state.input);
    if (result.status !== 402) throw new ClientError(`expected_payment_challenge_http_${result.status}`);
    validateChallenge(result.data, this.config, state.input.requestId);
    if (result.data.paymentState !== 'issued') throw new ClientError('payment_already_in_progress; inspect gateway status');
    state.challenge = result.data; state.phase = 'prepared'; saveState(file, state);
    return { state: 'prepared', requestId: state.input.requestId, challengeId: state.challenge.challengeId, amount: '0.005 test USDC', network: 'Solana devnet', recipient: this.config.recipient, expiresAt: state.challenge.expiresAt };
  }
  async pay(file, approved) {
    return withStateLock(file, async () => {
      const state = this.load(file);
      if (state.signature) throw new ClientError('already_signed; use status/retry');
      if (!approved || state.phase !== 'prepared') throw new ClientError('explicit_devnet_approval_and_prepared_scan_required');
      validateChallenge(state.challenge, this.config, state.input.requestId);
      state.signature = await this.sign(state.challenge, this.config, state.input.requestId);
      state.phase = 'signed'; saveState(file, state);
      return this.submit(file, state);
    });
  }
  async retry(file) {
    return withStateLock(file, async () => {
      const state = this.load(file);
      if (state.phase === 'preparing') return this.prepareExisting(file, state);
      if (!state.signature) throw new ClientError('no_signed_payment; review and use pay');
      // No new signature, challenge, request ID or blockhash, even after timeout.
      validateChallenge(state.challenge, this.config, state.input.requestId, false);
      return this.submit(file, state);
    });
  }
  async submit(file, state) {
    const result = await this.request(this.config.resourceUrl, state.input, state.signature);
    if (result.status !== 200) throw new ClientError(`payment_not_completed_http_${result.status}; keep state, inspect status and retry only this signed request`);
    const receipt = result.data.receipt;
    let transactionValid = false;
    try { const bytes = getBase58Encoder().encode(receipt.transaction); transactionValid = bytes.length === 64 && bytes.some(b => b !== 0); } catch { /* Reject malformed receipts. */ }
    if (result.data.state !== 'scan_unlocked' || result.data.provider !== 'solana' || !receipt || !transactionValid ||
        receipt.challengeId !== state.challenge.challengeId || receipt.requestId !== state.input.requestId ||
        receipt.payTo !== this.config.recipient || receipt.amount !== AMOUNT || receipt.asset !== ASSET || receipt.network !== NETWORK) {
      throw new ClientError('invalid_payment_receipt; retain signed state and inspect gateway status');
    }
    state.phase = 'completed'; state.result = result.data; saveState(file, state);
    return result.data;
  }
  async status(file) {
    const state = this.load(file);
    if (!state.challenge) return { state: state.phase, requestId: state.input.requestId, next: 'retry' };
    const result = await this.request(new URL(`/payments/status/${encodeURIComponent(state.challenge.challengeId)}`, this.config.resourceUrl));
    if (result.status !== 200) throw new ClientError(`status_unavailable_http_${result.status}`);
    return result.data;
  }
}

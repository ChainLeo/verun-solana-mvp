import { isAddress } from '@solana/kit';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import { z } from 'zod';

export const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const ASSET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const AMOUNT = '5000';
const publicAddress = z.string().refine(value => isAddress(value) && value !== '11111111111111111111111111111111');
export const configSchema = z.object({
  recipient: publicAddress,
  resourceUrl: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search && url.pathname === '/api/opportunities/x402' && url.href === value;
  }),
}).strict();
const requiredSchema = z.object({
  x402Version: z.literal(2), resource: z.object({ url: z.string() }).strict(),
  accepts: z.array(z.object({
    scheme: z.literal('exact'), network: z.literal(NETWORK), asset: z.literal(ASSET),
    amount: z.literal(AMOUNT), payTo: publicAddress, maxTimeoutSeconds: z.literal(300),
    extra: z.object({ feePayer: publicAddress, memo: z.string().regex(/^scan_[a-f0-9]{48}$/) }).strict(),
  }).strict()).length(1),
}).strict();

// Mirrors the pinned gateway policy; never sign automatically upon HTTP 402.
export function validateChallenge(challenge, config, requestId, checkExpiry = true) {
  const approved = configSchema.parse(config);
  const required = requiredSchema.parse(challenge.paymentRequired);
  const item = required.accepts[0];
  const expires = Date.parse(challenge.expiresAt);
  if (challenge.requestId !== requestId || challenge.provider !== 'solana' || challenge.testOnly !== true ||
      required.resource.url !== approved.resourceUrl || item.payTo !== approved.recipient ||
      item.extra.memo !== challenge.challengeId || !Number.isFinite(expires) ||
      (checkExpiry && (expires <= Date.now() || expires > Date.now() + 305_000))) {
    throw new Error('unapproved_payment_policy_or_expiry');
  }
  return required;
}
export async function signChallenge(challenge, signer, config, requestId) {
  const required = validateChallenge(challenge, config, requestId);
  const scheme = new ExactSvmScheme(signer, { rpcUrl: 'https://api.devnet.solana.com' });
  const signed = await scheme.createPaymentPayload(2, required.accepts[0]);
  return encodePaymentSignatureHeader({ ...signed, accepted: required.accepts[0], resource: required.resource });
}

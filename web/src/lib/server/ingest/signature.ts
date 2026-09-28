import { createHmac, timingSafeEqual } from 'node:crypto';

export const timestampHeader = 'x-skylark-timestamp';
export const signatureHeader = 'x-skylark-signature';
export const signaturePrefix = 'sha256=';
export const timestampWindowSeconds = 300;

export function hmacHex(secret: string, message: string | Uint8Array): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function signBatch(secret: string, unixSeconds: number, body: string | Uint8Array): string {
  const prefix = Buffer.from(`${unixSeconds}.`, 'utf8');
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  return signaturePrefix + hmacHex(secret, Buffer.concat([prefix, payload]));
}

export type SignatureFailure =
  | 'missing_timestamp'
  | 'invalid_timestamp'
  | 'stale_timestamp'
  | 'missing_signature'
  | 'malformed_signature'
  | 'bad_signature';

export interface SignatureCheck {
  ok: boolean;
  failure: SignatureFailure | null;
  timestamp: number | null;
}

export function verifyBatchSignature(
  secret: string,
  timestampValue: string | null,
  signatureValue: string | null,
  body: Uint8Array,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SignatureCheck {
  if (timestampValue === null || timestampValue === '') {
    return { ok: false, failure: 'missing_timestamp', timestamp: null };
  }
  if (!/^\d{1,12}$/.test(timestampValue)) {
    return { ok: false, failure: 'invalid_timestamp', timestamp: null };
  }
  const timestamp = Number(timestampValue);
  if (Math.abs(nowSeconds - timestamp) > timestampWindowSeconds) {
    return { ok: false, failure: 'stale_timestamp', timestamp };
  }
  if (signatureValue === null || signatureValue === '') {
    return { ok: false, failure: 'missing_signature', timestamp };
  }
  if (!/^sha256=[0-9a-f]{64}$/.test(signatureValue)) {
    return { ok: false, failure: 'malformed_signature', timestamp };
  }
  const message = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.from(body)]);
  const expected = Buffer.from(hmacHex(secret, message), 'hex');
  const presented = Buffer.from(signatureValue.slice(signaturePrefix.length), 'hex');
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return { ok: false, failure: 'bad_signature', timestamp };
  }
  return { ok: true, failure: null, timestamp };
}

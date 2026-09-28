import { describe, expect, it } from 'vitest';
import { signBatch, verifyBatchSignature } from '$lib/server/ingest/signature';

const secret = 'test-secret';
const body = Buffer.from('{"events":[]}');

describe('collector signatures', () => {
  it('matches the fixed vector the collector checks too', () => {
    expect(signBatch('skylark-test-secret', 1_790_000_000, '{"events":[]}')).toBe(
      'sha256=a98f594e60c877535fa199bc6a44c87b888eef5a02ab742cf9361b4c97ab12c5'
    );
  });

  it('agrees with the collector on a full batch body', () => {
    const body =
      '{"collector":{"name":"skylark-collector","version":"0.1.0","run_id":"00000000-0000-4000-8000-000000000000","os":"linux","arch":"amd64"},"server":null,"events":[]}';
    expect(signBatch('skylark-test-secret', 1_790_000_000, body)).toBe(
      'sha256=6fcb705dacb5af3277d5b6d3a5e0a606f549c6ca663483ac381943146aa84028'
    );
  });

  it('accepts a correctly signed batch inside the window', () => {
    const now = 1_790_000_000;
    const signature = signBatch(secret, now - 100, body);
    expect(verifyBatchSignature(secret, String(now - 100), signature, body, now).ok).toBe(true);
  });

  it('rejects stale timestamps, bad signatures and malformed headers', () => {
    const now = 1_790_000_000;
    const signature = signBatch(secret, now - 400, body);
    expect(verifyBatchSignature(secret, String(now - 400), signature, body, now).failure).toBe(
      'stale_timestamp'
    );
    const fresh = signBatch(secret, now, body);
    expect(
      verifyBatchSignature(secret, String(now), fresh, Buffer.from('{"events":[1]}'), now).failure
    ).toBe('bad_signature');
    expect(verifyBatchSignature('other', String(now), fresh, body, now).failure).toBe(
      'bad_signature'
    );
    expect(verifyBatchSignature(secret, null, fresh, body, now).failure).toBe('missing_timestamp');
    expect(verifyBatchSignature(secret, 'soon', fresh, body, now).failure).toBe(
      'invalid_timestamp'
    );
    expect(verifyBatchSignature(secret, String(now), null, body, now).failure).toBe(
      'missing_signature'
    );
    expect(verifyBatchSignature(secret, String(now), 'sha256=zz', body, now).failure).toBe(
      'malformed_signature'
    );
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceEnvironment, assertIsolatedEnvironment } from './environment.js';
import { redact, redactJson } from './redaction.js';

test('test environment refuses remote/production or wrong database before migrations', () => {
  assert.doesNotThrow(() => assertIsolatedEnvironment(acceptanceEnvironment));
  assert.throws(() => assertIsolatedEnvironment({ ...acceptanceEnvironment, NODE_ENV: 'production' }));
  assert.throws(() => assertIsolatedEnvironment({ ...acceptanceEnvironment, DATABASE_URL: 'postgresql://test:test@db.example:15432/nexus_test' }));
  assert.throws(() => assertIsolatedEnvironment({ ...acceptanceEnvironment, DATABASE_URL: 'postgresql://test:test@127.0.0.1:15432/production' }));
  assert.throws(() => assertIsolatedEnvironment({ ...acceptanceEnvironment, REDIS_URL: 'redis://remote.example:16379' }));
});

test('known isolated signing key and legacy key must be distinct', () => {
  assert.notEqual(acceptanceEnvironment.AUTH_JWT_SECRET, acceptanceEnvironment.JWT_SECRET);
  assert.notEqual(acceptanceEnvironment.AUTH_JWT_SECRET, acceptanceEnvironment.AUTH_EMAIL_CODE_PEPPER);
  assert.ok(acceptanceEnvironment.AUTH_JWT_SECRET.length >= 32);
  assert.ok(acceptanceEnvironment.AUTH_EMAIL_CODE_PEPPER.length >= 32);
});

test('report redaction removes OTP, JWT, 32-byte refresh token and dedicated test secrets', () => {
  const otp = '493821';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.aabbccddeeff';
  const refreshToken = 'X'.repeat(43);
  const text = redact(`Assertion expected ${otp}; ${jwt}; ${refreshToken}; ${acceptanceEnvironment.AUTH_JWT_SECRET}; ${acceptanceEnvironment.AUTH_EMAIL_CODE_PEPPER}`);
  for (const secret of [otp, jwt, refreshToken, acceptanceEnvironment.AUTH_JWT_SECRET, acceptanceEnvironment.AUTH_EMAIL_CODE_PEPPER]) {
    assert.equal(text.includes(secret), false, 'synthetic sensitive input leaked');
  }
  assert.ok(text.includes('Assertion expected'));
});

test('nested JSON redaction preserves case and status but drops auth fields', () => {
  const result = redactJson({ caseId: 'P00-AUTH-01', status: 'PASS', nested: [{ code: '493821', accessToken: 'opaque-secret', cookie: 'nf_refresh=opaque-secret' }] }) as any;
  assert.equal(result.caseId, 'P00-AUTH-01');
  assert.equal(result.status, 'PASS');
  assert.equal(result.nested[0].code, '[REDACTED]');
  assert.equal(result.nested[0].accessToken, '[REDACTED]');
  assert.equal(result.nested[0].cookie, '[REDACTED]');
});

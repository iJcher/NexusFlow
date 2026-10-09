import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const prefix = 'nexus-secret:v1:';
export function connectionSecretContext(
  kind: 'provider' | 'mcp',
  id: bigint,
  owner: bigint | null,
  field: string,
): string {
  return JSON.stringify([
    kind,
    id.toString(),
    owner?.toString() ?? 'unassigned',
    field,
  ]);
}

@Injectable()
export class SecretVault {
  private readonly keys = new Map<string, Buffer>();
  private readonly active: string;
  constructor() {
    try {
      const configured: unknown = JSON.parse(
        process.env.CONNECTION_ENCRYPTION_KEYS ?? '',
      );
      if (
        !configured ||
        typeof configured !== 'object' ||
        Array.isArray(configured)
      )
        throw new Error();
      for (const [id, raw] of Object.entries(configured)) {
        if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof raw !== 'string')
          throw new Error();
        const key = Buffer.from(raw, 'base64');
        if (
          key.length !== 32 ||
          key.toString('base64') !== raw ||
          (process.env.NODE_ENV === 'production' && id.startsWith('test'))
        )
          throw new Error();
        this.keys.set(id, key);
      }
      this.active = process.env.CONNECTION_ACTIVE_KEY_ID ?? '';
      if (!this.keys.has(this.active) || this.keys.size > 16) throw new Error();
    } catch {
      throw new Error('CONNECTION_ENCRYPTION_CONFIG_INVALID');
    }
  }
  isSealed(value: string): boolean {
    return value.startsWith('nexus-secret:');
  }
  seal(plaintext: string, context: string): string {
    if (Buffer.byteLength(plaintext) > 65536)
      throw new Error('CONNECTION_SECRET_SIZE');
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.keys.get(this.active)!,
      nonce,
    );
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return (
      prefix +
      [
        this.active,
        nonce.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join(':')
    );
  }
  open(envelope: string, context: string): string {
    try {
      if (!envelope.startsWith(prefix) || envelope.length > 90000)
        throw new Error();
      const parts = envelope.slice(prefix.length).split(':');
      if (parts.length !== 4) throw new Error();
      const [id, nonceText, tagText, text] = parts;
      const key = this.keys.get(id);
      const nonce = Buffer.from(nonceText, 'base64url');
      const tag = Buffer.from(tagText, 'base64url');
      const data = Buffer.from(text, 'base64url');
      if (
        !key ||
        nonce.length !== 12 ||
        tag.length !== 16 ||
        nonce.toString('base64url') !== nonceText ||
        tag.toString('base64url') !== tagText ||
        data.toString('base64url') !== text
      )
        throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(data), cipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new Error('CONNECTION_SECRET_UNAVAILABLE');
    }
  }
}

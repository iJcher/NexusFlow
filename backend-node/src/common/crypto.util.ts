import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function generateSalt(): string {
  return uuidv4().replace(/-/g, '');
}

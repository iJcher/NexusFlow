import { HttpException } from '@nestjs/common';

export function authError(
  status: number,
  code: string,
  message: string,
  retryAfter?: number,
): HttpException {
  return new HttpException(
    { code, message, ...(retryAfter !== undefined ? { retryAfter } : {}) },
    status,
  );
}

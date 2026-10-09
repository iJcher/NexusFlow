import { assertJson, Json } from '../runs/contracts';

export function parseJson(value: string): Json {
  const parsed: unknown = JSON.parse(value);
  assertJson(parsed);
  return parsed;
}

export function parseStringList(value: string): string[] {
  const parsed = parseJson(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === 'string')
  )
    throw new Error('Stored value is not a string array');
  return parsed;
}

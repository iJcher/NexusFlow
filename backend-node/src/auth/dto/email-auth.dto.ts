import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { domainToASCII } from 'node:url';

// Preserve local-part case and provider aliases; normalize only whitespace/domain.
export function normalizeEmail(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const email = value.trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  return (
    email.slice(0, at) + '@' + domainToASCII(email.slice(at + 1)).toLowerCase()
  );
}

export class EmailCodeDto {
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsString()
  @MaxLength(254)
  @Matches(/^[^\r\n\0]+$/)
  @IsEmail({
    allow_utf8_local_part: false,
    require_tld: true,
    allow_ip_domain: false,
  })
  email!: string;
}

export class EmailLoginDto extends EmailCodeDto {
  @IsUUID('4')
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

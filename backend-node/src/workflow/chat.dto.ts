import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChatFileDto {
  @IsString() @MaxLength(4096) url!: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsNumber() @Min(0) size?: number;
  @IsOptional() @IsString() @MaxLength(255) mimeType?: string;
}

export class ChatRequestDto {
  @IsOptional() @IsString() @MaxLength(100000) query?: string;
  @IsOptional() @IsString() @MaxLength(128) conversation_id?: string;
  @IsOptional() @IsString() @MaxLength(128) conversationId?: string;
  @IsOptional() @IsString() @MaxLength(32) response_mode?: string;
  @IsOptional() @IsObject() inputs?: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatFileDto)
  files?: ChatFileDto[];
  // Client user is ignored: authenticated identity always wins.
  @Allow() user?: unknown;
}

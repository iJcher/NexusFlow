import {
  ArrayMaxSize,
  IsArray,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class LlmProviderWriteDto {
  @IsOptional() @IsNumberString() id?: string;
  @IsOptional() @IsString() @MaxLength(120) platformName?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  llmNames?: string[];
  @IsOptional() @IsString() @MaxLength(2048) llmAPIUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) llmapiUrl?: string;
  @IsOptional() @IsString() @MaxLength(8192) llmAPIKey?: string;
  @IsOptional() @IsString() @MaxLength(8192) llmapiKey?: string;
}

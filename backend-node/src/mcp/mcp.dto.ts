import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class McpWriteDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['sse', 'http']) transport?: string;
  @IsOptional() @IsString() @MaxLength(2048) endpoint?: string;
  @IsOptional() @IsString() @MaxLength(2048) command?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  args?: string[];
  @IsOptional() @IsObject() env?: Record<string, string>;
  @IsOptional() @IsObject() headers?: Record<string, string>;
  @Allow() tools?: unknown;
}

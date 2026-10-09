import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class TemplateWriteDto {
  @IsOptional() @IsNumberString() flowId?: string;
  @IsOptional() @IsNumberString() id?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tags?: string[];
  @IsOptional() @IsBoolean() isOfficial?: boolean;
  @Allow() flowType?: string | number;
  @Allow() configInfoForRun?: unknown;
  @IsOptional() @IsString() @MaxLength(1048576) configInfoForWeb?:
    | string
    | null;
}

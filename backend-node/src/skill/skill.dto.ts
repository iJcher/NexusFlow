import {
  Allow,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SkillGenerateDto {
  @IsNumberString() flowId!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) modelKey?: string;
  @IsOptional() @IsString() @MaxLength(255) modelName?: string;
  @Allow() inputSchema?: unknown;
  @Allow() outputSchema?: unknown;
}

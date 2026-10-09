import {
  IsIn,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class KnowledgeWriteDto {
  @IsOptional() @IsNumberString() id?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) embeddingModel?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) chunkSize?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) chunkOverlap?: number;
  @IsOptional()
  @IsIn(['fixed', 'paragraph', 'markdown'])
  chunkStrategy?: string;
}

export class KnowledgeSearchDto {
  @IsNumberString() knowledgeBaseId!: string;
  @IsString() @MaxLength(100000) query!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) topK?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) threshold?: number;
  @IsOptional() @IsString() @MaxLength(255) embeddingModel?: string;
}

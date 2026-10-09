import {
  Allow,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const flowTypes: Record<string, number> = {
  LogicFlow: 0,
  AIFlow: 1,
  ApprovalFlow: 2,
};
export class FlowWriteDto {
  @IsOptional() @IsNumberString() id?: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (flowTypes[value] ?? Number(value)) : value,
  )
  @IsIn([0, 1, 2])
  flowType?: number;
  @Allow() configInfoForRun?: unknown;
  @IsOptional() @IsString() @MaxLength(1048576) configInfoForWeb?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { DocumentResultResponseDto } from '../../documents/dto/document-query-response.dto.js';
import { ReviewCorrectionFieldsDto } from './review-correction-body.dto.js';

export class ReviewCorrectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ example: 2, description: 'Versão da revisão depois da correção aceita.' })
  version!: number;

  @ApiProperty({ description: 'Revisor dono do claim usado para aceitar a correção.' })
  reviewedBy!: string;

  @ApiProperty({ type: ReviewCorrectionFieldsDto })
  correctedFields!: ReviewCorrectionFieldsDto;

  @ApiProperty({ type: DocumentResultResponseDto, description: 'Resultado original produzido pela IA.' })
  aiResult!: DocumentResultResponseDto;

  @ApiProperty({ type: DocumentResultResponseDto, description: 'Resultado efetivo após aplicar a correção aceita.' })
  effectiveResult!: DocumentResultResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

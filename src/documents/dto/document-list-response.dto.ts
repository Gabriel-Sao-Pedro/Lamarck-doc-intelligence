import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '../../generated/prisma/enums.js';

/**
 * Item de resumo da listagem — nunca inclui campos extraídos da pessoa nem
 * detalhes internos (storageKey, sha256, claim/lease, ProcessingJob/Run).
 * A consulta individual (`GET /documents/:id`) continua sendo a superfície
 * para o resultado detalhado.
 */
export class DocumentListItemDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ enum: DocumentStatus })
  status!: DocumentStatus;

  @ApiProperty({ description: 'Tipo documental de negócio (ex.: IDENTITY_DOCUMENT), independente do formato do arquivo.' })
  documentType!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DocumentListPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total de documentos que correspondem ao filtro atual.' })
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class DocumentListResponseDto {
  @ApiProperty({ type: [DocumentListItemDto] })
  items!: DocumentListItemDto[];

  @ApiProperty({ type: DocumentListPaginationDto })
  pagination!: DocumentListPaginationDto;
}

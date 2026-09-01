import type { DocumentStatus } from '../../generated/prisma/enums.js';

/**
 * Item de resumo da listagem — nunca inclui campos extraídos da pessoa nem
 * detalhes internos (storageKey, sha256, claim/lease, ProcessingJob/Run).
 * A consulta individual (`GET /documents/:id`) continua sendo a superfície
 * para o resultado detalhado.
 */
export interface DocumentListItemDto {
  documentId: string;
  status: DocumentStatus;
  documentType: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentListPaginationDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class DocumentListResponseDto {
  items!: DocumentListItemDto[];
  pagination!: DocumentListPaginationDto;
}

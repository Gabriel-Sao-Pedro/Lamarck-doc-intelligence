import type { DocumentStatus } from '../../generated/prisma/enums.js';

export interface DocumentResultFieldsDto {
  fullName: string;
  parentage: string;
  birthDate: string;
  documentNumber: string;
  issuingAuthority: string;
}

export interface DocumentResultResponseDto {
  documentType: string;
  fields: DocumentResultFieldsDto;
  confidence: number;
}

/**
 * Contrato de docs/specification.md §10 e docs/architecture.md §18: o
 * consumidor sabe identificador, estado, tipo e resultado disponível — não
 * sabe nada de storage, claim, lease ou qualquer detalhe de infraestrutura.
 */
export class DocumentQueryResponseDto {
  documentId!: string;
  documentType!: string;
  status!: DocumentStatus;
  createdAt!: Date;
  updatedAt!: Date;
  result!: DocumentResultResponseDto | null;
}

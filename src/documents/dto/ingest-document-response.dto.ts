import type { DocumentStatus } from '../../generated/prisma/enums.js';

export class IngestDocumentResponseDto {
  documentId!: string;
  status!: DocumentStatus;
  deduplicated!: boolean;
}

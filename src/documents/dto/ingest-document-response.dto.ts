import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '../../generated/prisma/enums.js';

export class IngestDocumentResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador do documento — novo ou já existente em caso de duplicata.' })
  documentId!: string;

  @ApiProperty({ enum: DocumentStatus, description: 'Estado atual do documento.' })
  status!: DocumentStatus;

  @ApiProperty({ description: 'true quando o mesmo arquivo já existia e nada novo foi criado — documentId aponta para o registro existente.' })
  deduplicated!: boolean;
}

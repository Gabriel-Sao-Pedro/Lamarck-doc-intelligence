import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '../../generated/prisma/enums.js';

export class DocumentResultFieldsDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  parentage!: string;

  @ApiProperty({ example: '1990-01-01' })
  birthDate!: string;

  @ApiProperty()
  documentNumber!: string;

  @ApiProperty()
  issuingAuthority!: string;
}

export class DocumentResultResponseDto {
  @ApiProperty({ description: 'Tipo documental de negócio do resultado extraído.' })
  documentType!: string;

  @ApiProperty({ type: DocumentResultFieldsDto })
  fields!: DocumentResultFieldsDto;

  @ApiProperty({ example: 0.95 })
  confidence!: number;
}

/**
 * Contrato de docs/specification.md §10 e docs/architecture.md §18: o
 * consumidor sabe identificador, estado, tipo e resultado disponível — não
 * sabe nada de storage, claim, lease ou qualquer detalhe de infraestrutura.
 */
export class DocumentQueryResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ description: 'Tipo documental de negócio (ex.: IDENTITY_DOCUMENT), independente do formato do arquivo.' })
  documentType!: string;

  @ApiProperty({ enum: DocumentStatus })
  status!: DocumentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    type: DocumentResultResponseDto,
    nullable: true,
    description: 'null enquanto o documento ainda não chegou a um estado com resultado (RECEIVED/PROCESSING/RETRYING/FAILED).',
  })
  result!: DocumentResultResponseDto | null;
}

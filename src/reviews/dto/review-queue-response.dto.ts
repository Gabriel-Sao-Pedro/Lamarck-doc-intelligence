import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { DocumentResultResponseDto } from '../../documents/dto/document-query-response.dto.js';

export class ReviewQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ description: 'Tipo documental de negócio (ex.: IDENTITY_DOCUMENT).' })
  documentType!: string;

  @ApiProperty({ enum: DocumentStatus, description: 'Sempre NEEDS_REVIEW nesta rota.' })
  status!: DocumentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    type: DocumentResultResponseDto,
    nullable: true,
    description: 'O resultado que levou o documento a NEEDS_REVIEW.',
  })
  result!: DocumentResultResponseDto | null;
}

export class ReviewQueuePaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ReviewQueueResponseDto {
  @ApiProperty({ type: [ReviewQueueItemDto] })
  items!: ReviewQueueItemDto[];

  @ApiProperty({ type: ReviewQueuePaginationDto })
  pagination!: ReviewQueuePaginationDto;
}

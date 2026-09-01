import { ApiProperty } from '@nestjs/swagger';

export class ReviewClaimResponseDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ description: 'Identificador do revisor que detém o claim agora.' })
  claimedBy!: string;

  @ApiProperty({ format: 'uuid', description: 'Fencing token desta posse específica do claim.' })
  claimToken!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  leaseExpiresAt!: Date;

  @ApiProperty({ example: 1, description: 'Versão atual da revisão, usada no PATCH com optimistic locking.' })
  version!: number;
}

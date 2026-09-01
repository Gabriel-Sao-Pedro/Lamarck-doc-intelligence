import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DocumentStatus } from '../generated/prisma/enums.js';
import type { ReviewClaimResponseDto } from './dto/review-claim-response.dto.js';
import { REVIEW_LEASE_MS } from './reviews.constants.js';

type TransactionClient = Prisma.TransactionClient;

interface DocumentRow {
  id: string;
  status: DocumentStatus;
}

/**
 * Claim atômico de revisão humana (Fase 3.2), mesmo raciocínio de
 * concorrência do JobClaimService (docs/architecture.md §10/§11, ADR-002),
 * adaptado para um recurso que ainda não tem linha própria na primeira
 * disputa: o lock precisa existir mesmo quando ReviewClaim ainda não foi
 * criado, por isso o `FOR UPDATE` é feito em Document, não em ReviewClaim.
 * Duas requisições concorrentes para o mesmo documentId serializam nessa
 * linha — a segunda só enxerga o resultado da primeira depois que ela
 * commita, nunca antes (RC7).
 */
@Injectable()
export class ReviewClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(documentId: string, reviewerId: string): Promise<ReviewClaimResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DocumentRow[]>`
        SELECT "id", "status" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new NotFoundException('Documento não encontrado.');
      }

      const document = rows[0];
      if (document.status !== DocumentStatus.NEEDS_REVIEW) {
        throw new ConflictException('Documento não está em NEEDS_REVIEW.');
      }

      const now = new Date();
      const existingClaim = await tx.reviewClaim.findUnique({ where: { documentId } });
      if (existingClaim && existingClaim.leaseExpiresAt > now) {
        throw new ConflictException('Documento já está reivindicado por outro revisor.');
      }

      return this.acquireClaim(tx, documentId, reviewerId, now);
    });
  }

  private async acquireClaim(
    tx: TransactionClient,
    documentId: string,
    reviewerId: string,
    now: Date,
  ): Promise<ReviewClaimResponseDto> {
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + REVIEW_LEASE_MS);

    const claim = await tx.reviewClaim.upsert({
      where: { documentId },
      create: { documentId, reviewerId, claimToken, leaseExpiresAt },
      update: { reviewerId, claimToken, leaseExpiresAt },
    });

    return {
      documentId: claim.documentId,
      claimedBy: claim.reviewerId,
      claimToken: claim.claimToken,
      leaseExpiresAt: claim.leaseExpiresAt,
    };
  }
}

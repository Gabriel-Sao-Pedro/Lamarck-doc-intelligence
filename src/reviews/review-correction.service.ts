import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DocumentStatus } from '../generated/prisma/enums.js';
import type { DocumentResultFieldsDto, DocumentResultResponseDto } from '../documents/dto/document-query-response.dto.js';
import type { ReviewCorrectionBody, ReviewCorrectionFields } from './dto/review-correction-body.dto.js';
import type { ReviewCorrectionResponseDto } from './dto/review-correction-response.dto.js';

type TransactionClient = Prisma.TransactionClient;

interface ReviewDocumentRow {
  id: string;
  status: DocumentStatus;
  reviewVersion: number;
}

/**
 * Persiste correções revisadas sem sobrescrever o resultado da IA. O
 * optimistic locking usa Document.reviewVersion como versão operacional e
 * ReviewCorrection como histórico append-only das versões aceitas.
 */
@Injectable()
export class ReviewCorrectionService {
  constructor(private readonly prisma: PrismaService) {}

  async correct(documentId: string, body: ReviewCorrectionBody): Promise<ReviewCorrectionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const document = await this.lockDocument(tx, documentId);
      if (!document) {
        throw new NotFoundException('Documento não encontrado.');
      }
      if (document.status !== DocumentStatus.NEEDS_REVIEW) {
        throw new ConflictException('Documento não está em NEEDS_REVIEW.');
      }

      const claim = await tx.reviewClaim.findUnique({ where: { documentId } });
      if (!claim || claim.claimToken !== body.claimToken || claim.leaseExpiresAt <= now) {
        throw new ConflictException('Claim inválido, expirado ou substituído.');
      }

      if (document.reviewVersion !== body.version) {
        throw new ConflictException('Versão de revisão desatualizada.');
      }

      const aiResult = await this.loadAiResult(tx, documentId);
      if (!aiResult) {
        throw new ConflictException('Documento não possui resultado da IA para revisar.');
      }

      const nextVersion = document.reviewVersion + 1;
      const updated = await tx.document.updateMany({
        where: { id: documentId, status: DocumentStatus.NEEDS_REVIEW, reviewVersion: body.version },
        data: { reviewVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Versão de revisão desatualizada.');
      }

      const previousCorrections = await tx.reviewCorrection.findMany({
        where: { documentId },
        orderBy: { version: 'asc' },
      });
      const acceptedCorrection = await tx.reviewCorrection.create({
        data: {
          documentId,
          version: nextVersion,
          correctedFields: body.corrections as Prisma.InputJsonValue,
          reviewedBy: claim.reviewerId,
        },
      });

      const effectiveFields = this.applyCorrections(aiResult.fields, [
        ...previousCorrections.map((correction) => correction.correctedFields as ReviewCorrectionFields),
        body.corrections,
      ]);

      return {
        documentId,
        version: nextVersion,
        reviewedBy: acceptedCorrection.reviewedBy,
        correctedFields: body.corrections,
        aiResult,
        effectiveResult: {
          documentType: aiResult.documentType,
          fields: effectiveFields,
          confidence: aiResult.confidence,
        },
        updatedAt: acceptedCorrection.updatedAt,
      };
    });
  }

  private async lockDocument(tx: TransactionClient, documentId: string): Promise<ReviewDocumentRow | null> {
    const rows = await tx.$queryRaw<ReviewDocumentRow[]>`
      SELECT "id", "status", "reviewVersion" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async loadAiResult(tx: TransactionClient, documentId: string): Promise<DocumentResultResponseDto | null> {
    const documentResult = await tx.documentResult.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!documentResult) return null;

    const data = documentResult.data as { fields?: DocumentResultFieldsDto; confidence?: number };
    return {
      documentType: documentResult.documentType,
      fields: data.fields as DocumentResultFieldsDto,
      confidence: data.confidence as number,
    };
  }

  private applyCorrections(
    aiFields: DocumentResultFieldsDto,
    corrections: ReviewCorrectionFields[],
  ): DocumentResultFieldsDto {
    return corrections.reduce<DocumentResultFieldsDto>(
      (current, correction) => ({ ...current, ...correction }),
      { ...aiFields },
    );
  }
}

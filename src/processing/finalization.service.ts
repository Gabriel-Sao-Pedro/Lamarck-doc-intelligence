import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { DocumentStatus } from '../generated/prisma/enums.js';
import { MAX_ATTEMPTS, RESULT_SCHEMA_VERSION } from './processing.constants.js';
import type { ProviderResult } from './provider/provider.types.js';
import { assertValidTransition } from './state-transition.js';

export type FinalizeOutcome =
  | { kind: 'SUCCESS'; result: ProviderResult }
  | { kind: 'NEEDS_REVIEW'; result: ProviderResult }
  | { kind: 'TECHNICAL_FAILURE'; errorType: string };

export interface FinalizeParams {
  jobId: string;
  documentId: string;
  processingRunId: string;
  claimToken: string;
  outcome: FinalizeOutcome;
}

export type FinalizeResult = 'FINALIZED' | 'STALE';

/**
 * Finalização de uma tentativa (docs/architecture.md §11, prompt de
 * processamento §6/§16). Protegida por fencing: só grava algo se o
 * claimToken apresentado ainda for o atual, o lease ainda for válido e o
 * documento ainda estiver em PROCESSING — um worker stale (que perdeu o
 * lease para outro worker) precisa abandonar a finalização sem gravar nada.
 */
@Injectable()
export class FinalizationService {
  private readonly logger = new Logger(FinalizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async finalize(params: FinalizeParams): Promise<FinalizeResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const job = await tx.processingJob.findUnique({
        where: { id: params.jobId },
        include: { document: true },
      });

      const ownershipValid =
        job !== null &&
        job.claimToken === params.claimToken &&
        job.document.status === 'PROCESSING' &&
        job.leaseExpiresAt !== null &&
        job.leaseExpiresAt.getTime() > now.getTime();

      if (!ownershipValid) {
        this.logger.warn(
          `stale finalize ignored jobId=${params.jobId} documentId=${params.documentId} processingRunId=${params.processingRunId}`,
        );
        return 'STALE';
      }

      if (params.outcome.kind === 'SUCCESS' || params.outcome.kind === 'NEEDS_REVIEW') {
        const runStatus = params.outcome.kind === 'SUCCESS' ? 'SUCCEEDED' : 'SEMANTIC_MISMATCH';
        const newDocumentStatus: DocumentStatus = params.outcome.kind === 'SUCCESS' ? 'COMPLETED' : 'NEEDS_REVIEW';

        assertValidTransition(job.document.status as DocumentStatus, newDocumentStatus);

        await tx.processingRun.update({
          where: { id: params.processingRunId },
          data: { status: runStatus, finishedAt: now },
        });

        await tx.documentResult.create({
          data: {
            documentId: params.documentId,
            processingRunId: params.processingRunId,
            documentType: params.outcome.result.documentType,
            schemaVersion: RESULT_SCHEMA_VERSION,
            data: {
              fields: { ...params.outcome.result.fields },
              confidence: params.outcome.result.confidence,
            } satisfies Prisma.InputJsonValue,
          },
        });

        await tx.document.update({ where: { id: params.documentId }, data: { status: newDocumentStatus } });
        await tx.processingJob.update({
          where: { id: params.jobId },
          data: { claimedBy: null, claimedAt: null, leaseExpiresAt: null, claimToken: null },
        });

        this.logger.log(
          `job finalized jobId=${params.jobId} documentId=${params.documentId} outcome=${params.outcome.kind} status=${newDocumentStatus}`,
        );
        return 'FINALIZED';
      }

      // TECHNICAL_FAILURE
      await tx.processingRun.update({
        where: { id: params.processingRunId },
        data: { status: 'TECHNICAL_FAILURE', technicalErrorType: params.outcome.errorType, finishedAt: now },
      });

      assertValidTransition(job.document.status as DocumentStatus, 'RETRYING' as DocumentStatus);

      const exhausted = job.attemptCount >= MAX_ATTEMPTS;
      const newDocumentStatus: DocumentStatus = exhausted ? 'FAILED' : 'RETRYING';
      if (exhausted) {
        assertValidTransition('RETRYING' as DocumentStatus, 'FAILED' as DocumentStatus);
      }

      await tx.document.update({ where: { id: params.documentId }, data: { status: newDocumentStatus } });
      await tx.processingJob.update({
        where: { id: params.jobId },
        data: { claimedBy: null, claimedAt: null, leaseExpiresAt: null, claimToken: null },
      });

      this.logger.log(
        `job finalized jobId=${params.jobId} documentId=${params.documentId} outcome=TECHNICAL_FAILURE errorType=${params.outcome.errorType} status=${newDocumentStatus}`,
      );
      return 'FINALIZED';
    });
  }
}

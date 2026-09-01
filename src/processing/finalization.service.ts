import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { DocumentStatus } from '../generated/prisma/enums.js';
import { RESULT_SCHEMA_VERSION } from './processing.constants.js';
import type { ProviderResult } from './provider/provider.types.js';
import { assertValidTransition } from './state-transition.js';

export type FinalizeOutcome =
  | { kind: 'SUCCESS'; result: ProviderResult }
  | { kind: 'NEEDS_REVIEW'; result: ProviderResult }
  | { kind: 'TECHNICAL_FAILURE'; errorType: string };

export interface FinalizeParams {
  jobId: string;
  processingRunId: string;
  claimToken: string;
  outcome: FinalizeOutcome;
}

export type FinalizeResult = 'FINALIZED' | 'STALE';

/**
 * Finalização de uma tentativa (docs/architecture.md §11, PROC-001/PROC-002
 * da revisão em docs/implementation/reviews/04-document-processing-review.md).
 *
 * O `ProcessingJob` claimado (por jobId + claimToken) é a raiz de confiança:
 * `documentId` nunca é aceito como parâmetro — é sempre derivado do job já
 * validado, e o `ProcessingRun` informado é carregado e conferido contra
 * esse mesmo job/tentativa antes de qualquer escrita. Nenhuma gravação
 * acontece antes de todas essas checagens passarem (PROC-002).
 *
 * Falha técnica sempre persiste PROCESSING -> RETRYING aqui — nunca
 * PROCESSING -> FAILED diretamente. Se a tentativa já era a última
 * permitida, quem resolve RETRYING -> FAILED é uma etapa posterior e
 * separada (JobClaimService), sem chamar o provider de novo (PROC-001).
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
        this.logger.warn(`stale finalize ignored jobId=${params.jobId} processingRunId=${params.processingRunId}`);
        return 'STALE';
      }

      // documentId é sempre derivado do job já validado — nunca aceito como
      // parâmetro independente (PROC-002).
      const documentId = job.documentId;

      const run = await tx.processingRun.findUnique({ where: { id: params.processingRunId } });
      const runValid =
        run !== null &&
        run.documentId === documentId &&
        run.attemptNumber === job.attemptCount &&
        run.status === 'STARTED';

      if (!runValid) {
        this.logger.warn(
          `finalize rejected: processingRunId does not match the claimed job/attempt jobId=${params.jobId} processingRunId=${params.processingRunId}`,
        );
        return 'STALE';
      }

      if (params.outcome.kind === 'SUCCESS' || params.outcome.kind === 'NEEDS_REVIEW') {
        const runStatus = params.outcome.kind === 'SUCCESS' ? 'SUCCEEDED' : 'SEMANTIC_MISMATCH';
        const newDocumentStatus: DocumentStatus = params.outcome.kind === 'SUCCESS' ? 'COMPLETED' : 'NEEDS_REVIEW';

        assertValidTransition(job.document.status as DocumentStatus, newDocumentStatus);

        await tx.processingRun.update({
          where: { id: run.id },
          data: { status: runStatus, finishedAt: now },
        });

        await tx.documentResult.create({
          data: {
            documentId,
            processingRunId: run.id,
            documentType: params.outcome.result.documentType,
            schemaVersion: RESULT_SCHEMA_VERSION,
            data: {
              fields: { ...params.outcome.result.fields },
              confidence: params.outcome.result.confidence,
            } satisfies Prisma.InputJsonValue,
          },
        });

        await tx.document.update({ where: { id: documentId }, data: { status: newDocumentStatus } });
        await tx.processingJob.update({
          where: { id: params.jobId },
          data: { claimedBy: null, claimedAt: null, leaseExpiresAt: null, claimToken: null },
        });

        this.logger.log(
          `job finalized jobId=${params.jobId} documentId=${documentId} outcome=${params.outcome.kind} status=${newDocumentStatus}`,
        );
        return 'FINALIZED';
      }

      // TECHNICAL_FAILURE — sempre PROCESSING -> RETRYING aqui, nunca
      // FAILED diretamente (PROC-001). A checagem de esgotamento de
      // tentativas acontece depois, no claim, numa transação separada.
      await tx.processingRun.update({
        where: { id: run.id },
        data: { status: 'TECHNICAL_FAILURE', technicalErrorType: params.outcome.errorType, finishedAt: now },
      });

      assertValidTransition(job.document.status as DocumentStatus, 'RETRYING' as DocumentStatus);
      await tx.document.update({ where: { id: documentId }, data: { status: 'RETRYING' } });
      await tx.processingJob.update({
        where: { id: params.jobId },
        data: { claimedBy: null, claimedAt: null, leaseExpiresAt: null, claimToken: null },
      });

      this.logger.log(
        `job finalized jobId=${params.jobId} documentId=${documentId} outcome=TECHNICAL_FAILURE errorType=${params.outcome.errorType} status=RETRYING`,
      );
      return 'FINALIZED';
    });
  }
}

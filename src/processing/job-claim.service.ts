import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { DocumentStatus } from '../generated/prisma/enums.js';
import {
  LEASE_DURATION_MS,
  LEASE_EXPIRED_ERROR_TYPE,
  MAX_ATTEMPTS,
  MODEL_NAME,
  MODEL_VERSION,
  OUTPUT_SCHEMA_VERSION,
  PROMPT_HASH,
  PROMPT_ID,
  PROMPT_VERSION,
  PROVIDER_NAME,
} from './processing.constants.js';
import { assertValidTransition } from './state-transition.js';

export interface ClaimedJob {
  jobId: string;
  documentId: string;
  documentType: string;
  storageKey: string;
  claimToken: string;
  attemptNumber: number;
  processingRunId: string;
}

interface EligibleJobRow {
  id: string;
}

type TransactionClient = Prisma.TransactionClient;
type JobWithDocument = Prisma.ProcessingJobGetPayload<{ include: { document: true } }>;

/**
 * Claim atômico de jobs elegíveis (docs/architecture.md §10/§11, ADR-002).
 * A transação é curta: seleciona, bloqueia com `FOR UPDATE SKIP LOCKED`,
 * grava claim/lease/attemptCount/status e termina — nunca fica aberta
 * durante a chamada ao provider.
 *
 * PROC-001 (docs/implementation/reviews/04-document-processing-review.md):
 * a recuperação de lease expirado nunca resolve `PROCESSING -> FAILED`
 * numa única transação. Ela persiste `PROCESSING -> RETRYING` e para —
 * quem decide entre `RETRYING -> FAILED` (esgotado) ou
 * `RETRYING -> PROCESSING` (nova tentativa) é a *próxima* chamada a este
 * método, numa transação separada, para que `RETRYING` seja um estado
 * real e recuperável mesmo se o processo cair entre as duas etapas.
 */
@Injectable()
export class JobClaimService {
  private readonly logger = new Logger(JobClaimService.name);

  constructor(private readonly prisma: PrismaService) {}

  async claimNextEligibleJob(workerId: string): Promise<ClaimedJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Elegível quando: (a) nunca reivindicado (RECEIVED/RETRYING sem
      // claimedBy) ou (b) em PROCESSING com lease vencido — recuperação de
      // worker morto, sem reaper separado (docs/architecture.md §11).
      const eligible = await tx.$queryRaw<EligibleJobRow[]>`
        SELECT pj."id"
        FROM "ProcessingJob" pj
        JOIN "Document" d ON d."id" = pj."documentId"
        WHERE (
          (d."status" IN ('RECEIVED', 'RETRYING') AND pj."claimedBy" IS NULL)
          OR (d."status" = 'PROCESSING' AND pj."leaseExpiresAt" IS NOT NULL AND pj."leaseExpiresAt" < ${now})
        )
        ORDER BY pj."createdAt" ASC
        LIMIT 1
        FOR UPDATE OF pj SKIP LOCKED
      `;

      if (eligible.length === 0) return null;

      const job = await tx.processingJob.findUniqueOrThrow({
        where: { id: eligible[0].id },
        include: { document: true },
      });

      if (job.document.status === 'PROCESSING') {
        return this.recoverExpiredLease(tx, job, now);
      }

      // job.document.status é RECEIVED ou RETRYING aqui (garantido pela
      // condição de elegibilidade acima).
      const currentStatus = job.document.status as DocumentStatus;
      const nextAttempt = job.attemptCount + 1;

      if (currentStatus === 'RETRYING' && nextAttempt > MAX_ATTEMPTS) {
        // Job já esgotou as tentativas numa recuperação anterior (ou numa
        // falha técnica normal) e ainda não foi resolvido. Resolve agora,
        // nesta transação própria, sem chamar o provider (PROC-001).
        assertValidTransition('RETRYING' as DocumentStatus, 'FAILED' as DocumentStatus);
        await tx.document.update({ where: { id: job.documentId }, data: { status: 'FAILED' } });
        this.logger.warn(
          `job exhausted, resolved RETRYING -> FAILED jobId=${job.id} documentId=${job.documentId} attemptCount=${job.attemptCount}`,
        );
        return null;
      }

      return this.claimNewAttempt(tx, job, currentStatus, nextAttempt, workerId, now);
    });
  }

  /**
   * Encontrou um job em PROCESSING com lease vencido: fecha a tentativa
   * anterior (que nunca finalizou) como falha técnica e persiste
   * PROCESSING -> RETRYING. Não decide FAILED nem inicia nova tentativa
   * aqui — isso fica para a próxima chamada, já com RETRYING commitado.
   */
  private async recoverExpiredLease(
    tx: TransactionClient,
    job: JobWithDocument,
    now: Date,
  ): Promise<null> {
    const staleRun = await tx.processingRun.findFirst({
      where: { documentId: job.documentId, attemptNumber: job.attemptCount, status: 'STARTED' },
    });
    if (staleRun) {
      await tx.processingRun.update({
        where: { id: staleRun.id },
        data: { status: 'TECHNICAL_FAILURE', technicalErrorType: LEASE_EXPIRED_ERROR_TYPE, finishedAt: now },
      });
    }

    assertValidTransition('PROCESSING' as DocumentStatus, 'RETRYING' as DocumentStatus);
    await tx.document.update({ where: { id: job.documentId }, data: { status: 'RETRYING' } });
    await tx.processingJob.update({
      where: { id: job.id },
      data: { claimedBy: null, claimedAt: null, leaseExpiresAt: null, claimToken: null },
    });

    this.logger.warn(
      `stale lease recovered, marked RETRYING jobId=${job.id} documentId=${job.documentId} attemptCount=${job.attemptCount}`,
    );
    return null;
  }

  private async claimNewAttempt(
    tx: TransactionClient,
    job: JobWithDocument,
    currentStatus: DocumentStatus,
    nextAttempt: number,
    workerId: string,
    now: Date,
  ): Promise<ClaimedJob> {
    assertValidTransition(currentStatus, 'PROCESSING' as DocumentStatus);

    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    await tx.processingJob.update({
      where: { id: job.id },
      data: { attemptCount: nextAttempt, claimedBy: workerId, claimedAt: now, leaseExpiresAt, claimToken },
    });
    await tx.document.update({ where: { id: job.documentId }, data: { status: 'PROCESSING' } });

    const run = await tx.processingRun.create({
      data: {
        documentId: job.documentId,
        attemptNumber: nextAttempt,
        status: 'STARTED',
        provider: PROVIDER_NAME,
        model: MODEL_NAME,
        modelVersion: MODEL_VERSION,
        promptId: PROMPT_ID,
        promptVersion: PROMPT_VERSION,
        promptHash: PROMPT_HASH,
        outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
        startedAt: now,
      },
    });

    this.logger.log(
      `job claimed jobId=${job.id} documentId=${job.documentId} workerId=${workerId} attemptNumber=${nextAttempt}`,
    );

    return {
      jobId: job.id,
      documentId: job.documentId,
      documentType: job.document.documentType,
      storageKey: job.document.storageKey,
      claimToken,
      attemptNumber: nextAttempt,
      processingRunId: run.id,
    };
  }
}

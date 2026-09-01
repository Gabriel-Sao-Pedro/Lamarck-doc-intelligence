import { Injectable, Logger } from '@nestjs/common';
import { FinalizationService, type FinalizeOutcome } from './finalization.service.js';
import { JobClaimService } from './job-claim.service.js';
import { DocumentAiProvider } from './provider/document-ai-provider.js';
import { ProviderTechnicalError } from './provider/provider.types.js';
import { validateResult } from './validation/result-validator.js';

export type ProcessOnceResult = 'IDLE' | 'PROCESSED' | 'STALE';

/**
 * Orquestra uma tentativa completa: claim (curto, no banco) -> provider
 * (fora de qualquer transação) -> validação -> finalização (curta, com
 * fencing). docs/architecture.md §10: a transação de claim termina antes
 * da chamada ao provider — nunca segura lock durante os segundos
 * simulados da IA.
 */
@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly jobClaimService: JobClaimService,
    private readonly finalizationService: FinalizationService,
    private readonly provider: DocumentAiProvider,
  ) {}

  async processOnce(workerId: string): Promise<ProcessOnceResult> {
    const claimed = await this.jobClaimService.claimNextEligibleJob(workerId);
    if (!claimed) return 'IDLE';

    const startedAt = Date.now();
    let outcome: FinalizeOutcome;

    try {
      const result = await this.provider.process({
        documentId: claimed.documentId,
        documentType: claimed.documentType,
        storageKey: claimed.storageKey,
      });
      const validation = validateResult(result);
      outcome = validation === 'VALID' ? { kind: 'SUCCESS', result } : { kind: 'NEEDS_REVIEW', result };
    } catch (error) {
      const errorType = error instanceof ProviderTechnicalError ? error.code : 'UNEXPECTED_ERROR';
      outcome = { kind: 'TECHNICAL_FAILURE', errorType };
    }

    const finalizeResult = await this.finalizationService.finalize({
      jobId: claimed.jobId,
      processingRunId: claimed.processingRunId,
      claimToken: claimed.claimToken,
      outcome,
    });

    this.logger.log(
      `processed documentId=${claimed.documentId} processingJobId=${claimed.jobId} attemptNumber=${claimed.attemptNumber} workerId=${workerId} outcome=${outcome.kind} durationMs=${Date.now() - startedAt} finalizeResult=${finalizeResult}`,
    );

    return finalizeResult === 'FINALIZED' ? 'PROCESSED' : 'STALE';
  }
}

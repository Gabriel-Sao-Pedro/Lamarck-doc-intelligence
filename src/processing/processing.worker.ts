import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ProcessingService } from './processing.service.js';
import { WORKER_ENABLED, WORKER_POLL_INTERVAL_MS } from './processing.constants.js';

/**
 * Loop de polling do worker, rodando no mesmo processo NestJS mas separado
 * por código/responsabilidade da API (docs/architecture.md §4/§10). Não
 * bloqueia o bootstrap (inicia via OnApplicationBootstrap), trata erro por
 * iteração para uma falha não matar o loop, e pode ser desabilitado
 * (PROCESSING_WORKER_ENABLED=false) para evitar flakiness em testes —
 * nesse caso os testes chamam ProcessingService.processOnce() diretamente.
 */
@Injectable()
export class ProcessingWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingWorker.name);
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly processingService: ProcessingService) {}

  onApplicationBootstrap(): void {
    if (!WORKER_ENABLED) {
      this.logger.log('worker disabled (PROCESSING_WORKER_ENABLED=false)');
      return;
    }
    this.logger.log(`worker started workerId=${this.workerId} pollIntervalMs=${WORKER_POLL_INTERVAL_MS}`);
    this.scheduleNextTick(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const result = await this.processingService.processOnce(this.workerId);
      this.scheduleNextTick(result === 'IDLE' ? WORKER_POLL_INTERVAL_MS : 0);
    } catch (error) {
      this.logger.error('unexpected error in worker iteration', error as Error);
      this.scheduleNextTick(WORKER_POLL_INTERVAL_MS);
    }
  }
}

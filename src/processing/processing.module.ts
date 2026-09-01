import { Module } from '@nestjs/common';
import { FinalizationService } from './finalization.service.js';
import { JobClaimService } from './job-claim.service.js';
import { ProcessingService } from './processing.service.js';
import { ProcessingWorker } from './processing.worker.js';
import { DocumentAiProvider } from './provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from './provider/fake-document-ai-provider.js';

@Module({
  providers: [
    JobClaimService,
    FinalizationService,
    { provide: DocumentAiProvider, useClass: FakeDocumentAiProvider },
    ProcessingService,
    ProcessingWorker,
  ],
  exports: [JobClaimService, FinalizationService, ProcessingService],
})
export class ProcessingModule {}

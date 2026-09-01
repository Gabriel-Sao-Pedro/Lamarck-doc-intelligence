import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { FinalizationService } from '../src/processing/finalization.service.js';
import { JobClaimService } from '../src/processing/job-claim.service.js';
import { ProcessingService } from '../src/processing/processing.service.js';
import { DocumentAiProvider } from '../src/processing/provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from '../src/processing/provider/fake-document-ai-provider.js';
import { ProviderTechnicalError, type ProviderInput, type ProviderResult } from '../src/processing/provider/provider.types.js';
import { TEST_API_KEY } from './support/api-key.js';
import { buildValidPng } from './support/image-fixtures.js';
import { cleanupDocument, createReceivedDocument } from './support/processing-fixtures.js';

describe('Processing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jobClaimService: JobClaimService;
  let finalizationService: FinalizationService;
  let processingService: ProcessingService;
  let fakeProvider: FakeDocumentAiProvider;
  const trackedDocumentIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeDocumentAiProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DocumentAiProvider)
      .useValue(fakeProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jobClaimService = moduleFixture.get(JobClaimService);
    finalizationService = moduleFixture.get(FinalizationService);
    processingService = moduleFixture.get(ProcessingService);
  });

  afterEach(async () => {
    fakeProvider.setMode('SUCCESS');
    for (const documentId of trackedDocumentIds.splice(0)) {
      await cleanupDocument(prisma, documentId);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function newDocument(): Promise<{ documentId: string; jobId: string }> {
    const created = await createReceivedDocument(prisma);
    trackedDocumentIds.push(created.documentId);
    return created;
  }

  async function expireLease(jobId: string): Promise<void> {
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
  }

  // P1 — dois workers disputam o mesmo job e somente um adquire
  it('P1 — claim exclusivo entre dois workers concorrentes', async () => {
    const { documentId } = await newDocument();

    const [claimA, claimB] = await Promise.all([
      jobClaimService.claimNextEligibleJob('worker-a'),
      jobClaimService.claimNextEligibleJob('worker-b'),
    ]);

    const winnerId = claimA ? 'worker-a' : 'worker-b';
    expect([claimA, claimB].filter((c) => c !== null)).toHaveLength(1);

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { documentId } });
    expect(job.attemptCount).toBe(1);
    expect(job.claimedBy).toBe(winnerId);
  });

  // P2 — cada novo claim real usa um claimToken diferente
  it('P2 — claimToken novo a cada tentativa real', async () => {
    const { jobId } = await newDocument();

    const first = await jobClaimService.claimNextEligibleJob('worker-a');
    expect(first).not.toBeNull();

    // finaliza a primeira tentativa como falha técnica (sem passar por
    // processOnce, que faria seu próprio claim e colidiria com o claim
    // manual acima) para liberar o job para uma nova tentativa real.
    await finalizationService.finalize({
      jobId,
      processingRunId: first!.processingRunId,
      claimToken: first!.claimToken,
      outcome: { kind: 'TECHNICAL_FAILURE', errorType: 'SIMULATED' },
    });

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.claimedBy).toBeNull(); // liberado para retry

    const second = await jobClaimService.claimNextEligibleJob('worker-b');
    expect(second).not.toBeNull();
    expect(second!.attemptNumber).toBe(2);
    expect(second!.claimToken).not.toBe(first!.claimToken);
  });

  // P3 — worker antigo com token A não finaliza depois que token B passou a ser atual
  it('P3 — fencing rejeita finalização com claimToken desatualizado', async () => {
    const { jobId } = await newDocument();

    const claimA = await jobClaimService.claimNextEligibleJob('worker-a');
    expect(claimA).not.toBeNull();

    await expireLease(jobId);
    await jobClaimService.claimNextEligibleJob('worker-recovery'); // fase 1: PROCESSING -> RETRYING (persistido)
    const claimB = await jobClaimService.claimNextEligibleJob('worker-b'); // fase 2: RETRYING -> PROCESSING (nova tentativa)
    expect(claimB).not.toBeNull();
    expect(claimB!.claimToken).not.toBe(claimA!.claimToken);

    const staleResult = await finalizationService.finalize({
      jobId,
      processingRunId: claimA!.processingRunId,
      claimToken: claimA!.claimToken,
      outcome: { kind: 'SUCCESS', result: successResult() },
    });

    expect(staleResult).toBe('STALE');
  });

  // P4 — a chamada ao provider ocorre fora da transação/lock de claim
  it('P4 — provider é chamado depois que a transação de claim já foi commitada', async () => {
    await newDocument();

    let observedClaimedByDuringProviderCall: string | null | undefined;
    class ClaimVisibilitySpyProvider implements DocumentAiProvider {
      async process(input: ProviderInput): Promise<ProviderResult> {
        // Se a transação de claim ainda estivesse aberta, esta leitura
        // (fora dela) não veria o claimedBy gravado — provaria que o
        // provider rodou dentro do lock.
        const job = await prisma.processingJob.findFirst({ where: { documentId: input.documentId } });
        observedClaimedByDuringProviderCall = job?.claimedBy;
        return successResult();
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DocumentAiProvider)
      .useValue(new ClaimVisibilitySpyProvider())
      .compile();
    const spyApp = moduleFixture.createNestApplication();
    await spyApp.init();
    const spyProcessingService = moduleFixture.get(ProcessingService);

    const result = await spyProcessingService.processOnce('worker-spy');
    await spyApp.close();

    expect(result).toBe('PROCESSED');
    expect(observedClaimedByDuringProviderCall).toBe('worker-spy');
  });

  // P5 — job processado com fake provider de sucesso termina em COMPLETED
  it('P5 — sucesso termina em COMPLETED', async () => {
    const { documentId } = await newDocument();
    fakeProvider.setMode('SUCCESS');

    const result = await processingService.processOnce('worker-a');
    expect(result).toBe('PROCESSED');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('COMPLETED');
  });

  // P6 — DocumentResult é criado e ligado ao run correto
  it('P6 — DocumentResult criado e ligado ao ProcessingRun correto', async () => {
    const { documentId } = await newDocument();
    fakeProvider.setMode('SUCCESS');
    await processingService.processOnce('worker-a');

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    const result = await prisma.documentResult.findUniqueOrThrow({ where: { processingRunId: run.id } });

    expect(result.documentId).toBe(documentId);
    expect(result.documentType).toBe('IDENTITY_DOCUMENT');
    expect((result.data as Record<string, unknown>).fields).toBeDefined();
  });

  // P7 — ProcessingRun registra attemptNumber/proveniência sem virar fonte operacional
  it('P7 — ProcessingRun preserva histórico e proveniência da tentativa', async () => {
    const { documentId, jobId } = await newDocument();
    fakeProvider.setMode('SUCCESS');
    await processingService.processOnce('worker-a');

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    expect(run.attemptNumber).toBe(1);
    expect(run.status).toBe('SUCCEEDED');
    expect(run.provider).toBeTruthy();
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.finishedAt).toBeInstanceOf(Date);

    // o job não usa o run para decidir limite — attemptCount é a fonte operacional
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attemptCount).toBe(1);
  });

  // P8 — resultado semanticamente inválido/baixa confiança termina em NEEDS_REVIEW sem retry técnico
  it('P8 — baixa confiança termina em NEEDS_REVIEW sem consumir retry técnico', async () => {
    const { documentId, jobId } = await newDocument();
    fakeProvider.setMode('NEEDS_REVIEW');
    const result = await processingService.processOnce('worker-a');
    expect(result).toBe('PROCESSED');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('NEEDS_REVIEW');

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attemptCount).toBe(1); // não incrementou de novo

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    expect(run.status).toBe('SEMANTIC_MISMATCH');

    const documentResult = await prisma.documentResult.findUnique({ where: { processingRunId: run.id } });
    expect(documentResult).not.toBeNull(); // resultado original preservado para revisão
  });

  // P9 — erro do provider leva a RETRYING quando ainda há tentativas
  it('P9 — falha técnica com tentativas restantes vai para RETRYING', async () => {
    const { documentId, jobId } = await newDocument();
    fakeProvider.setMode('TECHNICAL_FAILURE');
    const result = await processingService.processOnce('worker-a');
    expect(result).toBe('PROCESSED');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('RETRYING');

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attemptCount).toBe(1);
    expect(job.claimedBy).toBeNull();

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    expect(run.status).toBe('TECHNICAL_FAILURE');
  });

  // P10 — após 3 tentativas totais: RETRYING persistido antes de FAILED, sem quarta chamada ao provider
  it('P10 — esgota o limite de 3 tentativas: RETRYING persistido, depois FAILED, sem quarta chamada ao provider', async () => {
    const { documentId, jobId } = await newDocument();

    let providerCallCount = 0;
    class CountingTechnicalFailureProvider implements DocumentAiProvider {
      async process(): Promise<ProviderResult> {
        providerCallCount++;
        throw new ProviderTechnicalError('falha simulada', 'SIMULATED');
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DocumentAiProvider)
      .useValue(new CountingTechnicalFailureProvider())
      .compile();
    const countingApp = moduleFixture.createNestApplication();
    await countingApp.init();
    const countingProcessingService = moduleFixture.get(ProcessingService);
    const countingJobClaimService = moduleFixture.get(JobClaimService);

    await countingProcessingService.processOnce('worker-a'); // tentativa 1 -> RETRYING
    await countingProcessingService.processOnce('worker-a'); // tentativa 2 -> RETRYING
    await countingProcessingService.processOnce('worker-a'); // tentativa 3 -> RETRYING

    expect(providerCallCount).toBe(3);

    // depois da 3ª falha, RETRYING precisa estar persistido de verdade — ainda não é FAILED
    const afterThirdFailure = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(afterThirdFailure.status).toBe('RETRYING');
    const jobAfterThirdFailure = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(jobAfterThirdFailure.attemptCount).toBe(3);

    // resolução, numa transação separada e sem chamar o provider: RETRYING -> FAILED
    const fourthAttempt = await countingJobClaimService.claimNextEligibleJob('worker-b');
    expect(fourthAttempt).toBeNull();
    expect(providerCallCount).toBe(3); // nenhuma quarta chamada ao provider

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('FAILED');

    const runs = await prisma.processingRun.findMany({ where: { documentId } });
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.status === 'TECHNICAL_FAILURE')).toBe(true);

    await countingApp.close();
  });

  // P11 — lease expirado conta a tentativa anterior como falha técnica; RETRYING persistido antes da nova tentativa
  it('P11 — lease expirado: RETRYING persistido antes da nova tentativa', async () => {
    const { jobId, documentId } = await newDocument();
    const firstClaim = await jobClaimService.claimNextEligibleJob('worker-a');
    expect(firstClaim!.attemptNumber).toBe(1);

    await expireLease(jobId);

    // fase 1: a recuperação transiciona PROCESSING -> RETRYING e para (não reivindica ainda)
    const recoveryPhase1 = await jobClaimService.claimNextEligibleJob('worker-b');
    expect(recoveryPhase1).toBeNull();

    const afterPhase1 = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(afterPhase1.status).toBe('RETRYING'); // estado real e observável entre as duas fases

    const staleRun = await prisma.processingRun.findFirstOrThrow({ where: { documentId, attemptNumber: 1 } });
    expect(staleRun.status).toBe('TECHNICAL_FAILURE');
    expect(staleRun.technicalErrorType).toBe('LEASE_EXPIRED');

    // fase 2: próxima chamada, transação separada, reivindica a nova tentativa
    const recoveryPhase2 = await jobClaimService.claimNextEligibleJob('worker-b');
    expect(recoveryPhase2).not.toBeNull();
    expect(recoveryPhase2!.attemptNumber).toBe(2);
    expect(recoveryPhase2!.claimToken).not.toBe(firstClaim!.claimToken);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('PROCESSING');

    const newRun = await prisma.processingRun.findFirstOrThrow({ where: { documentId, attemptNumber: 2 } });
    expect(newRun.status).toBe('STARTED');
  });

  // P12 — lease expirado na última tentativa: RETRYING persistido, depois FAILED sem nova chamada ao provider
  it('P12 — lease expirado esgotado: RETRYING persistido, depois FAILED sem nova tentativa', async () => {
    const { jobId, documentId } = await newDocument();

    fakeProvider.setMode('TECHNICAL_FAILURE');
    await processingService.processOnce('worker-a'); // attempt 1 -> RETRYING
    await processingService.processOnce('worker-a'); // attempt 2 -> RETRYING

    const thirdClaim = await jobClaimService.claimNextEligibleJob('worker-a');
    expect(thirdClaim!.attemptNumber).toBe(3);

    await expireLease(jobId);

    // fase 1: recuperação persiste PROCESSING -> RETRYING (attemptCount continua 3)
    const recoveryPhase1 = await jobClaimService.claimNextEligibleJob('worker-b');
    expect(recoveryPhase1).toBeNull();

    const afterPhase1 = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(afterPhase1.status).toBe('RETRYING');

    // fase 2: esgotado — resolve para FAILED sem chamar o provider
    const recoveryPhase2 = await jobClaimService.claimNextEligibleJob('worker-c');
    expect(recoveryPhase2).toBeNull();

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('FAILED');

    const staleRun = await prisma.processingRun.findFirstOrThrow({ where: { documentId, attemptNumber: 3 } });
    expect(staleRun.status).toBe('TECHNICAL_FAILURE');
    expect(staleRun.technicalErrorType).toBe('LEASE_EXPIRED');
  });

  // P13 — provider que termina depois de perder lease não grava resultado/status
  it('P13 — resultado stale não sobrescreve o estado já recuperado por outro worker', async () => {
    const { jobId, documentId } = await newDocument();
    const claimA = await jobClaimService.claimNextEligibleJob('worker-a');

    await expireLease(jobId);
    await jobClaimService.claimNextEligibleJob('worker-recovery'); // fase 1: PROCESSING -> RETRYING
    const claimB = await jobClaimService.claimNextEligibleJob('worker-b'); // fase 2: nova tentativa
    expect(claimB).not.toBeNull();

    const staleFinalize = await finalizationService.finalize({
      jobId,
      processingRunId: claimA!.processingRunId,
      claimToken: claimA!.claimToken,
      outcome: { kind: 'SUCCESS', result: successResult() },
    });
    expect(staleFinalize).toBe('STALE');

    // nenhum DocumentResult foi criado pela finalização stale
    const results = await prisma.documentResult.findMany({ where: { documentId } });
    expect(results).toHaveLength(0);

    // o run antigo continua marcado como falha técnica por lease, não SUCCEEDED
    const oldRun = await prisma.processingRun.findUniqueOrThrow({ where: { id: claimA!.processingRunId } });
    expect(oldRun.status).toBe('TECHNICAL_FAILURE');

    // o documento continua no estado que o worker B controla (ainda em PROCESSING, não COMPLETED)
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('PROCESSING');
  });

  // P14 — dois workers tentando recuperar o mesmo lease expirado não criam duas novas tentativas
  it('P14 — corrida de recuperação de lease não duplica a nova tentativa', async () => {
    const { jobId, documentId } = await newDocument();
    await jobClaimService.claimNextEligibleJob('worker-a');
    await expireLease(jobId);

    // fase 1 sequencial: transiciona para RETRYING (a corrida testada aqui é na fase 2, a nova tentativa)
    await jobClaimService.claimNextEligibleJob('worker-recovery');

    const [recoveryA, recoveryB] = await Promise.all([
      jobClaimService.claimNextEligibleJob('worker-b'),
      jobClaimService.claimNextEligibleJob('worker-c'),
    ]);

    const successfulRecoveries = [recoveryA, recoveryB].filter((c) => c !== null);
    expect(successfulRecoveries).toHaveLength(1);

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attemptCount).toBe(2); // só uma nova tentativa, não duas

    const attempt2Runs = await prisma.processingRun.findMany({ where: { documentId, attemptNumber: 2 } });
    expect(attempt2Runs).toHaveLength(1);
  });

  // PROC-002 — a finalização não deve confiar em processingRunId sem validá-lo contra o job/tentativa claimados
  it('PROC-002 — finalização rejeita processingRunId de outro job/tentativa', async () => {
    const docA = await newDocument();
    const docB = await newDocument();

    const claimA = await jobClaimService.claimNextEligibleJob('worker-a');
    const claimB = await jobClaimService.claimNextEligibleJob('worker-b');
    expect(claimA).not.toBeNull();
    expect(claimB).not.toBeNull();

    // job/token de A válidos, mas processingRunId pertence ao job B
    const result = await finalizationService.finalize({
      jobId: claimA!.jobId,
      processingRunId: claimB!.processingRunId,
      claimToken: claimA!.claimToken,
      outcome: { kind: 'SUCCESS', result: successResult() },
    });

    expect(result).toBe('STALE');

    const documentA = await prisma.document.findUniqueOrThrow({ where: { id: docA.documentId } });
    expect(documentA.status).toBe('PROCESSING'); // não mudou indevidamente
    const documentB = await prisma.document.findUniqueOrThrow({ where: { id: docB.documentId } });
    expect(documentB.status).toBe('PROCESSING'); // não mudou

    const runB = await prisma.processingRun.findUniqueOrThrow({ where: { id: claimB!.processingRunId } });
    expect(runB.status).toBe('STARTED'); // run de B não foi tocado pela finalização inválida de A

    const results = await prisma.documentResult.findMany({
      where: { documentId: { in: [docA.documentId, docB.documentId] } },
    });
    expect(results).toHaveLength(0); // nenhum DocumentResult indevido

    // claim de A não foi limpo por uma finalização inválida
    const jobA = await prisma.processingJob.findUniqueOrThrow({ where: { id: claimA!.jobId } });
    expect(jobA.claimToken).toBe(claimA!.claimToken);
    expect(jobA.claimedBy).toBe('worker-a');
  });

  // P15 — documento ingerido pela API gera job, é processado pelo worker/fake e termina com DocumentResult persistido
  it('P15 — fluxo vertical completo da ingestão até o resultado persistido', async () => {
    fakeProvider.setMode('SUCCESS');
    const png = buildValidPng();

    const response = await request(app.getHttpServer())
      .post('/documents')
      .set('X-API-Key', TEST_API_KEY)
      .attach('file', png, { filename: 'p15.png', contentType: 'image/png' })
      .expect(202);

    const documentId: string = response.body.documentId;
    trackedDocumentIds.push(documentId);

    const result = await processingService.processOnce('worker-vertical');
    expect(result).toBe('PROCESSED');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe('COMPLETED');

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    const documentResult = await prisma.documentResult.findUniqueOrThrow({ where: { processingRunId: run.id } });
    expect(documentResult.documentId).toBe(documentId);
  });
});

function successResult(): ProviderResult {
  return {
    documentType: 'IDENTITY_DOCUMENT',
    confidence: 0.95,
    fields: {
      fullName: 'Fulano de Tal Fictício',
      parentage: 'Filho(a) de Fulano Fictício e Beltrana Fictícia',
      birthDate: '1990-01-01',
      documentNumber: 'FAKE-STALE-0001',
      issuingAuthority: 'ORGAO FICTICIO',
    },
  };
}

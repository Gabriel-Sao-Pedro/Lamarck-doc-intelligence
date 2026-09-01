import 'dotenv/config';
import { randomUUID } from 'node:crypto';
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
import type { ProviderResult } from '../src/processing/provider/provider.types.js';
import { TEST_API_KEY } from './support/api-key.js';
import { buildValidPng } from './support/image-fixtures.js';
import { cleanupDocument, createReceivedDocument } from './support/processing-fixtures.js';

describe('DocumentQuery (e2e)', () => {
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

  function successResult(): ProviderResult {
    return {
      documentType: 'IDENTITY_DOCUMENT',
      confidence: 0.95,
      fields: {
        fullName: 'Fulano de Tal Fictício',
        parentage: 'Filho(a) de Fulano Fictício e Beltrana Fictícia',
        birthDate: '1990-01-01',
        documentNumber: 'FAKE-QUERY-0001',
        issuingAuthority: 'ORGAO FICTICIO',
      },
    };
  }

  function needsReviewResult(): ProviderResult {
    return { ...successResult(), confidence: 0.4 };
  }

  async function claimAndFinalize(
    jobId: string,
    outcome: Parameters<FinalizationService['finalize']>[0]['outcome'],
  ): Promise<void> {
    const claimed = await jobClaimService.claimNextEligibleJob('worker-query-fixture');
    if (!claimed || claimed.jobId !== jobId) {
      throw new Error('não foi possível reivindicar o job esperado para preparar o fixture de teste');
    }
    await finalizationService.finalize({
      jobId,
      processingRunId: claimed.processingRunId,
      claimToken: claimed.claimToken,
      outcome,
    });
  }

  // Q1 — documento inexistente
  it('Q1 — GET /documents/:id com id inexistente retorna 404', async () => {
    const response = await request(app.getHttpServer())
      .get(`/documents/${randomUUID()}`)
      .set('X-API-Key', TEST_API_KEY);
    expect(response.status).toBe(404);
  });

  // Q2 — RECEIVED
  it('Q2 — RECEIVED retorna 200 com result null', async () => {
    const { documentId } = await newDocument();

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.documentId).toBe(documentId);
    expect(response.body.status).toBe('RECEIVED');
    expect(response.body.result).toBeNull();
  });

  // Q3 — PROCESSING
  it('Q3 — PROCESSING retorna 200 com result null', async () => {
    const { documentId, jobId } = await newDocument();
    const claimed = await jobClaimService.claimNextEligibleJob('worker-query-fixture');
    expect(claimed?.jobId).toBe(jobId);

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.status).toBe('PROCESSING');
    expect(response.body.result).toBeNull();
  });

  // Q4 — RETRYING
  it('Q4 — RETRYING retorna 200 com result null', async () => {
    const { documentId, jobId } = await newDocument();
    await claimAndFinalize(jobId, { kind: 'TECHNICAL_FAILURE', errorType: 'SIMULATED' });

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.status).toBe('RETRYING');
    expect(response.body.result).toBeNull();
  });

  // Q5 — COMPLETED
  it('Q5 — COMPLETED retorna 200 com resultado, tipo/campos/confiança corretos', async () => {
    const { documentId, jobId } = await newDocument();
    await claimAndFinalize(jobId, { kind: 'SUCCESS', result: successResult() });

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.result).not.toBeNull();
    expect(response.body.result.documentType).toBe('IDENTITY_DOCUMENT');
    expect(response.body.result.confidence).toBe(0.95);
    expect(response.body.result.fields.documentNumber).toBe('FAKE-QUERY-0001');
    expect(response.body.result.fields.fullName).toBe('Fulano de Tal Fictício');
  });

  // Q6 — NEEDS_REVIEW
  it('Q6 — NEEDS_REVIEW retorna 200 com o resultado original preservado', async () => {
    const { documentId, jobId } = await newDocument();
    await claimAndFinalize(jobId, { kind: 'NEEDS_REVIEW', result: needsReviewResult() });

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.status).toBe('NEEDS_REVIEW');
    expect(response.body.result).not.toBeNull();
    expect(response.body.result.confidence).toBe(0.4);
    expect(response.body.result.fields.documentNumber).toBe('FAKE-QUERY-0001');
  });

  // Q7 — FAILED
  it('Q7 — FAILED retorna 200 com result null e sem erro interno bruto', async () => {
    const { documentId, jobId } = await newDocument();

    // esgota as 3 tentativas com falha técnica
    await claimAndFinalize(jobId, { kind: 'TECHNICAL_FAILURE', errorType: 'SIMULATED_1' });
    await claimAndFinalize(jobId, { kind: 'TECHNICAL_FAILURE', errorType: 'SIMULATED_2' });
    await claimAndFinalize(jobId, { kind: 'TECHNICAL_FAILURE', errorType: 'SIMULATED_3' });
    // resolução RETRYING -> FAILED, numa chamada de claim separada (ver docs/implementation/005-document-processing-findings-fix.md)
    const exhausted = await jobClaimService.claimNextEligibleJob('worker-query-fixture');
    expect(exhausted).toBeNull();

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    expect(response.body.status).toBe('FAILED');
    expect(response.body.result).toBeNull();

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('SIMULATED');
    expect(raw.toLowerCase()).not.toContain('technicalerrortype');
  });

  // Q8 — não expõe infraestrutura
  it('Q8 — resposta não expõe storageKey, claimToken, lease ou estrutura interna do job', async () => {
    const { documentId, jobId } = await newDocument();
    await claimAndFinalize(jobId, { kind: 'SUCCESS', result: successResult() });

    const response = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);

    const raw = JSON.stringify(response.body);
    for (const forbidden of [
      'storageKey',
      'claimToken',
      'claimedBy',
      'claimedAt',
      'leaseExpiresAt',
      'attemptCount',
      'processingJob',
      'ProcessingJob',
      'sha256',
      'stack',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  // Q9 — vertical slice completa: POST -> processing -> COMPLETED -> GET
  it('Q9 — fluxo vertical completo: ingestão até resultado consultável', async () => {
    fakeProvider.setMode('SUCCESS');
    const png = buildValidPng();

    const ingestResponse = await request(app.getHttpServer())
      .post('/documents')
      .set('X-API-Key', TEST_API_KEY)
      .attach('file', png, { filename: 'q9.png', contentType: 'image/png' })
      .expect(202);

    const documentId: string = ingestResponse.body.documentId;
    trackedDocumentIds.push(documentId);
    expect(ingestResponse.body.status).toBe('RECEIVED');

    const beforeProcessing = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(beforeProcessing.body.status).toBe('RECEIVED');
    expect(beforeProcessing.body.result).toBeNull();

    const processed = await processingService.processOnce('worker-vertical-query');
    expect(processed).toBe('PROCESSED');

    const afterProcessing = await request(app.getHttpServer()).get(`/documents/${documentId}`).set('X-API-Key', TEST_API_KEY).expect(200);
    expect(afterProcessing.body.status).toBe('COMPLETED');
    expect(afterProcessing.body.result).not.toBeNull();
    expect(afterProcessing.body.result.documentType).toBe('IDENTITY_DOCUMENT');
    expect(afterProcessing.body.result.fields.fullName).toBeTruthy();
  });
});

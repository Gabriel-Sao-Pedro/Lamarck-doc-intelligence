import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { FinalizationService } from '../src/processing/finalization.service.js';
import { JobClaimService } from '../src/processing/job-claim.service.js';
import { DocumentAiProvider } from '../src/processing/provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from '../src/processing/provider/fake-document-ai-provider.js';
import type { ProviderResult } from '../src/processing/provider/provider.types.js';
import { TEST_API_KEY } from './support/api-key.js';
import { cleanupDocument, createDocumentWithStatus, createReceivedDocument } from './support/processing-fixtures.js';

const WRONG_API_KEY = 'wrong-api-key';

describe('ReviewQueue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jobClaimService: JobClaimService;
  let finalizationService: FinalizationService;
  const trackedDocumentIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DocumentAiProvider)
      .useValue(new FakeDocumentAiProvider())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jobClaimService = moduleFixture.get(JobClaimService);
    finalizationService = moduleFixture.get(FinalizationService);
  });

  afterEach(async () => {
    for (const documentId of trackedDocumentIds.splice(0)) {
      await cleanupDocument(prisma, documentId);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const needsReview = (createdAt?: Date) => track(createDocumentWithStatus(prisma, 'NEEDS_REVIEW', createdAt));
  const completed = (createdAt?: Date) => track(createDocumentWithStatus(prisma, 'COMPLETED', createdAt));
  const failed = (createdAt?: Date) => track(createDocumentWithStatus(prisma, 'FAILED', createdAt));

  async function track<T extends Promise<{ documentId: string }>>(created: T) {
    const document = await created;
    trackedDocumentIds.push(document.documentId);
    return document;
  }

  function fictitiousResult(): ProviderResult {
    return {
      documentType: 'IDENTITY_DOCUMENT',
      confidence: 0.4,
      fields: {
        fullName: 'Fulano de Tal Fictício',
        parentage: 'Filho(a) de Fulano Fictício e Beltrana Fictícia',
        birthDate: '1990-01-01',
        documentNumber: 'FAKE-REVIEW-0001',
        issuingAuthority: 'ORGAO FICTICIO',
      },
    };
  }

  /** Cria um NEEDS_REVIEW com DocumentResult real, via claim + finalização — não fabrica linha no banco. */
  async function needsReviewWithResult() {
    const { documentId, jobId } = await track(createReceivedDocument(prisma));
    const claimed = await jobClaimService.claimNextEligibleJob('worker-review-fixture');
    if (!claimed || claimed.jobId !== jobId) {
      throw new Error('não foi possível reivindicar o job esperado para o fixture');
    }
    await finalizationService.finalize({
      jobId,
      processingRunId: claimed.processingRunId,
      claimToken: claimed.claimToken,
      outcome: { kind: 'NEEDS_REVIEW', result: fictitiousResult() },
    });
    return documentId;
  }

  // RQ1 — fila vazia
  it('RQ1 — sem nenhum NEEDS_REVIEW retorna 200 com items []', async () => {
    const response = await request(app.getHttpServer())
      .get('/reviews')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  // RQ2 — NEEDS_REVIEW aparece
  it('RQ2 — documento NEEDS_REVIEW aparece na fila', async () => {
    const { documentId } = await needsReview();

    const response = await request(app.getHttpServer())
      .get('/reviews')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    const item = response.body.items.find((i: { documentId: string }) => i.documentId === documentId);
    expect(item).toBeDefined();
    expect(item.status).toBe('NEEDS_REVIEW');
  });

  // RQ3 — COMPLETED não aparece
  it('RQ3 — documento COMPLETED não aparece na fila', async () => {
    await needsReview();
    const { documentId: completedId } = await completed();

    const response = await request(app.getHttpServer())
      .get('/reviews')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    expect(response.body.items.some((i: { documentId: string }) => i.documentId === completedId)).toBe(false);
  });

  // RQ4 — FAILED não aparece
  it('RQ4 — documento FAILED não aparece na fila', async () => {
    await needsReview();
    const { documentId: failedId } = await failed();

    const response = await request(app.getHttpServer())
      .get('/reviews')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    expect(response.body.items.some((i: { documentId: string }) => i.documentId === failedId)).toBe(false);
  });

  // RQ5 — paginação
  it('RQ5 — pagina corretamente sem repetir itens entre páginas', async () => {
    const base = Date.now();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { documentId } = await needsReview(new Date(base + i * 1000));
      created.push(documentId);
    }

    const page1 = await request(app.getHttpServer()).get('/reviews?page=1&pageSize=2').set('X-API-Key', TEST_API_KEY).expect(200);
    const page2 = await request(app.getHttpServer()).get('/reviews?page=2&pageSize=2').set('X-API-Key', TEST_API_KEY).expect(200);
    const page3 = await request(app.getHttpServer()).get('/reviews?page=3&pageSize=2').set('X-API-Key', TEST_API_KEY).expect(200);

    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(page2.body.items).toHaveLength(2);
    expect(page3.body.items).toHaveLength(1);

    const seen = [...page1.body.items, ...page2.body.items, ...page3.body.items].map(
      (i: { documentId: string }) => i.documentId,
    );
    expect(new Set(seen).size).toBe(5);
    expect(seen.sort()).toEqual([...created].sort());
  });

  // RQ6 — ordenação FIFO (mais antigo primeiro), com desempate real por id ASC
  it('RQ6 — ordena por createdAt ASC, mais antigo primeiro, com desempate por id ASC', async () => {
    const sameInstant = new Date();
    const docA = await needsReview(sameInstant);
    const docB = await needsReview(sameInstant);
    const newer = await needsReview(new Date(sameInstant.getTime() + 5000));

    const response = await request(app.getHttpServer())
      .get('/reviews?pageSize=10')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    const ids: string[] = response.body.items.map((i: { documentId: string }) => i.documentId);

    // o mais recente por createdAt vem por último
    expect(ids.indexOf(newer.documentId)).toBe(ids.length - 1);

    // desempate real entre A e B (mesmo createdAt): ordem por id ASC
    const [expectedFirst, expectedSecond] = [docA.documentId, docB.documentId].sort();
    const indexA = ids.indexOf(docA.documentId);
    const indexB = ids.indexOf(docB.documentId);
    const [actualFirst, actualSecond] = indexA < indexB ? [docA.documentId, docB.documentId] : [docB.documentId, docA.documentId];
    expect([actualFirst, actualSecond]).toEqual([expectedFirst, expectedSecond]);
  });

  // RQ7 — sem API key
  it('RQ7 — GET /reviews sem X-API-Key retorna 401', async () => {
    await request(app.getHttpServer()).get('/reviews').expect(401);
  });

  // RQ8 — API key errada
  it('RQ8 — GET /reviews com chave errada retorna 401', async () => {
    await request(app.getHttpServer()).get('/reviews').set('X-API-Key', WRONG_API_KEY).expect(401);
  });

  // RQ9 — sem campos internos, com result preenchido de verdade
  it('RQ9 — resposta traz o result e não expõe campos internos', async () => {
    const documentId = await needsReviewWithResult();

    const response = await request(app.getHttpServer())
      .get('/reviews?pageSize=50')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    const item = response.body.items.find((i: { documentId: string }) => i.documentId === documentId);
    expect(item.result).not.toBeNull();
    expect(item.result.fields.documentNumber).toBe('FAKE-REVIEW-0001');
    expect(item.result.confidence).toBe(0.4);

    const raw = JSON.stringify(response.body);
    for (const forbidden of ['storageKey', 'sha256', 'claimToken', 'ProcessingJob', 'ProcessingRun']) {
      expect(raw).not.toContain(forbidden);
    }
  });
});

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
import { DocumentAiProvider } from '../src/processing/provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from '../src/processing/provider/fake-document-ai-provider.js';
import type { ProviderResult } from '../src/processing/provider/provider.types.js';
import { TEST_API_KEY } from './support/api-key.js';
import { cleanupDocument, createDocumentWithStatus, createReceivedDocument } from './support/processing-fixtures.js';

const WRONG_API_KEY = 'wrong-api-key';

describe('ReviewCorrection (e2e)', () => {
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

  async function track<T extends Promise<{ documentId: string }>>(created: T) {
    const document = await created;
    trackedDocumentIds.push(document.documentId);
    return document;
  }

  function aiNeedsReviewResult(): ProviderResult {
    return {
      documentType: 'IDENTITY_DOCUMENT',
      confidence: 0.4,
      fields: {
        fullName: 'Nome Original Ficticio',
        parentage: 'Filiacao Original Ficticia',
        birthDate: '1990-01-01',
        documentNumber: 'DOC-ORIGINAL-0001',
        issuingAuthority: 'ORGAO ORIGINAL',
      },
    };
  }

  async function needsReviewWithResult(): Promise<{ documentId: string }> {
    const { documentId, jobId } = await track(createReceivedDocument(prisma));
    const claimed = await jobClaimService.claimNextEligibleJob('worker-review-correction-fixture');
    if (!claimed || claimed.jobId !== jobId) {
      throw new Error('não foi possível reivindicar o job esperado para o fixture');
    }
    await finalizationService.finalize({
      jobId,
      processingRunId: claimed.processingRunId,
      claimToken: claimed.claimToken,
      outcome: { kind: 'NEEDS_REVIEW', result: aiNeedsReviewResult() },
    });
    return { documentId };
  }

  async function claim(documentId: string, reviewerId = 'reviewer-01') {
    return request(app.getHttpServer())
      .post(`/reviews/${documentId}/claim`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reviewerId })
      .expect(200);
  }

  function patchReview(documentId: string, body: unknown, apiKey = TEST_API_KEY) {
    return request(app.getHttpServer()).patch(`/reviews/${documentId}`).set('X-API-Key', apiKey).send(body);
  }

  it('HR1/HR7 — correção válida com claim ativo persiste e incrementa version', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId, 'reviewer-A');

    const response = await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: claimResponse.body.version,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(200);

    expect(response.body.documentId).toBe(documentId);
    expect(response.body.version).toBe(2);
    expect(response.body.reviewedBy).toBe('reviewer-A');
    expect(response.body.correctedFields).toEqual({ fullName: 'Nome Corrigido Ficticio' });
    expect(response.body.aiResult.fields.fullName).toBe('Nome Original Ficticio');
    expect(response.body.effectiveResult.fields.fullName).toBe('Nome Corrigido Ficticio');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.reviewVersion).toBe(2);

    const corrections = await prisma.reviewCorrection.findMany({ where: { documentId } });
    expect(corrections).toHaveLength(1);
    expect(corrections[0].version).toBe(2);
  });

  it('HR2 — documento inexistente retorna 404', async () => {
    await patchReview(randomUUID(), {
      claimToken: randomUUID(),
      version: 1,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(404);
  });

  it('HR3 — documento fora de NEEDS_REVIEW retorna 409', async () => {
    const { documentId } = await track(createDocumentWithStatus(prisma, 'COMPLETED'));

    await patchReview(documentId, {
      claimToken: randomUUID(),
      version: 1,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(409);
  });

  it('HR4 — documento sem claim retorna 409', async () => {
    const { documentId } = await needsReviewWithResult();

    await patchReview(documentId, {
      claimToken: randomUUID(),
      version: 1,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(409);
  });

  it('HR5 — claimToken incorreto retorna 409', async () => {
    const { documentId } = await needsReviewWithResult();
    await claim(documentId);

    await patchReview(documentId, {
      claimToken: randomUUID(),
      version: 1,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(409);
  });

  it('HR6 — claim expirado retorna 409', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId);

    await prisma.reviewClaim.update({
      where: { documentId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: claimResponse.body.version,
      corrections: { fullName: 'Nome Corrigido Ficticio' },
    }).expect(409);
  });

  it('HR8 — version antiga retorna 409 e não sobrescreve correção aceita', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId);

    await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: 1,
      corrections: { fullName: 'Primeira Correcao Ficticia' },
    }).expect(200);

    await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: 1,
      corrections: { fullName: 'Segunda Correcao Ficticia' },
    }).expect(409);

    const corrections = await prisma.reviewCorrection.findMany({ where: { documentId } });
    expect(corrections).toHaveLength(1);
    expect(corrections[0].correctedFields).toEqual({ fullName: 'Primeira Correcao Ficticia' });
  });

  it('HR9 — resultado original da IA continua preservado', async () => {
    const { documentId } = await needsReviewWithResult();
    const before = await prisma.documentResult.findFirstOrThrow({ where: { documentId } });
    const claimResponse = await claim(documentId);

    await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: claimResponse.body.version,
      corrections: { documentNumber: 'DOC-CORRIGIDO-0002' },
    }).expect(200);

    const after = await prisma.documentResult.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.data).toEqual(before.data);
  });

  it('HR10 — reviewedBy vem do claim, não do body', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId, 'reviewer-real');

    const response = await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: claimResponse.body.version,
      reviewerId: 'reviewer-falso',
      corrections: { issuingAuthority: 'ORGAO CORRIGIDO' },
    }).expect(200);

    expect(response.body.reviewedBy).toBe('reviewer-real');
    const correction = await prisma.reviewCorrection.findFirstOrThrow({ where: { documentId } });
    expect(correction.reviewedBy).toBe('reviewer-real');
  });

  it('HR11 — campo não permitido retorna 400', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId);

    await patchReview(documentId, {
      claimToken: claimResponse.body.claimToken,
      version: claimResponse.body.version,
      corrections: { standardizedFilename: 'nome.pdf' },
    }).expect(400);
  });

  it('HR12 — API key ausente/incorreta retorna 401', async () => {
    const { documentId } = await needsReviewWithResult();
    const body = { claimToken: randomUUID(), version: 1, corrections: { fullName: 'Nome Corrigido Ficticio' } };

    await request(app.getHttpServer()).patch(`/reviews/${documentId}`).send(body).expect(401);
    await patchReview(documentId, body, WRONG_API_KEY).expect(401);
  });

  it('HR13 — duas correções concorrentes com a mesma version: apenas uma vence', async () => {
    const { documentId } = await needsReviewWithResult();
    const claimResponse = await claim(documentId, 'reviewer-concurrent');

    const [responseA, responseB] = await Promise.all([
      patchReview(documentId, {
        claimToken: claimResponse.body.claimToken,
        version: claimResponse.body.version,
        corrections: { fullName: 'Vencedor A Ficticio' },
      }),
      patchReview(documentId, {
        claimToken: claimResponse.body.claimToken,
        version: claimResponse.body.version,
        corrections: { fullName: 'Vencedor B Ficticio' },
      }),
    ]);

    expect([responseA.status, responseB.status].sort()).toEqual([200, 409]);
    const winner = responseA.status === 200 ? responseA : responseB;

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.reviewVersion).toBe(2);

    const corrections = await prisma.reviewCorrection.findMany({ where: { documentId } });
    expect(corrections).toHaveLength(1);
    expect(corrections[0].version).toBe(2);
    expect(corrections[0].correctedFields).toEqual(winner.body.correctedFields);
  });
});

import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { DocumentAiProvider } from '../src/processing/provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from '../src/processing/provider/fake-document-ai-provider.js';
import { TEST_API_KEY } from './support/api-key.js';
import { cleanupDocument, createDocumentWithStatus } from './support/processing-fixtures.js';

const WRONG_API_KEY = 'wrong-api-key';
const NONEXISTENT_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('ReviewClaim (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
  });

  afterEach(async () => {
    for (const documentId of trackedDocumentIds.splice(0)) {
      await cleanupDocument(prisma, documentId);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const needsReview = () => track(createDocumentWithStatus(prisma, 'NEEDS_REVIEW'));
  const completed = () => track(createDocumentWithStatus(prisma, 'COMPLETED'));

  async function track<T extends Promise<{ documentId: string }>>(created: T) {
    const document = await created;
    trackedDocumentIds.push(document.documentId);
    return document;
  }

  function claimRequest(documentId: string, reviewerId: string) {
    return request(app.getHttpServer())
      .post(`/reviews/${documentId}/claim`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reviewerId });
  }

  // RC1 — NEEDS_REVIEW pode ser claimado
  it('RC1 — documento NEEDS_REVIEW pode ser reivindicado', async () => {
    const { documentId } = await needsReview();

    const response = await claimRequest(documentId, 'reviewer-01').expect(200);

    expect(response.body.documentId).toBe(documentId);
    expect(response.body.claimedBy).toBe('reviewer-01');
    expect(typeof response.body.claimToken).toBe('string');
    expect(response.body.claimToken.length).toBeGreaterThan(0);
    expect(new Date(response.body.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // RC2 — documento inexistente
  it('RC2 — documento inexistente retorna 404', async () => {
    await claimRequest(NONEXISTENT_DOCUMENT_ID, 'reviewer-01').expect(404);
  });

  it('RC2B — documentId malformado retorna 400', async () => {
    await claimRequest('not-a-uuid', 'reviewer-01').expect(400);
  });

  // RC3 — COMPLETED não pode ser claimado
  it('RC3 — documento COMPLETED não pode ser reivindicado', async () => {
    const { documentId } = await completed();

    await claimRequest(documentId, 'reviewer-01').expect(409);
  });

  // RC4 — claim ativo por outro reviewer
  it('RC4 — claim ativo por reviewer A bloqueia reviewer B', async () => {
    const { documentId } = await needsReview();

    await claimRequest(documentId, 'reviewer-A').expect(200);
    await claimRequest(documentId, 'reviewer-B').expect(409);
  });

  // RC5 — lease expirado libera novo claim
  it('RC5 — lease expirado permite novo claim por outro reviewer', async () => {
    const { documentId } = await needsReview();

    await claimRequest(documentId, 'reviewer-A').expect(200);

    // força o lease a já ter expirado, sem esperar 15 minutos reais
    await prisma.reviewClaim.update({
      where: { documentId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const response = await claimRequest(documentId, 'reviewer-B').expect(200);
    expect(response.body.claimedBy).toBe('reviewer-B');
  });

  // RC6 — novo claim gera novo claimToken
  it('RC6 — um novo claim (após lease expirado) gera um claimToken diferente', async () => {
    const { documentId } = await needsReview();

    const first = await claimRequest(documentId, 'reviewer-A').expect(200);

    await prisma.reviewClaim.update({
      where: { documentId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const second = await claimRequest(documentId, 'reviewer-B').expect(200);
    expect(second.body.claimToken).not.toBe(first.body.claimToken);
  });

  // RC7 — duas tentativas concorrentes: exatamente uma vence
  it('RC7 — duas requisições concorrentes: exatamente uma 200 e exatamente uma 409', async () => {
    const { documentId } = await needsReview();

    const [responseA, responseB] = await Promise.all([
      claimRequest(documentId, 'reviewer-A'),
      claimRequest(documentId, 'reviewer-B'),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = responseA.status === 200 ? responseA : responseB;
    const claimInDb = await prisma.reviewClaim.findUnique({ where: { documentId } });
    expect(claimInDb?.reviewerId).toBe(winner.body.claimedBy);
    expect(claimInDb?.claimToken).toBe(winner.body.claimToken);
  });

  // RC8 — sem API key
  it('RC8 — POST /reviews/:id/claim sem X-API-Key retorna 401', async () => {
    const { documentId } = await needsReview();

    await request(app.getHttpServer()).post(`/reviews/${documentId}/claim`).send({ reviewerId: 'reviewer-01' }).expect(401);
  });

  // RC9 — API key errada
  it('RC9 — POST /reviews/:id/claim com chave errada retorna 401', async () => {
    const { documentId } = await needsReview();

    await request(app.getHttpServer())
      .post(`/reviews/${documentId}/claim`)
      .set('X-API-Key', WRONG_API_KEY)
      .send({ reviewerId: 'reviewer-01' })
      .expect(401);
  });

  // RC-extra — reviewerId ausente/vazio -> 400 (não estava na lista mínima, mas é fronteira direta do parsing do body)
  it('RC-extra — reviewerId ausente ou vazio retorna 400', async () => {
    const { documentId } = await needsReview();

    await request(app.getHttpServer())
      .post(`/reviews/${documentId}/claim`)
      .set('X-API-Key', TEST_API_KEY)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post(`/reviews/${documentId}/claim`)
      .set('X-API-Key', TEST_API_KEY)
      .send({ reviewerId: '   ' })
      .expect(400);
  });
});

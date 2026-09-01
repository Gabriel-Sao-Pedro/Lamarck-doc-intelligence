import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { TEST_API_KEY } from './support/api-key.js';
import { buildValidPng } from './support/image-fixtures.js';
import { cleanupDocument, createDocumentWithStatus } from './support/processing-fixtures.js';

const WRONG_API_KEY = 'wrong-api-key';
const storageDir = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');

describe('ApiKeyAuth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const trackedDocumentIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  // KEY1 — POST sem chave
  it('KEY1 — POST /documents sem X-API-Key retorna 401', async () => {
    const png = buildValidPng();

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', png, { filename: 'key1.png', contentType: 'image/png' })
      .expect(401);
  });

  // KEY2 — POST chave errada
  it('KEY2 — POST /documents com chave errada retorna 401', async () => {
    const png = buildValidPng();

    await request(app.getHttpServer())
      .post('/documents')
      .set('X-API-Key', WRONG_API_KEY)
      .attach('file', png, { filename: 'key2.png', contentType: 'image/png' })
      .expect(401);
  });

  // KEY3 — POST chave correta
  it('KEY3 — POST /documents com chave correta preserva o comportamento anterior (202)', async () => {
    const png = buildValidPng();
    const sha256 = createHash('sha256').update(png).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .set('X-API-Key', TEST_API_KEY)
      .attach('file', png, { filename: 'key3.png', contentType: 'image/png' })
      .expect(202);

    trackedDocumentIds.push(response.body.documentId);

    expect(response.body.status).toBe('RECEIVED');
    expect(response.body.deduplicated).toBe(false);

    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    expect(document.id).toBe(response.body.documentId);
  });

  // KEY4 — falha de auth não persiste nada
  it('KEY4 — POST sem chave ou com chave errada não cria Document, ProcessingJob ou arquivo físico', async () => {
    const png = buildValidPng();
    const distinctPng = Buffer.concat([png, Buffer.from('key4')]);
    const sha256 = createHash('sha256').update(distinctPng).digest('hex');

    const entriesBefore = new Set(await readdir(storageDir).catch(() => []));

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPng, { filename: 'key4-a.png', contentType: 'image/png' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/documents')
      .set('X-API-Key', WRONG_API_KEY)
      .attach('file', distinctPng, { filename: 'key4-b.png', contentType: 'image/png' })
      .expect(401);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();

    const jobs = await prisma.processingJob.findMany({ where: { document: { sha256 } } });
    expect(jobs).toHaveLength(0);

    const entriesAfter = await readdir(storageDir).catch(() => []);
    expect(entriesAfter).toEqual(Array.from(entriesBefore));
  });

  // KEY5 — GET list sem chave
  it('KEY5 — GET /documents sem X-API-Key retorna 401', async () => {
    await request(app.getHttpServer()).get('/documents').expect(401);
  });

  // KEY6 — GET list chave errada
  it('KEY6 — GET /documents com chave errada retorna 401', async () => {
    await request(app.getHttpServer()).get('/documents').set('X-API-Key', WRONG_API_KEY).expect(401);
  });

  // KEY7 — GET list chave correta
  it('KEY7 — GET /documents com chave correta preserva paginação/filtro (200)', async () => {
    const created = await createDocumentWithStatus(prisma, 'COMPLETED');
    trackedDocumentIds.push(created.documentId);

    const response = await request(app.getHttpServer())
      .get('/documents?page=1&pageSize=20')
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    expect(response.body.pagination).toEqual(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    const item = response.body.items.find(
      (i: { documentId: string }) => i.documentId === created.documentId,
    );
    expect(item).toBeDefined();
  });

  // KEY8 — GET detail sem chave
  it('KEY8 — GET /documents/:id sem X-API-Key retorna 401', async () => {
    await request(app.getHttpServer()).get(`/documents/${randomUUID()}`).expect(401);
  });

  // KEY9 — GET detail chave errada
  it('KEY9 — GET /documents/:id com chave errada retorna 401', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${randomUUID()}`)
      .set('X-API-Key', WRONG_API_KEY)
      .expect(401);
  });

  // KEY10 — GET detail chave correta
  it('KEY10 — GET /documents/:id com chave correta preserva o comportamento anterior', async () => {
    const created = await createDocumentWithStatus(prisma, 'RECEIVED');
    trackedDocumentIds.push(created.documentId);

    const response = await request(app.getHttpServer())
      .get(`/documents/${created.documentId}`)
      .set('X-API-Key', TEST_API_KEY)
      .expect(200);

    expect(response.body.documentId).toBe(created.documentId);
    expect(response.body.status).toBe('RECEIVED');
    expect(response.body.result).toBeNull();

    await request(app.getHttpServer())
      .get(`/documents/${randomUUID()}`)
      .set('X-API-Key', TEST_API_KEY)
      .expect(404);
  });

  // KEY11 — ordem: autenticação acontece antes da validação do :id
  it('KEY11 — sem chave, UUID inválido retorna 401 (não 400); com chave correta continua 400', async () => {
    await request(app.getHttpServer()).get('/documents/not-a-uuid').expect(401);

    await request(app.getHttpServer())
      .get('/documents/not-a-uuid')
      .set('X-API-Key', TEST_API_KEY)
      .expect(400);
  });

  // KEY12 — regressão completa: não é um teste dedicado, coberta por npm run test:e2e
  // rodando todas as suítes (ingestão, processing, consulta, listagem, PDF, auth) juntas.
});

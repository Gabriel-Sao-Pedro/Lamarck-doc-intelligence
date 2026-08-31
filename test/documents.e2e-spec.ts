import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  buildFakeImageContent,
  buildOversizedJpeg,
  buildValidJpeg,
  buildValidPng,
} from './support/image-fixtures.js';

const storageDir = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');

describe('DocumentsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdShas: string[] = [];
  const createdStorageKeys: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    if (createdShas.length > 0) {
      await prisma.processingJob.deleteMany({
        where: { document: { sha256: { in: createdShas } } },
      });
      await prisma.document.deleteMany({ where: { sha256: { in: createdShas } } });
    }
    await Promise.all(createdStorageKeys.map((key) => rm(join(storageDir, key), { force: true })));
    await app.close();
  });

  async function trackDocument(sha256: string): Promise<void> {
    createdShas.push(sha256);
    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    createdStorageKeys.push(document.storageKey);
  }

  // T1 (Document + ProcessingJob criados) e T2 (status HTTP 202)
  it('T1/T2 — upload de PNG valido cria Document + ProcessingJob e retorna 202', async () => {
    const png = buildValidPng();
    const sha256 = createHash('sha256').update(png).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', png, { filename: 't1.png', contentType: 'image/png' })
      .expect(202);

    await trackDocument(sha256);

    expect(response.body.deduplicated).toBe(false);
    expect(response.body.status).toBe('RECEIVED');
    expect(response.body.documentId).toEqual(expect.any(String));

    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    expect(document.id).toBe(response.body.documentId);

    const job = await prisma.processingJob.findUnique({ where: { documentId: document.id } });
    expect(job).not.toBeNull();
  });

  // T3 — hash persistido corresponde exatamente aos bytes enviados
  it('T3 — sha256 persistido corresponde aos bytes enviados', async () => {
    const jpeg = buildValidJpeg();
    const sha256 = createHash('sha256').update(jpeg).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', jpeg, { filename: 't3.jpg', contentType: 'image/jpeg' })
      .expect(202);

    await trackDocument(sha256);

    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    expect(document.sha256).toBe(sha256);
  });

  // T4 (mesmo documentId) e T5 (nenhum ProcessingJob novo)
  it('T4/T5 — segundo upload com os mesmos bytes deduplica e nao cria segundo job', async () => {
    const png = buildValidPng();
    // bytes distintos dos demais casos para nao colidir com outros testes do sha256
    const distinctPng = Buffer.concat([png, Buffer.from('t4t5')]);
    const sha256 = createHash('sha256').update(distinctPng).digest('hex');

    const first = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPng, { filename: 't4-a.png', contentType: 'image/png' })
      .expect(202);

    await trackDocument(sha256);

    const second = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPng, { filename: 't4-b.png', contentType: 'image/png' })
      .expect(202);

    expect(second.body.documentId).toBe(first.body.documentId);
    expect(second.body.deduplicated).toBe(true);

    const jobs = await prisma.processingJob.findMany({
      where: { documentId: first.body.documentId },
    });
    expect(jobs).toHaveLength(1);
  });

  // T6 — arquivo maior que 10 MB rejeitado antes de persistencia
  it('T6 — arquivo maior que 10 MB e rejeitado com 413 e nao persiste nada', async () => {
    const oversized = buildOversizedJpeg();
    const sha256 = createHash('sha256').update(oversized).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', oversized, { filename: 't6.jpg', contentType: 'image/jpeg' })
      .expect(413);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();
  });

  // T7 — extensao/MIME aceitos mas conteudo real incompatival e rejeitado
  it('T7 — conteudo que nao e JPEG/PNG real e rejeitado mesmo com MIME de imagem', async () => {
    const fake = buildFakeImageContent();
    const sha256 = createHash('sha256').update(fake).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', fake, { filename: 't7.jpg', contentType: 'image/jpeg' })
      .expect(400);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();
  });

  // T9 — duas tentativas concorrentes com o mesmo hash resultam em um unico documento/job
  it('T9 — uploads concorrentes com os mesmos bytes resolvem para um unico documento', async () => {
    const png = buildValidPng();
    const distinctPng = Buffer.concat([png, Buffer.from('t9-concurrent')]);
    const sha256 = createHash('sha256').update(distinctPng).digest('hex');

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/documents')
        .attach('file', distinctPng, { filename: 't9-a.png', contentType: 'image/png' }),
      request(app.getHttpServer())
        .post('/documents')
        .attach('file', distinctPng, { filename: 't9-b.png', contentType: 'image/png' }),
    ]);

    await trackDocument(sha256);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.documentId).toBe(second.body.documentId);
    // exatamente uma das duas respostas venceu a corrida (deduplicated=false)
    const deduplicatedFlags = [first.body.deduplicated, second.body.deduplicated].sort();
    expect(deduplicatedFlags).toEqual([false, true]);

    const documents = await prisma.document.findMany({ where: { sha256 } });
    expect(documents).toHaveLength(1);

    const jobs = await prisma.processingJob.findMany({ where: { documentId: documents[0].id } });
    expect(jobs).toHaveLength(1);
  });

  // T10 — banco persiste storageKey (referencia), nao o binario do arquivo
  it('T10 — documento persiste storageKey e o binario fica somente no storage', async () => {
    const jpeg = buildValidJpeg();
    const distinctJpeg = Buffer.concat([jpeg, Buffer.from('t10')]);
    const sha256 = createHash('sha256').update(distinctJpeg).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctJpeg, { filename: 't10.jpg', contentType: 'image/jpeg' })
      .expect(202);

    await trackDocument(sha256);

    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    expect(typeof document.storageKey).toBe('string');
    expect(document.storageKey.length).toBeGreaterThan(0);

    const fileOnDisk = await readFile(join(storageDir, document.storageKey));
    expect(fileOnDisk.equals(distinctJpeg)).toBe(true);
  });
});

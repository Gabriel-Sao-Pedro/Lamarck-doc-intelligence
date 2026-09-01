import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ProcessingService } from '../src/processing/processing.service.js';
import { DocumentAiProvider } from '../src/processing/provider/document-ai-provider.js';
import { FakeDocumentAiProvider } from '../src/processing/provider/fake-document-ai-provider.js';
import { buildValidJpeg, buildValidPng } from './support/image-fixtures.js';
import { buildFakeContent, buildOversizedPdf, buildValidPdf } from './support/pdf-fixtures.js';
import { cleanupDocument } from './support/processing-fixtures.js';

const storageDir = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');

describe('PdfSupport (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let processingService: ProcessingService;
  let fakeProvider: FakeDocumentAiProvider;
  // Rastreado e limpo a cada teste (não só no afterAll): os testes de
  // processamento (PDF9/PDF10/PDF12) chamam processOnce(), que reivindica o
  // job elegível mais antigo do PostgreSQL real (docs/architecture.md §10) —
  // se um job criado por um teste de ingestão anterior (PDF1/4/6/7/8) ainda
  // estivesse na fila, ele seria reivindicado no lugar do job do próprio
  // teste. Mesma técnica de afterEach de test/processing.e2e-spec.ts.
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
    processingService = moduleFixture.get(ProcessingService);
  });

  afterEach(async () => {
    fakeProvider.setMode('SUCCESS');
    for (const documentId of trackedDocumentIds.splice(0)) {
      const document = await prisma.document.findUnique({ where: { id: documentId } });
      await cleanupDocument(prisma, documentId);
      if (document) {
        await rm(join(storageDir, document.storageKey), { force: true });
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /** Localiza o Document pelo sha256 (só existe depois de um POST bem-sucedido) e agenda a limpeza. */
  async function trackDocument(sha256: string): Promise<void> {
    const document = await prisma.document.findUniqueOrThrow({ where: { sha256 } });
    trackedDocumentIds.push(document.id);
  }

  // PDF1 — PDF válido
  it('PDF1 — PDF válido é aceito e retorna 202', async () => {
    const pdf = buildValidPdf();
    const sha256 = createHash('sha256').update(pdf).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', pdf, { filename: 'pdf1.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    expect(response.body.deduplicated).toBe(false);
    expect(response.body.status).toBe('RECEIVED');
  });

  // PDF2 — magic bytes inválidos, extensão .pdf
  it('PDF2 — extensão .pdf com bytes inválidos retorna 400', async () => {
    const fake = buildFakeContent();
    const sha256 = createHash('sha256').update(fake).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', fake, { filename: 'pdf2.pdf', contentType: 'application/pdf' })
      .expect(400);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();
  });

  // PDF3 — cliente declara application/pdf, mas o conteúdo não é PDF
  it('PDF3 — Content-Type application/pdf declarado com conteúdo que não é PDF retorna 400', async () => {
    const fake = buildFakeContent();
    // bytes distintos do PDF2 para não colidir no sha256 (unique)
    const distinctFake = Buffer.concat([fake, Buffer.from('pdf3')]);
    const sha256 = createHash('sha256').update(distinctFake).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctFake, { filename: 'documento-fake.txt', contentType: 'application/pdf' })
      .expect(400);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();
  });

  // PDF4 — nome/extensão enganosa. A ingestão nunca validou coerência entre
  // extensão/Content-Type declarado e o conteúdo real (só magic bytes, ver
  // src/documents/file-signature.ts) — a mesma regra vale para PDF: o
  // conteúdo detectado manda, o nome enviado é só metadata informativa.
  it('PDF4 — PDF válido com nome/Content-Type de imagem é aceito pelo tipo real detectado', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf4')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf4-enganoso.png', contentType: 'image/png' })
      .expect(202);

    await trackDocument(sha256);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: response.body.documentId } });
    expect(document.mimeType).toBe('application/pdf');
    expect(document.storageKey.endsWith('.pdf')).toBe(true);
  });

  // PDF5 — limite
  it('PDF5 — PDF maior que 10 MB é rejeitado com 413 e não persiste nada', async () => {
    const oversized = buildOversizedPdf();
    const sha256 = createHash('sha256').update(oversized).digest('hex');

    await request(app.getHttpServer())
      .post('/documents')
      .attach('file', oversized, { filename: 'pdf5.pdf', contentType: 'application/pdf' })
      .expect(413);

    const document = await prisma.document.findUnique({ where: { sha256 } });
    expect(document).toBeNull();
  });

  // PDF6 — deduplicação
  it('PDF6 — mesmo PDF duas vezes deduplica para o mesmo documentId', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf6')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const first = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf6-a.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    const second = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf6-b.pdf', contentType: 'application/pdf' })
      .expect(202);

    expect(second.body.documentId).toBe(first.body.documentId);
    expect(second.body.deduplicated).toBe(true);
    expect(second.body.status).toBe(first.body.status);

    const jobs = await prisma.processingJob.findMany({ where: { documentId: first.body.documentId } });
    expect(jobs).toHaveLength(1);
  });

  // PDF7 — race de deduplicação
  it('PDF7 — uploads concorrentes do mesmo PDF resolvem para 1 Document/1 ProcessingJob e preservam só o arquivo vencedor', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf7-concurrent')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    // mesma técnica de test/documents.e2e-spec.ts (T9): isola por diferença
    // de diretório exatamente o que sobrou depois da corrida + compensação.
    const entriesBeforeRace = new Set(await readdir(storageDir).catch(() => []));

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/documents')
        .attach('file', distinctPdf, { filename: 'pdf7-a.pdf', contentType: 'application/pdf' }),
      request(app.getHttpServer())
        .post('/documents')
        .attach('file', distinctPdf, { filename: 'pdf7-b.pdf', contentType: 'application/pdf' }),
    ]);

    await trackDocument(sha256);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.documentId).toBe(second.body.documentId);
    const deduplicatedFlags = [first.body.deduplicated, second.body.deduplicated].sort();
    expect(deduplicatedFlags).toEqual([false, true]);

    const documents = await prisma.document.findMany({ where: { sha256 } });
    expect(documents).toHaveLength(1);
    const winner = documents[0];

    const jobs = await prisma.processingJob.findMany({ where: { documentId: winner.id } });
    expect(jobs).toHaveLength(1);

    const entriesAfterRace = await readdir(storageDir);
    const newEntries = entriesAfterRace.filter((entry) => !entriesBeforeRace.has(entry));
    expect(newEntries).toEqual([winner.storageKey]);

    const winnerBytesOnDisk = await readFile(join(storageDir, winner.storageKey));
    expect(winnerBytesOnDisk.equals(distinctPdf)).toBe(true);
  });

  // PDF8 — metadata
  it('PDF8 — Document persiste mimeType application/pdf sem alterar documentType de negócio', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf8')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf8.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: response.body.documentId } });
    expect(document.mimeType).toBe('application/pdf');
    // documentType é o tipo de negócio (specification.md §5) — não muda por causa do formato do arquivo.
    expect(document.documentType).toBe('IDENTITY_DOCUMENT');
  });

  // PDF9 — processamento de um documento PDF
  it('PDF9 — PDF ingerido é processado pelo worker/fake provider e termina em COMPLETED', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf9')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf9.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    fakeProvider.setMode('SUCCESS');
    const result = await processingService.processOnce('worker-pdf9');
    expect(result).toBe('PROCESSED');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: response.body.documentId } });
    expect(document.status).toBe('COMPLETED');

    const documentResult = await prisma.documentResult.findFirstOrThrow({ where: { documentId: document.id } });
    expect(documentResult.documentId).toBe(document.id);
  });

  // PDF10 — consulta individual
  it('PDF10 — GET /documents/:id retorna status/result coerentes para um documento PDF', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf10')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const ingest = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf10.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    fakeProvider.setMode('SUCCESS');
    await processingService.processOnce('worker-pdf10');

    const response = await request(app.getHttpServer()).get(`/documents/${ingest.body.documentId}`).expect(200);

    expect(response.body.documentId).toBe(ingest.body.documentId);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.result).not.toBeNull();
    expect(response.body.result.fields).toBeDefined();
  });

  // PDF11 — listagem
  it('PDF11 — documento PDF aparece em GET /documents sem vazar storage/PII', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf11')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const ingest = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf11.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    const response = await request(app.getHttpServer()).get('/documents?pageSize=100').expect(200);

    const item = response.body.items.find((i: { documentId: string }) => i.documentId === ingest.body.documentId);
    expect(item).toBeDefined();
    expect(item.status).toBe('RECEIVED');
    expect(item.documentType).toBe('IDENTITY_DOCUMENT');

    const raw = JSON.stringify(response.body);
    for (const forbidden of ['storageKey', 'mimeType', 'sha256', 'fullName', 'documentNumber']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  // PDF12 — vertical slice completa
  it('PDF12 — vertical slice PDF completa: ingestão -> processing -> resultado -> consulta', async () => {
    const pdf = buildValidPdf();
    const distinctPdf = Buffer.concat([pdf, Buffer.from('pdf12')]);
    const sha256 = createHash('sha256').update(distinctPdf).digest('hex');

    const ingest = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPdf, { filename: 'pdf12.pdf', contentType: 'application/pdf' })
      .expect(202);

    await trackDocument(sha256);

    const documentId: string = ingest.body.documentId;

    const receivedDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(receivedDocument.mimeType).toBe('application/pdf');

    fakeProvider.setMode('SUCCESS');
    const processResult = await processingService.processOnce('worker-pdf12');
    expect(processResult).toBe('PROCESSED');

    const run = await prisma.processingRun.findFirstOrThrow({ where: { documentId } });
    const documentResult = await prisma.documentResult.findUniqueOrThrow({ where: { processingRunId: run.id } });
    expect(documentResult.documentId).toBe(documentId);

    const queryResponse = await request(app.getHttpServer()).get(`/documents/${documentId}`).expect(200);
    expect(queryResponse.body.status).toBe('COMPLETED');
    expect(queryResponse.body.result.documentType).toBe('IDENTITY_DOCUMENT');
  });

  // PDF13 — regressão de imagens: JPG/PNG continuam funcionando depois da extensão para PDF
  it('PDF13 — JPG e PNG válidos continuam sendo aceitos após a extensão para PDF', async () => {
    const png = buildValidPng();
    const distinctPng = Buffer.concat([png, Buffer.from('pdf13-png')]);
    const pngSha256 = createHash('sha256').update(distinctPng).digest('hex');

    const pngResponse = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctPng, { filename: 'pdf13.png', contentType: 'image/png' })
      .expect(202);
    await trackDocument(pngSha256);
    const pngDocument = await prisma.document.findUniqueOrThrow({ where: { id: pngResponse.body.documentId } });
    expect(pngDocument.mimeType).toBe('image/png');

    const jpeg = buildValidJpeg();
    const distinctJpeg = Buffer.concat([jpeg, Buffer.from('pdf13-jpg')]);
    const jpegSha256 = createHash('sha256').update(distinctJpeg).digest('hex');

    const jpegResponse = await request(app.getHttpServer())
      .post('/documents')
      .attach('file', distinctJpeg, { filename: 'pdf13.jpg', contentType: 'image/jpeg' })
      .expect(202);
    await trackDocument(jpegSha256);
    const jpegDocument = await prisma.document.findUniqueOrThrow({ where: { id: jpegResponse.body.documentId } });
    expect(jpegDocument.mimeType).toBe('image/jpeg');
  });
});

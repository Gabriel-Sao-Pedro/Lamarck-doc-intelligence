import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { cleanupDocument, createDocumentWithStatus } from './support/processing-fixtures.js';

describe('DocumentList (e2e)', () => {
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

    // Limpeza defensiva: garante uma base vazia para este arquivo de specs,
    // independente de restos deixados por uma execução local anterior
    // interrompida (a CI já sobe sempre um Postgres vazio).
    await prisma.documentResult.deleteMany({});
    await prisma.processingRun.deleteMany({});
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
  });

  afterEach(async () => {
    for (const documentId of trackedDocumentIds.splice(0)) {
      await cleanupDocument(prisma, documentId);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function newDocument(status: 'RECEIVED' | 'PROCESSING' | 'RETRYING' | 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED', createdAt?: Date) {
    const created = await createDocumentWithStatus(prisma, status, createdAt);
    trackedDocumentIds.push(created.documentId);
    return created;
  }

  // L1 — lista vazia
  it('L1 — lista vazia retorna 200, items [], total 0, totalPages 0', async () => {
    const response = await request(app.getHttpServer()).get('/documents').expect(200);

    expect(response.body).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  // L2 — defaults
  it('L2 — sem query params usa page=1 e pageSize=20', async () => {
    await newDocument('RECEIVED');

    const response = await request(app.getHttpServer()).get('/documents').expect(200);

    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.pageSize).toBe(20);
  });

  // L3 — paginação
  it('L3 — pagina corretamente sem repetir itens entre páginas', async () => {
    const base = Date.now();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const doc = await newDocument('RECEIVED', new Date(base - i * 1000));
      created.push(doc.documentId);
    }

    const page1 = await request(app.getHttpServer()).get('/documents?page=1&pageSize=2').expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });

    const page2 = await request(app.getHttpServer()).get('/documents?page=2&pageSize=2').expect(200);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });

    const page3 = await request(app.getHttpServer()).get('/documents?page=3&pageSize=2').expect(200);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.pagination).toEqual({ page: 3, pageSize: 2, total: 5, totalPages: 3 });

    const idsSeen = [
      ...page1.body.items.map((i: { documentId: string }) => i.documentId),
      ...page2.body.items.map((i: { documentId: string }) => i.documentId),
      ...page3.body.items.map((i: { documentId: string }) => i.documentId),
    ];
    expect(new Set(idsSeen).size).toBe(5); // nenhum repetido
    expect(idsSeen.sort()).toEqual([...created].sort());
  });

  // L4 — ordenação
  it('L4 — ordena por createdAt DESC com desempate por id DESC', async () => {
    const sameInstant = new Date();
    const docA = await newDocument('RECEIVED', sameInstant);
    const docB = await newDocument('RECEIVED', sameInstant);
    const newer = await newDocument('RECEIVED', new Date(sameInstant.getTime() + 5000));

    const response = await request(app.getHttpServer()).get('/documents?pageSize=10').expect(200);
    const ids: string[] = response.body.items.map((i: { documentId: string }) => i.documentId);

    // o mais recente por createdAt vem primeiro
    expect(ids[0]).toBe(newer.documentId);

    // desempate estável entre A e B (mesmo createdAt): ordem por id DESC
    const [expectedFirst, expectedSecond] = [docA.documentId, docB.documentId].sort().reverse();
    const tieIndexA = ids.indexOf(docA.documentId);
    const tieIndexB = ids.indexOf(docB.documentId);
    const [actualFirst, actualSecond] = tieIndexA < tieIndexB ? [docA.documentId, docB.documentId] : [docB.documentId, docA.documentId];
    expect([actualFirst, actualSecond]).toEqual([expectedFirst, expectedSecond]);
  });

  // L5 — filtro por status
  it('L5 — filtra por status corretamente, incluindo total/totalPages', async () => {
    await newDocument('RECEIVED');
    await newDocument('COMPLETED');
    await newDocument('COMPLETED');
    await newDocument('FAILED');

    const response = await request(app.getHttpServer()).get('/documents?status=COMPLETED').expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.every((i: { status: string }) => i.status === 'COMPLETED')).toBe(true);
    expect(response.body.pagination.total).toBe(2);
    expect(response.body.pagination.totalPages).toBe(1);
  });

  // L6 — status inválido
  it('L6 — status inválido retorna 400', async () => {
    await request(app.getHttpServer()).get('/documents?status=NOT_A_STATUS').expect(400);
  });

  // L7 — page inválida
  it('L7 — page inválida (0, negativo, texto) retorna 400', async () => {
    await request(app.getHttpServer()).get('/documents?page=0').expect(400);
    await request(app.getHttpServer()).get('/documents?page=-1').expect(400);
    await request(app.getHttpServer()).get('/documents?page=abc').expect(400);
  });

  // L8 — pageSize inválido
  it('L8 — pageSize inválido (0, 101, negativo, texto) retorna 400', async () => {
    await request(app.getHttpServer()).get('/documents?pageSize=0').expect(400);
    await request(app.getHttpServer()).get('/documents?pageSize=101').expect(400);
    await request(app.getHttpServer()).get('/documents?pageSize=-1').expect(400);
    await request(app.getHttpServer()).get('/documents?pageSize=abc').expect(400);
  });

  // L9 — página além do fim
  it('L9 — página além do total retorna 200 com items vazio', async () => {
    await newDocument('RECEIVED');

    const response = await request(app.getHttpServer()).get('/documents?page=999&pageSize=20').expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.pagination.page).toBe(999);
    expect(response.body.pagination.total).toBe(1);
  });

  // L10 — não expõe PII/infraestrutura
  it('L10 — resposta não expõe campos extraídos nem infraestrutura', async () => {
    await newDocument('COMPLETED');

    const response = await request(app.getHttpServer()).get('/documents').expect(200);

    const raw = JSON.stringify(response.body);
    for (const forbidden of [
      'fullName',
      'parentage',
      'birthDate',
      'documentNumber',
      'issuingAuthority',
      'fields',
      'storageKey',
      'sha256',
      'claimToken',
      'claimedBy',
      'claimedAt',
      'leaseExpiresAt',
      'attemptCount',
      'processingJob',
      'ProcessingJob',
      'processingRun',
      'stack',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  // L11 — regressão da consulta individual
  it('L11 — GET /documents/:id continua funcionando', async () => {
    const doc = await newDocument('COMPLETED');

    const response = await request(app.getHttpServer()).get(`/documents/${doc.documentId}`).expect(200);
    expect(response.body.documentId).toBe(doc.documentId);
    expect(response.body.status).toBe('COMPLETED');
  });
});

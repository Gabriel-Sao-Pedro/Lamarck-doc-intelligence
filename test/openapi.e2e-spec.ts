import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { setupOpenApi } from '../src/openapi.js';

describe('OpenAPI (e2e)', () => {
  let app: INestApplication<App>;
  let document: Record<string, unknown>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupOpenApi(app);
    await app.init();

    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    document = response.body;
  });

  afterAll(async () => {
    await app.close();
  });

  // OPENAPI1 — Swagger UI
  it('OPENAPI1 — GET /docs retorna 200 com HTML da Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/docs').expect(200);

    expect(response.type).toBe('text/html');
    expect(response.text.toLowerCase()).toContain('swagger');
  });

  // OPENAPI2 — JSON
  it('OPENAPI2 — GET /docs-json retorna 200 com um documento OpenAPI válido', async () => {
    expect(document.openapi).toEqual(expect.any(String));
    expect(document.info).toBeDefined();
    expect(document.paths).toBeDefined();
  });

  // OPENAPI3 — rotas documentadas
  it('OPENAPI3 — /docs-json documenta POST/GET /documents e GET /documents/{id}', () => {
    const paths = document.paths as Record<string, Record<string, unknown>>;

    expect(paths['/documents']).toBeDefined();
    expect(paths['/documents'].post).toBeDefined();
    expect(paths['/documents'].get).toBeDefined();
    expect(paths['/documents/{id}']).toBeDefined();
    expect(paths['/documents/{id}'].get).toBeDefined();
  });

  // OPENAPI4 — API key scheme
  it('OPENAPI4 — components.securitySchemes documenta a API key no header X-API-Key', () => {
    const components = document.components as { securitySchemes?: Record<string, Record<string, unknown>> };
    const schemes = components.securitySchemes ?? {};
    const schemeNames = Object.keys(schemes);

    expect(schemeNames).toHaveLength(1);
    const scheme = schemes[schemeNames[0]];
    expect(scheme.type).toBe('apiKey');
    expect(scheme.in).toBe('header');
    expect(scheme.name).toBe('X-API-Key');
  });

  // OPENAPI5 — segurança nas operações
  it('OPENAPI5 — POST/GET /documents e GET /documents/{id} declaram o security scheme', () => {
    const paths = document.paths as Record<string, Record<string, { security?: unknown[] }>>;

    expect(paths['/documents'].post.security).toBeDefined();
    expect((paths['/documents'].post.security as unknown[]).length).toBeGreaterThan(0);
    expect(paths['/documents'].get.security).toBeDefined();
    expect((paths['/documents'].get.security as unknown[]).length).toBeGreaterThan(0);
    expect(paths['/documents/{id}'].get.security).toBeDefined();
    expect((paths['/documents/{id}'].get.security as unknown[]).length).toBeGreaterThan(0);
  });

  // OPENAPI6 — multipart
  it('OPENAPI6 — POST /documents documenta multipart/form-data com arquivo binário', () => {
    const paths = document.paths as Record<string, { post: { requestBody: { content: Record<string, unknown> } } }>;
    const requestBody = paths['/documents'].post.requestBody;

    expect(requestBody.content['multipart/form-data']).toBeDefined();
    const schema = (
      requestBody.content['multipart/form-data'] as { schema: { properties: Record<string, { type: string; format: string }> } }
    ).schema;
    expect(schema.properties.file.type).toBe('string');
    expect(schema.properties.file.format).toBe('binary');
  });

  // OPENAPI7 — query params
  it('OPENAPI7 — GET /documents documenta page, pageSize e status', () => {
    const paths = document.paths as Record<string, { get: { parameters: Array<{ name: string; in: string }> } }>;
    const params = paths['/documents'].get.parameters;
    const names = params.map((p) => p.name);

    expect(names).toEqual(expect.arrayContaining(['page', 'pageSize', 'status']));
    expect(params.every((p) => p.in === 'query')).toBe(true);
  });

  // OPENAPI8 — UUID
  it('OPENAPI8 — GET /documents/{id} documenta id como path parameter formato UUID', () => {
    const paths = document.paths as Record<string, { get: { parameters: Array<{ name: string; in: string; schema: { format?: string } }> } }>;
    const idParam = paths['/documents/{id}'].get.parameters.find((p) => p.name === 'id');

    expect(idParam).toBeDefined();
    expect(idParam!.in).toBe('path');
    expect(idParam!.schema.format).toBe('uuid');
  });

  // OPENAPI9 — privacidade
  it('OPENAPI9 — o documento não expõe campos internos proibidos', () => {
    const raw = JSON.stringify(document);

    for (const forbidden of ['storageKey', 'sha256', 'claimToken', 'ProcessingJob', 'ProcessingRun']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  // OPENAPI10 — regressão completa: não é um teste dedicado, coberta por
  // npm run test:e2e rodando todas as suítes juntas.
});

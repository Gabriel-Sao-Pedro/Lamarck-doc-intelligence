# 11 — Fase 2.4: Swagger / OpenAPI

## 1. Ação

A Fase 2.3 foi mergeada em `main` (HEAD `b7b0be9`, CI `33486732686` verde).

Agora documente com precisão o contrato HTTP já existente usando Swagger/OpenAPI, sem alterar comportamento de negócio.

Não implemente feature de domínio nova, `Idempotency-Key`, provider real ou revisão humana nesta tarefa.

Antes de começar, confirme `main`, working tree limpa e CI verde, e crie:

`feat/openapi`

## 2. Contexto

Leia specification, architecture, ADRs, README, `.env.example`, `src/main.ts`, `src/documents/`, `src/auth/`, DTOs existentes, testes E2E e os relatórios/reviews 08–10 antes de implementar.

A documentação deve descrever o comportamento real existente. Não invente campo, status, header, resposta ou endpoint só para deixar o Swagger mais completo. Se houver divergência entre documentação e código, pare e reporte antes de "corrigir" qualquer lado.

## 3. Papel

Atue como implementador do backend.

Prefira `@nestjs/swagger` e o mecanismo padrão do NestJS de servir Swagger UI. Não adicione biblioteca paralela de documentação.

A revisão e a decisão de merge serão feitas por mim.

## 4. Dados de entrada e referências

Endpoints de documentação, na ausência de definição diferente nos documentos:

- `GET /docs` — Swagger UI;
- `GET /docs-json` — documento OpenAPI JSON.

Podem ficar públicos nesta fase — não expõem dados processados nem executam operação de negócio, e o "Try it out" das rotas protegidas continua exigindo API key real. Não proteja os assets da Swagger UI com o `ApiKeyGuard`. Não exponha valor real de `API_KEY` na documentação.

Metadados mínimos: title (algo como "DOC Intelligence API"), description curta, version (`1.0` ou a já adotada).

Documente a autenticação atual como API key em header: `X-API-Key: <valor>`, com um security scheme (`type: apiKey`, `in: header`, `name: X-API-Key`), nome estável. Não documente Bearer/JWT/OAuth/cookie. As rotas de documentos devem declarar esse requisito de segurança.

Rotas a documentar exatamente: `POST /documents`, `GET /documents`, `GET /documents/:id`. Confira `GET /`: se for só smoke/root, documente como health ou exclua da documentação de negócio — registre a decisão. Não crie endpoint novo só para documentação.

Para `POST /documents`: `multipart/form-data`, campo real do multipart, tipos aceitos hoje (JPEG/JPG/PNG/PDF), limite de 10 MB, validação por magic bytes, SHA-256 para dedup, processamento assíncrono, resposta `202`. Arquivo como `type: string, format: binary`. Documente a resposta real (`202` novo/duplicata, incluindo `deduplicated` se fizer parte do contrato atual) e os erros que o runtime realmente usa (`400`/`401`/`413`; só `415` se o comportamento real usar — leia os testes antes de declarar cada status).

Para `GET /documents`: `page`/`pageSize`/`status` com defaults reais (`page=1`, `pageSize=20`, `pageSize` máx `100`), enum de status igual ao do código (não escreva um enum manual paralelo), resposta real (`items`, paginação, campos de cada item, sem PII/internals), `200`/`400`/`401`.

Para `GET /documents/:id`: `id` como UUID, `200`/`400`/`401`/`404`, resposta real (dados públicos, `status`, `result`/`result: null`), sem `storageKey`/`sha256`/`claimToken`/IDs internos de job/run.

Prefira schemas tipados reutilizáveis a objetos OpenAPI duplicados manualmente. Pode adicionar decorators nos DTOs existentes, criar DTOs pequenos de documentação, ou usar schemas auxiliares — sem alterar validação de runtime só para agradar o Swagger, sem transformar entidade Prisma em contrato HTTP, sem duplicação exagerada. Reutilize o enum de status já adotado — não crie um segundo conjunto de strings que possa divergir.

Revise o `/docs-json` gerado: sem API key real, valor de `.env`, storage paths, `storageKey`/hash reais, PII de fixture real, claim token, stack trace ou detalhe de infraestrutura desnecessário. Examples, se usados, fictícios.

Adicionar OpenAPI não deve mudar nenhum comportamento runtime: API key continua obrigatória, Swagger não deve bypassar guard, alterar pipes/interceptors de upload, limite de 10 MB, deduplicação, processing ou response runtime.

Quero testes (nomes tipo OPENAPI1...) para: Swagger UI (`200`, HTML), JSON OpenAPI válido, rotas documentadas (`POST`/`GET /documents`, `GET /documents/{id}`), security scheme de API key (`apiKey`/header/`X-API-Key`), segurança declarada nas operações protegidas, multipart (`string`/`binary`), query params documentados, `id` como UUID/path param, ausência de campos internos proibidos no documento gerado, e regressão completa da suíte anterior sem reduzir cobertura.

## 5. Formato de saída

Depois de implementar e testar, crie:

`docs/implementation/011-phase2-openapi.md`

Explique: objetivo, dependências adicionadas, `/docs`, `/docs-json`, metadata, security scheme, rotas documentadas, multipart, responses, query params, UUID, privacidade, testes OPENAPI1–10, smoke/manual, regressões, README, schema/migrations, processing/storage, CI, `npm audit`, riscos, fora de escopo, assistência do Claude.

Execute:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
docker compose config
npm audit
npm audit --omit=dev
```

Se novas dependências alterarem o `npm audit`, separe claramente finding antigo de finding novo. Não esconda regressão de segurança introduzida pelo Swagger.

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Commits pequenos, push para `origin/feat/openapi`, acompanhe a CI.

Depois pare para minha revisão.

## 6. Restrições e limites

Não:

- implemente feature de domínio nova;
- implemente `Idempotency-Key`;
- implemente provider real;
- implemente revisão humana;
- adicione biblioteca paralela de documentação;
- altere schema ou crie migration (se parecer necessário, pare e reporte);
- altere `src/processing/` ou `src/storage/` além de import estritamente necessário — expectativa é zero alteração; não mexa em claim/lease/claimToken/fencing/retry/provider;
- altere `specification`/`architecture`/ADRs automaticamente (se achar que uma decisão nova merece ADR, pare e justifique — expectativa é nenhum ADR novo);
- invente campo/status/header/resposta/endpoint que o runtime não tem de verdade;
- faça merge.

Se houver divergência entre documentação e código, ou se uma dependência nova parecer necessária além do `@nestjs/swagger`, pare e explique antes de agir.

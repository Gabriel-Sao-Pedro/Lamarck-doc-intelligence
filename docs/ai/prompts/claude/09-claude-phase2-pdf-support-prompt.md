# 09 — Fase 2.2: adicionar suporte a PDF

## 1. Ação

Depois que a Fase 2.1 estiver mergeada em `main` e com CI verde, adicione suporte a PDF no fluxo existente.

O mesmo:

```http
POST /documents
```

deve passar a aceitar:

```text
JPG
JPEG
PNG
PDF
```

O PDF deve seguir o mesmo fluxo de ingestão, deduplicação, processing, persistência e consulta.

## 2. Contexto

Não comece em cima da branch da listagem.

Parta da `main` já contendo a Fase 2.1 e crie:

```text
feat/pdf-support
```

Leia specification, architecture, ADRs, ingestão, processing, storage, schema, testes, README e relatórios atuais.

Se os documentos humanos definirem regra específica para PDF diferente deste prompt, pare e me mostre.

## 3. Papel

Atue como implementador da Fase 2.2.

Faça a menor generalização necessária para adicionar PDF sem desestabilizar JPG/JPEG/PNG.

A revisão e o merge serão feitos por mim.

## 4. Dados de entrada e referências

Valide PDF pelo conteúdo real.

Magic bytes:

```text
%PDF-
```

Não confie apenas em extensão ou MIME enviado pelo cliente.

Preserve o limite atual de 10 MB, salvo se os documentos humanos definirem outro limite para PDF.

PDF deve usar:

- storage atual;
- SHA-256 dos bytes crus;
- deduplicação atual;
- `ProcessingJob` atual;
- worker atual;
- fake provider atual;
- mesma state machine.

Não crie tipo documental novo só porque o arquivo é PDF.

O MIME de arquivo e `IDENTITY_DOCUMENT` são conceitos diferentes.

Não implemente parser PDF, OCR ou provider real nesta etapa.

Quero testes para:

- PDF válido;
- `.pdf` falso;
- MIME falso;
- extensão enganosa;
- arquivo acima do limite;
- deduplicação;
- corrida de deduplicação;
- metadata;
- processing;
- consulta;
- listagem;
- vertical slice completa com PDF;
- regressão de imagens;
- regressão completa.

Use somente PDF fictício nos testes.

## 5. Formato de saída

Crie:

`docs/implementation/009-phase2-pdf-support.md`

Explique:

- detecção de PDF;
- limite;
- storage;
- SHA-256;
- deduplicação;
- processing;
- fake provider;
- testes;
- regressões;
- ausência de parser/OCR real;
- schema/migration;
- CI;
- riscos.

Atualize o README somente se ele ainda disser que aceita apenas JPG/JPEG/PNG.

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

Faça push para:

```text
origin/feat/pdf-support
```

Acompanhe a CI e depois pare para minha revisão.

## 6. Restrições e limites

Não:

- implemente API key;
- implemente Swagger/OpenAPI;
- implemente Idempotency-Key;
- implemente provider real;
- implemente OCR;
- implemente revisão humana;
- implemente nome padronizado;
- reescreva claim/retry/fencing;
- altere schema sem necessidade comprovada;
- instale biblioteca PDF sem me consultar;
- use documento real;
- faça merge.

Se uma dependência ou migration parecer necessária, pare e explique antes.

# 03 — Implementar ingestão de documentos

## 1. Ação

Implemente a primeira parte funcional da vertical slice do backend:

`POST /documents`

Nesta etapa quero receber um documento, validar o arquivo, calcular seu SHA-256, salvar usando storage local, criar `Document + ProcessingJob` e retornar `202`.

Também quero tratar duplicata exata pelo hash.

Não implemente o worker ainda.

Antes de começar, confirme que a foundation já está na `main` e crie:

`feat/document-ingestion`

a partir dela.

## 2. Contexto

O projeto usa NestJS, TypeScript, Prisma, PostgreSQL e Docker Compose.

A foundation já foi aprovada, incluindo a correção do `claimToken`.

Leia antes de alterar código:

- `CLAUDE.md`
- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `docs/specification.md`
- `docs/architecture.md`
- ADRs
- relatórios e reviews da foundation
- `prisma/schema.prisma`
- migrations atuais

Confira também:

```bash
git status --short
git branch --show-current
git log --oneline -10
```

Se houver alteração inesperada antes da tarefa, pare e me mostre.

O desafio pede uma vertical slice real de backend. Esta tarefa cobre apenas a entrada e persistência inicial do documento; processamento e consulta virão depois.

## 3. Papel

Atue como implementador do backend.

Siga as decisões que já estão registradas e evite redesenhar a arquitetura sem necessidade.

A revisão da implementação e a decisão de merge serão feitas por mim depois.

## 4. Dados de entrada e referências

O endpoint deve receber um arquivo em `multipart/form-data`.

Na Fase 1 aceite somente:

- JPG;
- JPEG;
- PNG.

Limite:

- 10 MB.

O limite deve ser aplicado no multipart antes de aceitar arquivos arbitrariamente grandes.

Não confie apenas em extensão ou MIME enviado pelo cliente. Confira o conteúdo real do arquivo por assinatura/magic bytes.

Calcule:

`SHA-256(bytes originais)`

Esse hash identifica duplicata exata.

Para documento novo:

1. validar;
2. calcular hash;
3. verificar duplicata;
4. salvar via `DocumentStorage`;
5. criar `Document + ProcessingJob` na mesma transação;
6. retornar `202`.

Resposta esperada:

```json
{
 "documentId": "uuid",
 "status": "RECEIVED",
 "deduplicated": false
}
```

Para duplicata:

- reutilizar o `Document` existente;
- não criar novo job;
- não manter outra cópia permanente;
- retornar `202`;
- devolver o `documentId` existente;
- devolver o status atual;
- `deduplicated: true`.

A constraint única do hash no banco deve proteger a corrida entre duas requisições iguais. Se as duas chegarem juntas, apenas uma pode criar o documento/job e a outra deve resolver para o registro vencedor.

Use uma abstração `DocumentStorage`, com implementação local nesta fase. O banco guarda `storageKey`, não blob.

Se o arquivo for salvo e a transação falhar, remova somente o arquivo criado por aquela requisição.

Não use dados reais em testes ou exemplos.

Quero testes para, no mínimo:

- upload válido;
- `202`;
- SHA-256 persistido;
- duplicata retorna mesmo `documentId`;
- duplicata não cria segundo job;
- arquivo acima de 10 MB;
- conteúdo inválido mesmo com extensão/MIME aceitos;
- compensação quando banco falha;
- corrida de duplicata;
- uso de `storageKey` sem blob.

## 5. Formato de saída

Depois de implementar e testar, crie:

`docs/implementation/003-document-ingestion.md`

Explique de forma simples:

- fluxo;
- contrato do endpoint;
- limite de 10 MB;
- validação do conteúdo;
- SHA-256;
- deduplicação;
- concorrência;
- storage local;
- transação;
- compensação;
- testes;
- validação manual;
- CI;
- audit;
- riscos;
- o que ficou fora.

Antes do commit mostre:

```bash
git status --short
git diff --stat
git diff
```

Depois execute:

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

Faça uma validação manual mínima do endpoint com arquivos fictícios.

Faça commit(s) claros, por exemplo:

```text
feat: add document ingestion flow
docs: record document ingestion implementation
```

Faça push de:

`feat/document-ingestion`

Acompanhe a CI e informe HEAD, run id e resultado.

Depois pare para minha revisão.

## 6. Restrições e limites

Não implemente nesta tarefa:

- worker;
- claim;
- `FOR UPDATE SKIP LOCKED`;
- retry;
- processamento por IA;
- fake provider;
- `ProcessingRun`;
- `DocumentResult`;
- classificação;
- extração;
- confiança;
- nome padronizado;
- consulta/listagem;
- fila de revisão;
- correção humana;
- PDF;
- autenticação;
- frontend;
- deploy.

Não altere migrations anteriores.

Não reescreva specification, architecture, ADRs ou reviews anteriores.

Se o schema atual não suportar algo indispensável, pare e explique antes de criar migration.

Não use `npm audit fix --force`.

Não faça merge.

Não esconda falhas de testes, audit ou CI.

Ao terminar, informe de forma objetiva:

- branch e HEAD;
- arquivos principais;
- comportamento implementado;
- testes;
- validações;
- CI;
- riscos;
- próximo passo.

Depois aguarde minha revisão.

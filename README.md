# Lamarck DOC Intelligence

Backend do desafio Lamarck DOC Intelligence: receber documentos, processá-los
de forma assíncrona por um worker e expor o resultado extraído por uma API
REST.

**Status: vertical slice mínima da Fase 1 completa.**

```
receber (POST /documents) → processar (worker + provider fake) → persistir → consultar (GET /documents/:id)
```

Ver [`docs/specification.md`](docs/specification.md) e
[`docs/architecture.md`](docs/architecture.md) para o plano completo, e
["Limitações da Fase 1"](#limitações-da-fase-1) abaixo para o que ainda não
existe.

## Stack

- TypeScript
- Node.js 24.x
- NestJS 12
- Prisma ORM 7 (PostgreSQL, via o driver adapter `@prisma/adapter-pg`)
- PostgreSQL 16 (Docker Compose) — também usado como fila de processamento
- Vitest (testes) / oxlint (lint)

## Pré-requisitos

- Node.js `24.x` (ver `.nvmrc`)
- npm
- Docker + Docker Compose (para o PostgreSQL)

## Configuração

1. Copie o arquivo de ambiente e ajuste se necessário:

   ```bash
   cp .env.example .env
   ```

   Se a porta `5432` já estiver em uso por outro PostgreSQL local, troque
   `POSTGRES_PORT` (e a porta no `DATABASE_URL`) em `.env` para uma porta
   livre, ex.: `5433`.

2. Suba o PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Instale as dependências exatamente como travadas no lockfile:

   ```bash
   npm ci
   ```

4. Gere o Prisma client:

   ```bash
   npm run prisma:generate
   ```

5. Aplique as migrations:

   ```bash
   npm run prisma:migrate:deploy
   ```

   (Use `npm run prisma:migrate:dev` se estiver alterando
   `prisma/schema.prisma` e quiser que uma nova migration seja criada
   automaticamente.)

6. Inicie a aplicação:

   ```bash
   npm run start:dev
   ```

   A aplicação escuta em `http://localhost:3000` por padrão (`PORT` em
   `.env`). Um worker de processamento inicia automaticamente no mesmo
   processo (ver `PROCESSING_WORKER_ENABLED` abaixo).

## Variáveis de ambiente

Além de `DATABASE_URL`/`POSTGRES_*`/`PORT`/`STORAGE_LOCAL_DIR` (documentadas
em `.env.example`), duas variáveis opcionais controlam o worker de
processamento — nenhuma delas precisa ser definida para uso normal:

| Variável | Default | Para que serve |
|---|---|---|
| `PROCESSING_WORKER_ENABLED` | `true` | `false` desliga o loop de processamento em segundo plano (usado pelos testes e2e, para controle determinístico) |
| `PROCESSING_WORKER_POLL_INTERVAL_MS` | `1000` | Intervalo de polling do worker quando não há job pendente. Valores inválidos (ausente, `0`, negativo, decimal, texto) caem nesse default automaticamente |

## Enviando e consultando um documento (vertical slice)

Com a aplicação rodando (`npm run start:dev`), a Fase 1 aceita imagens
`JPEG`/`JPG`/`PNG` de até 10 MB representando um documento de identidade
fictício. O tipo do arquivo é validado pelo conteúdo real (magic bytes), não
pela extensão.

### 1. Envie um documento

Crie um PNG mínimo fictício localmente (não use documento real):

```bash
node -e "
const zlib = require('zlib');
function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c;}let crc=0xFFFFFFFF;for(const b of buf)crc=t[(crc^b)&0xFF]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td),0);return Buffer.concat([len,td,crc]);}
const sig=Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr.writeUInt8(8,8);
const idat=zlib.deflateSync(Buffer.from([0x00,0x00]));
const png=Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
require('fs').writeFileSync('fixture.png', png);
"
```

Envie por `multipart/form-data`, campo `file`:

```bash
curl -F "file=@fixture.png;type=image/png" http://localhost:3000/documents
```

Resposta (`202 Accepted`):

```json
{ "documentId": "uuid", "status": "RECEIVED", "deduplicated": false }
```

Enviar exatamente o mesmo arquivo de novo retorna o mesmo `documentId` com
`"deduplicated": true` — não cria um segundo documento nem um segundo job
(deduplicação por SHA-256).

### 2. Aguarde o processamento

**O processamento é assíncrono.** A resposta `202` não significa que o
documento já foi processado — o worker (rodando em segundo plano, no mesmo
processo) faz o claim do job, chama o provider fake e persiste o resultado
em alguns segundos, dependendo do intervalo de polling
(`PROCESSING_WORKER_POLL_INTERVAL_MS`, `1000` ms por padrão).

### 3. Consulte o resultado

```bash
curl http://localhost:3000/documents/<documentId>
```

Sempre responde `200 OK` (o estado do processamento vive no corpo, não no
HTTP status); `404` se o `documentId` não existir. Estados possíveis em
`status`:

| Estado | Significado | `result` |
|---|---|---|
| `RECEIVED` | recebido, ainda não processado | `null` |
| `PROCESSING` | um worker está processando agora | `null` |
| `RETRYING` | uma tentativa falhou tecnicamente e aguarda nova tentativa | `null` |
| `COMPLETED` | processado com sucesso | dados extraídos (fictícios) |
| `NEEDS_REVIEW` | processado, mas com baixa confiança — resultado original preservado para revisão futura | dados extraídos (fictícios) |
| `FAILED` | esgotou as tentativas técnicas permitidas | `null` |

Exemplo de resposta em `COMPLETED`:

```json
{
  "documentId": "uuid",
  "documentType": "IDENTITY_DOCUMENT",
  "status": "COMPLETED",
  "createdAt": "2026-08-31T...",
  "updatedAt": "2026-08-31T...",
  "result": {
    "documentType": "IDENTITY_DOCUMENT",
    "fields": {
      "fullName": "Fulano de Tal Fictício",
      "parentage": "Filho(a) de Fulano Fictício e Beltrana Fictícia",
      "birthDate": "1990-01-01",
      "documentNumber": "FAKE-1234567",
      "issuingAuthority": "ORGAO FICTICIO"
    },
    "confidence": 0.95
  }
}
```

Consulte novamente até o `status` chegar a `COMPLETED`, `NEEDS_REVIEW` ou
`FAILED` (com o intervalo padrão de polling, isso normalmente acontece em
1–2 segundos).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run start:dev` | Roda a aplicação com hot reload |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda a aplicação compilada (`dist/main.js`) |
| `npm run lint` | Roda o oxlint em `src/` e `test/` |
| `npm run format` | Formata `src/` e `test/` com o Prettier |
| `npm test` | Roda os testes unitários (Vitest) |
| `npm run test:e2e` | Roda os testes end-to-end (precisa do PostgreSQL do `docker compose` rodando — ver abaixo) |
| `npm run prisma:validate` | Valida `prisma/schema.prisma` |
| `npm run prisma:generate` | Regenera o Prisma client em `src/generated/prisma` |
| `npm run prisma:migrate:dev` | Cria e aplica uma nova migration localmente |
| `npm run prisma:migrate:deploy` | Aplica as migrations existentes (usado na CI) |

## Testes

```bash
npm test          # unitários — não precisam de banco
npm run test:e2e  # end-to-end — precisam do PostgreSQL (docker compose up -d) e do schema migrado
npm run lint
npm run build
```

Os testes e2e (`test/*.e2e-spec.ts`) sobem a aplicação real via
`@nestjs/testing` e usam o PostgreSQL do `docker compose`, incluindo casos de
concorrência real (`FOR UPDATE SKIP LOCKED`, fencing por `claimToken`,
corrida de deduplicação). O worker de processamento fica desabilitado
automaticamente durante essa suíte (`PROCESSING_WORKER_ENABLED=false`, ver
`test/setup-e2e.ts`), para que os testes controlem claim/processamento de
forma determinística.

## Limitações da Fase 1

Deliberadamente fora desta entrega (ver `docs/specification.md` §21–§25 e
`PROJECT_CONTEXT.md`):

- só `JPEG`/`JPG`/`PNG`, limite de 10 MB por arquivo;
- extração feita por um **provider fake determinístico** — nenhum modelo de
  IA real está integrado nesta fase;
- sem suporte a PDF;
- sem autenticação;
- sem fila de revisão humana operacional (o resultado de `NEEDS_REVIEW` é
  preservado no banco, mas não há endpoint/fluxo de correção humana ainda);
- sem listagem (`GET /documents`), filtro ou paginação — só consulta
  individual por `id`;
- sem sugestão de nome padronizado de arquivo (planejado para uma fase
  futura, `docs/specification.md` §24);
- storage do arquivo é local em disco (`STORAGE_LOCAL_DIR`), não um serviço
  como S3;
- PostgreSQL funciona como fila de processamento nesta fase (ADR-002), não
  há Redis/RabbitMQ/Kafka;
- esta não é a arquitetura final de produção — decisões como storage local e
  fila no PostgreSQL foram escolhidas para reduzir infraestrutura nesta
  entrega (ver ADRs em `docs/decisions/`).

## Estrutura do projeto

```
src/
├── database/     # PrismaService + DatabaseModule (global)
├── documents/    # ingestão (POST /documents) e consulta (GET /documents/:id)
├── storage/      # abstração DocumentStorage + implementação local
├── processing/   # worker, claim/lease/fencing, provider fake, validação, finalização
├── generated/prisma/   # saída do Prisma client (gerada, não commitada)
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma       # Document, ProcessingJob, ProcessingRun, DocumentResult
└── migrations/
test/
├── *.e2e-spec.ts        # testes end-to-end (Postgres real)
└── support/              # fixtures de teste (imagens fictícias geradas em memória)
docker-compose.yml       # só PostgreSQL
```

## Por que o PostgreSQL roda em Docker mas a aplicação não

A aplicação roda localmente com `npm` durante o desenvolvimento
(`docs/specification.md` / `PROJECT_CONTEXT.md`). Só o PostgreSQL fica em
container, para que qualquer pessoa que clonar o projeto consiga ter um
banco funcionando sem instalar PostgreSQL diretamente na máquina.

## Por que o Prisma precisa de um driver adapter

Este projeto usa o Prisma ORM 7, que exige um driver adapter explícito de
SQL (`@prisma/adapter-pg` + `pg`) para conectar — `new PrismaClient()` sem
um adapter não funciona nesta versão. Ver
`docs/implementation/001-project-foundation.md` para os detalhes.

## CI

`.github/workflows/ci.yml` roda a cada push e pull request: instala as
dependências, valida e gera o Prisma client, aplica as migrations contra um
container de serviço PostgreSQL, depois roda lint, build e a suíte completa
de testes (unitários e end-to-end, esta última contra o mesmo PostgreSQL de
serviço).

## Documentação

- [`docs/specification.md`](docs/specification.md) — o que está sendo construído e por quê
- [`docs/architecture.md`](docs/architecture.md) — como está organizado
- [`docs/decisions/`](docs/decisions/) — ADRs de decisões individuais
- [`docs/implementation/`](docs/implementation/) — relatórios de cada etapa implementada e reviews humanas
- [`docs/ai/PROMPT_HISTORY.md`](docs/ai/PROMPT_HISTORY.md) — índice dos prompts usados para instruir o Claude em cada etapa
- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — contexto do projeto usado pelo Claude durante a implementação
- [`docs/ai/AI_WORKFLOW.md`](docs/ai/AI_WORKFLOW.md) — como o Claude trabalha neste repositório e como o responsável pelo projeto revisa as mudanças

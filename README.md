# Lamarck DOC Intelligence

Backend do desafio Lamarck DOC Intelligence: receber documentos, processá-los
de forma assíncrona por um worker e expor o resultado extraído por uma API
REST.

**Status: Fase 3 concluída (3.1, 3.2 e 3.3).**

A vertical slice principal está funcional. A API já suporta:

- upload de documentos;
- processamento assíncrono;
- consulta individual;
- listagem paginada com filtro por status;
- suporte a JPEG, PNG e PDF;
- autenticação simples por API key;
- fila de revisão humana, claim exclusivo com lease e correção de campos com optimistic locking.

```
receber (POST /documents) → processar (worker + provider fake) → persistir → consultar (GET /documents/:id)
```

Quando o processamento manda um documento para `NEEDS_REVIEW`, o fluxo de revisão humana continua assim:

```
GET /reviews → POST /reviews/:documentId/claim → PATCH /reviews/:documentId
```

Ver [`docs/specification.md`](docs/specification.md) e
[`docs/architecture.md`](docs/architecture.md) para o plano completo, e
["Limitações desta entrega"](#limitações-desta-entrega) abaixo para o que ainda não
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

`API_KEY` (documentada em `.env.example`) é **obrigatória** — a aplicação
recusa subir sem ela. É a chave exigida no header `X-API-Key` para acessar
qualquer rota de `/documents` e `/reviews` (ver seção seguinte).

## Enviando e consultando um documento (vertical slice)

Com a aplicação rodando (`npm run start:dev`), a API aceita arquivos
`JPEG`/`JPG`/`PNG`/`PDF` de até 10 MB representando um documento de
identidade fictício. O tipo do arquivo é validado pelo conteúdo real (magic
bytes — incluindo a assinatura `%PDF-` para PDF), não pela extensão nem pelo
`Content-Type` declarado no upload.

Toda rota abaixo exige o header `X-API-Key` com o valor de `API_KEY`
configurado no `.env`. Sem o header, com header vazio ou com chave errada, a
resposta é sempre `401 Unauthorized`.

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
curl -H "X-API-Key: change-me" -F "file=@fixture.png;type=image/png" http://localhost:3000/documents
```

(No PowerShell, use `curl.exe -H "X-API-Key: change-me" -F "file=@fixture.png;type=image/png" http://localhost:3000/documents` — `curl` sozinho é um alias de `Invoke-WebRequest`.)

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
curl -H "X-API-Key: change-me" http://localhost:3000/documents/<documentId>
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

### 4. Liste os documentos

```bash
curl -H "X-API-Key: change-me" "http://localhost:3000/documents?page=1&pageSize=20&status=COMPLETED"
```

Todos os parâmetros são opcionais:

| Parâmetro | Default | Regra |
|---|---|---|
| `page` | `1` | inteiro `>= 1` |
| `pageSize` | `20` | inteiro entre `1` e `100` |
| `status` | sem filtro | um dos estados abaixo |

Estados aceitos em `status`:

```text
RECEIVED
PROCESSING
RETRYING
COMPLETED
NEEDS_REVIEW
FAILED
```

Exemplo de resposta:

```json
{
  "items": [
    {
      "documentId": "uuid",
      "status": "COMPLETED",
      "documentType": "IDENTITY_DOCUMENT",
      "createdAt": "2026-08-31T...",
      "updatedAt": "2026-08-31T..."
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Ordenação por `createdAt` decrescente (mais recente primeiro). A resposta
não inclui campos extraídos nem detalhes de infraestrutura — só o resumo
de cada documento.

### 5. Consulte a fila de revisão humana

```bash
curl -H "X-API-Key: change-me" "http://localhost:3000/reviews?page=1&pageSize=20"
```

Lista somente documentos em `NEEDS_REVIEW`, ordenados por `createdAt`
**crescente** (mais antigo primeiro) — é uma fila de trabalho, não um
histórico, então o item mais velho é o que deveria ser revisado primeiro.
`page`/`pageSize` seguem os mesmos defaults e limites de `GET /documents`.
Cada item inclui o `result` que levou o documento a `NEEDS_REVIEW`.

Esta rota (Fase 3.1) é só a listagem — nenhuma escrita acontece aqui.
Reivindicar (passo 6) e corrigir (passo 7) vêm a seguir.

### 6. Reivindique um documento para revisão

```bash
curl -X POST -H "X-API-Key: change-me" -H "Content-Type: application/json" \
  -d '{"reviewerId":"reviewer-01"}' \
  http://localhost:3000/reviews/<documentId>/claim
```

Concede um claim exclusivo com lease de 15 minutos (Fase 3.2). Regras:

```text
documento inexistente        -> 404
status != NEEDS_REVIEW       -> 409
claim ativo por outro revisor -> 409
sem claim ou lease expirado  -> claim concedido, novo claimToken
duas requisições simultâneas -> só uma ganha
```

Exemplo de resposta:

```json
{
  "documentId": "uuid",
  "claimedBy": "reviewer-01",
  "claimToken": "uuid",
  "leaseExpiresAt": "2026-09-01T..."
}
```

Sem scheduler/reaper: um lease expirado é simplesmente sobrescrito no
próximo claim. `version` na resposta do claim é a `reviewVersion` atual do
documento — usada no passo seguinte para o optimistic locking do `PATCH`.

### 7. Corrija um campo (Fase 3.3)

```bash
curl -X PATCH -H "X-API-Key: change-me" -H "Content-Type: application/json" \
  -d '{"claimToken":"<claimToken do claim acima>","version":1,"corrections":{"documentNumber":"..."}}' \
  http://localhost:3000/reviews/<documentId>
```

Salva uma correção versionada dos campos extraídos, sem sobrescrever o
resultado original da IA. Exige um claim ativo e válido:

```text
documento inexistente                    -> 404
status != NEEDS_REVIEW                   -> 409
claimToken incorreto, ausente ou lease
  expirado                               -> 409
version diferente da reviewVersion atual -> 409
corrections com campo fora da allow-list -> 400
```

`corrections` só aceita os 5 campos de negócio de `IDENTITY_DOCUMENT`
(`fullName`, `parentage`, `birthDate`, `documentNumber`,
`issuingAuthority`) — qualquer outra chave é rejeitada com `400`.
`reviewedBy` nunca vem do corpo da requisição: é sempre derivado do
`ReviewClaim` que validou o `claimToken`.

Exemplo de resposta (`200`):

```json
{
  "documentId": "uuid",
  "version": 2,
  "reviewedBy": "reviewer-01",
  "correctedFields": { "documentNumber": "..." },
  "aiResult": { "...": "resultado original da IA, nunca sobrescrito" },
  "effectiveResult": { "...": "resultado original + todas as correções aceitas até agora" },
  "updatedAt": "2026-09-01T..."
}
```

- `aiResult` — o que o provider produziu originalmente (`DocumentResult`, imutável).
- `correctedFields` — só os campos enviados nesta correção.
- `effectiveResult` — `aiResult` com todas as correções aceitas até agora aplicadas por cima, campo a campo; nunca persistido como uma cópia própria, sempre recalculado a partir do histórico de `ReviewCorrection`.
- `reviewVersion`/`version` — versão operacional de optimistic locking: cada correção aceita incrementa em 1; enviar uma `version` desatualizada retorna `409` sem sobrescrever a correção já aceita.

Cada correção aceita cria uma nova linha em `ReviewCorrection` (histórico
append-only, nunca sobrescreve uma correção anterior). Continua fora de
escopo: nome de arquivo padronizado, provider multimodal real, segundo
tipo documental, endpoint explícito de reprocessamento.

## Documentação da API

Com a aplicação rodando, o contrato HTTP fica disponível em:

- [`http://localhost:3000/docs`](http://localhost:3000/docs) — Swagger UI;
- [`http://localhost:3000/docs-json`](http://localhost:3000/docs-json) — documento OpenAPI em JSON.

As rotas de `/documents` e `/reviews` exigem `X-API-Key` — o botão
**Authorize** no Swagger UI pede a chave uma vez e a reaplica em cada
chamada de teste feita pela própria UI.

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
forma determinística. O mesmo arquivo define uma `API_KEY` fictícia
(`test-api-key`) para a suíte não depender de nenhum segredo externo.

### O que eu escolhi testar e por quê

A suíte (15 unitários + 109 E2E) não persegue cobertura percentual — ela
prioriza os pontos onde um bug seria caro e fácil de não perceber em teste
manual: **concorrência**, **consistência de estado** e **segurança do
fluxo**. Por isso, cada área abaixo tem pelo menos um teste que força o
cenário de disputa real, não só o caminho feliz:

- **ingestão e deduplicação** — inclui uma corrida real de dois uploads
  simultâneos com os mesmos bytes (`Promise.all`), confirmando um único
  `Document`, um único `ProcessingJob` e que o arquivo do perdedor não fica
  órfão no storage;
- **processing (retry/fencing)** — lease expirado, esgotamento das 3
  tentativas, e principalmente um worker "atrasado" tentando finalizar com
  um `claimToken` que já foi substituído (fencing) — o cenário que mais
  provavelmente corromperia um resultado silenciosamente;
- **listagem e API key** — paginação sem itens repetidos/perdidos entre
  páginas, e as quatro combinações de header ausente/vazio/errado/correto;
- **OpenAPI** — não só que a rota aparece no `/docs-json`, mas que campos
  internos (`storageKey`, `sha256`, `claimToken` de processamento) nunca
  vazam para nenhum schema público;
- **review queue, claim concorrente e optimistic locking** — o mesmo
  raciocínio de concorrência real aplicado às Fases 3.1-3.3: duas
  requisições de claim disputando o mesmo documento, e duas correções
  (`PATCH`) disputando a mesma `version`, verificando não só os códigos
  HTTP mas o estado final persistido no banco;
- **preservação do resultado original** — depois de uma correção humana
  aceita, o `DocumentResult` da IA é comparado byte-a-byte com o valor
  anterior à correção.

## Limitações desta entrega

Deliberadamente fora do que foi construído até a Fase 3.3 (ver
`docs/specification.md` §21–§25/§24 e `PROJECT_CONTEXT.md`):

- `JPEG`/`JPG`/`PNG`/`PDF`, limite de 10 MB por arquivo;
- extração feita por um **provider fake determinístico** — nenhum modelo de
  IA multimodal real está integrado, incluindo para PDF (sem OCR/parser
  real, ver `docs/implementation/009-phase2-pdf-support.md`);
- autenticação é uma única API key compartilhada por header (`X-API-Key`),
  pensada para comunicação service-to-service — sem login, sessão, JWT,
  OAuth ou usuários individuais;
- sem nome de arquivo padronizado (planejado para uma fase futura,
  `docs/specification.md` §24);
- sem segundo tipo documental (só `IDENTITY_DOCUMENT` existe hoje);
- sem endpoint explícito de reprocessamento;
- sem endpoint para consultar o histórico completo de `ReviewCorrection` de
  um documento — cada `PATCH` só retorna o resultado efetivo mais recente;
- sem reaper de lease: um `ReviewClaim`/`ProcessingJob` com lease expirado
  só é liberado quando alguém tenta reivindicar de novo, nunca
  proativamente;
- storage do arquivo é local em disco (`STORAGE_LOCAL_DIR`), não um serviço
  como S3;
- PostgreSQL funciona como fila de processamento (ADR-002), não há
  Redis/RabbitMQ/Kafka;
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
├── reviews/      # fila (GET /reviews), claim (POST .../claim), correção (PATCH /reviews/:id)
├── generated/prisma/   # saída do Prisma client (gerada, não commitada)
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma       # Document, ProcessingJob, ProcessingRun, DocumentResult, ReviewClaim, ReviewCorrection
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

# 04 — Implementar processamento de documentos

## 1. Ação

Implemente a etapa de processamento da vertical slice.

Quero que um `ProcessingJob` criado pela ingestão seja adquirido com segurança por um worker, processado por um provider fake e termine com histórico e resultado persistidos.

O fluxo principal deve chegar até:

```text
RECEIVED
→ PROCESSING
→ COMPLETED
```

ou:

```text
RECEIVED
→ PROCESSING
→ NEEDS_REVIEW
```

Também trate falhas técnicas, retry e lease expirado.

Não implemente ainda os endpoints de consulta.

## 2. Contexto

A ingestão já foi aprovada e incorporada em `main`.

Antes de começar:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
git log --oneline -12
```

Crie:

`feat/document-processing`

Leia antes de alterar código:

- `CLAUDE.md`;
- `AGENTS.md`;
- `PROJECT_CONTEXT.md`;
- specification;
- architecture;
- ADRs;
- relatórios 001, 002 e 003;
- reviews existentes;
- schema e migrations;
- implementação atual da ingestão.

As decisões principais já estão fechadas:

- PostgreSQL funciona como fila;
- sem Redis/broker nesta fase;
- claim com `FOR UPDATE SKIP LOCKED`;
- provider roda fora da transação;
- `claimToken` protege contra worker antigo;
- lease precisa cobrir o tempo do provider;
- máximo de 3 tentativas, contando a primeira;
- falha técnica consome tentativa;
- falha semântica vai para `NEEDS_REVIEW`;
- `ProcessingJob.attemptCount` é operacional;
- `ProcessingRun.attemptNumber` é histórico.

## 3. Papel

Atue como implementador do backend.

Siga as decisões já registradas e mantenha o worker separado logicamente da API, mesmo rodando no mesmo processo NestJS nesta fase.

A revisão e a decisão de merge serão feitas por mim depois.

## 4. Dados de entrada e referências

Implemente claim atômico de job elegível.

O claim deve:

- bloquear a linha com estratégia equivalente a `FOR UPDATE SKIP LOCKED`;
- gerar `claimToken` novo;
- definir worker e lease;
- incrementar `attemptCount` ao iniciar uma nova tentativa;
- colocar o documento em `PROCESSING`;
- terminar a transação antes de chamar o provider.

Se ainda não houver valor documentado para o lease, use 60 segundos nesta fase: 40 segundos de máximo informado para o provider + 20 segundos de margem.

A finalização precisa validar no banco:

- job correto;
- `claimToken` atual;
- lease ainda válido;
- status compatível.

Cenário obrigatório:

```text
worker A → token A
lease expira
worker B → token B
worker A volta com token A
```

O worker A não pode gravar resultado nem alterar o status.

A recuperação de lease expirado deve acontecer pelo próprio claim, sem reaper separado.

Máximo de tentativas:

`3`

Falha técnica:

```text
PROCESSING → RETRYING
```

e, se houver nova tentativa:

```text
RETRYING → PROCESSING
```

Quando acabarem as tentativas:

```text
PROCESSING → RETRYING → FAILED
```

Resultado semanticamente ruim ou de baixa confiança:

```text
PROCESSING → NEEDS_REVIEW
```

sem retry técnico.

Crie uma abstração para provider de IA e uma implementação fake determinística.

Para Fase 1, use:

`IDENTITY_DOCUMENT`

com dados fictícios para:

- `fullName`;
- `parentage`;
- `birthDate`;
- `documentNumber`;
- `issuingAuthority`.

O fake precisa permitir testar:

- sucesso;
- resultado que exige revisão;
- falha técnica.

Implemente validação em duas etapas:

1. estrutura/formato obrigatório;
2. validação semântica contra o documento, simulada nesta fase.

Em sucesso, grave `DocumentResult` e `ProcessingRun`.

Em `NEEDS_REVIEW`, preserve o resultado produzido pela IA para futura conferência humana.

`ProcessingRun` continua histórico. Não use run para ownership ou retry.

O nome padronizado não pode incluir PII.

Quero testes para:

- dois workers disputando um job;
- token novo por claim;
- stale worker bloqueado;
- provider fora da transação;
- sucesso → `COMPLETED`;
- `DocumentResult`;
- `ProcessingRun`;
- semantic review → `NEEDS_REVIEW`;
- falha técnica → `RETRYING`;
- limite de 3 tentativas → `FAILED`;
- recuperação de lease expirado;
- lease expirado sem tentativas → `FAILED`;
- provider atrasado não grava depois de perder lease;
- dois workers não recuperam o mesmo lease ao mesmo tempo;
- fluxo desde documento ingerido até resultado persistido.

Use PostgreSQL real quando concorrência, transação ou `SKIP LOCKED` forem parte do comportamento testado.

## 5. Formato de saída

Depois de implementar, crie:

`docs/implementation/004-document-processing.md`

Explique:

- claim;
- `SKIP LOCKED`;
- `claimToken`;
- lease;
- worker;
- provider fake;
- retry;
- recuperação de lease;
- fencing;
- validação;
- `ProcessingRun`;
- `DocumentResult`;
- estados;
- testes;
- CI;
- riscos;
- o que ficou fora.

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

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Faça commits claros, por exemplo:

```text
feat: add document processing worker
docs: record document processing implementation
```

Faça push para:

`origin/feat/document-processing`

Acompanhe a CI e informe HEAD, run id e resultado.

Depois pare para minha revisão.

## 6. Restrições e limites

Não implemente nesta tarefa:

- `GET /documents/:id`;
- listagem;
- endpoint de conteúdo;
- fila de revisão HTTP;
- correção humana;
- autenticação;
- PDF;
- provider real;
- frontend;
- broker externo;
- microservices;
- deploy;
- reaper separado.

Não mantenha transação aberta durante a chamada ao provider.

Não use `claimedBy` como fencing sem `claimToken`.

Não crie segunda fonte para número de tentativas.

Não altere migrations existentes.

Se o schema não suportar uma regra obrigatória, pare e explique antes de criar migration nova.

Não use dados reais.

Não exponha PII nos logs.

Não use `npm audit fix --force`.

Não faça merge.

Se encontrar divergência real entre schema e arquitetura, pare e reporte antes de contornar.

Ao terminar, informe objetivamente:

- branch/HEAD;
- claim e lease;
- fencing;
- worker;
- provider;
- retry;
- persistência;
- testes;
- validações;
- CI;
- riscos;
- próximo passo.

Depois aguarde minha revisão.

# Prompt — Claude — Project Foundation

Quero iniciar agora a primeira etapa de código do projeto **Lamarck DOC Intelligence**.

Esta tarefa é a **foundation** do backend. O objetivo é deixar o projeto NestJS + Prisma + PostgreSQL reproduzível, com o schema inicial compartilhado e uma CI mínima, **sem implementar ainda a vertical slice de negócio**.

A documentação humana já foi revisada e aprovada. Ela é a fonte de verdade.

## 0. Antes de qualquer alteração

Confirme que você está em:

`E:\Programação\Trabalho\Teste_Lamarck`

Leia completamente, nesta ordem:

1. `CLAUDE.md`
2. `PROJECT_CONTEXT.md`
3. `docs/specification.md`
4. `docs/architecture.md`
5. todos os ADRs em `docs/decisions/`
6. `docs/ai/AI_WORKFLOW.md`
7. `.claude/skills/doc-intelligence-backend/SKILL.md`
8. `.claude/skills/postgres-concurrency/SKILL.md`

Leia também as referências de concorrência PostgreSQL somente quando forem relevantes para o schema ou para justificar alguma decisão.

Context7 já falhou por timeout em tentativas anteriores e **não é bloqueante**.

Não tente corrigir ou investigar o Context7 nesta tarefa.

Depois da leitura, informe brevemente:

- escopo que você entendeu;
- o que está fora de escopo;
- contratos compartilhados que você não pode alterar silenciosamente.

Se encontrar contradição real entre documentos humanos, **pare antes de escrever código** e reporte.

---

# 1. Git e branch

Antes de alterar arquivos:

Execute:

`git status --short`

`git branch --show-current`

`git log --oneline -8`

A working tree deve estar limpa.

A branch de origem deve ser `main`.

Atualize a referência remota sem reescrever histórico:

`git fetch origin`

Confirme que `main` local e `origin/main` estão alinhados.

Se `main` local e `origin/main` estiverem divergentes:
- NÃO faça merge;
- NÃO faça rebase;
- NÃO faça pull automático;
- NÃO crie a branch de implementação;
- pare e reporte os SHAs local/remoto para decisão humana.

Depois crie uma branch própria para esta tarefa:

`feat/project-foundation`

Não faça rebase.
Não altere commits anteriores.
Não altere timestamps.
Não force-push.

---

# 2. O que está DENTRO do escopo

Nesta tarefa você deve preparar somente a fundação técnica.

## 2.1 NestJS

Inicialize o projeto NestJS **na raiz atual do repositório**.

Não crie uma pasta aninhada como:

`Teste_Lamarck/Lamarck-doc-intelligence/`

O projeto deve continuar usando a raiz atual.

Use:

- TypeScript;
- npm;
- dependências locais do projeto;
- scripts reproduzíveis pelo `package.json`.

Padronize também a versão do Node usada pelo projeto.

A máquina atual usa Node `24.16.0`.

Prefira manter a foundation em Node `24.x` e:
- adicione um `.nvmrc` com uma versão/major compatível;
- adicione `engines.node` no `package.json`;
- configure o GitHub Actions com o mesmo major do Node.

Se alguma dependência principal escolhida não suportar Node 24.x:
- NÃO troque silenciosamente o major;
- pare;
- mostre a incompatibilidade;
- proponha a menor alternativa.

Não dependa de Nest CLI instalado globalmente.

Mantenha a estrutura inicial pequena.

---

## 2.2 Prisma

Configure Prisma para PostgreSQL.

Claude é o proprietário da **primeira versão completa** de:

- `prisma/schema.prisma`;
- primeira migration.

Essa responsabilidade foi definida antes da implementação em:

- `docs/architecture.md`;
- `PROJECT_CONTEXT.md`.

O schema inicial deve representar, no mínimo, os conceitos já aprovados:

- `Document`;
- `ProcessingJob`;
- `ProcessingRun`;
- `DocumentResult`;
- enums compartilhados necessários para a state machine inicial.

O schema deve ser suficiente para a Fase 1 e não bloquear evoluções já previstas.

### Regras obrigatórias

`Document` deve conseguir representar pelo menos:

- identificador interno;
- SHA-256 do conteúdo;
- `storageKey`;
- tipo documental;
- estado atual;
- metadados mínimos necessários para o upload;
- timestamps.

O hash precisa ter proteção de unicidade no banco.

`ProcessingJob` deve conseguir representar pelo menos:

- documento relacionado;
- controle operacional do job;
- `attemptCount`;
- ownership/claim do worker;
- início do claim;
- fim/validade do lease;
- informações necessárias para recuperar job abandonado;
- timestamps.

`ProcessingJob.attemptCount` é a **fonte de verdade operacional** do número de tentativas.

Não derive o limite de retry contando `ProcessingRun`.

`ProcessingRun` deve:

- representar uma tentativa iniciada;
- ser histórico;
- preservar `attemptNumber`;
- permitir registrar provider/model/modelVersion;
- permitir registrar identificação/versão/hash do prompt;
- permitir registrar versão do schema de saída;
- permitir início/fim/status;
- permitir registrar tipo de falha técnica sem armazenar PII desnecessária.

`DocumentResult` deve:

- estar ligado ao documento;
- estar ligado ao `ProcessingRun` que o produziu;
- permitir `documentType`;
- permitir `schemaVersion`;
- permitir dados estruturados flexíveis no PostgreSQL;
- não eliminar a validação forte na aplicação que virá depois.

Não armazene o binário completo do documento no PostgreSQL.

### State machine aprovada

Use somente estes estados do documento:

- `RECEIVED`
- `PROCESSING`
- `RETRYING`
- `COMPLETED`
- `NEEDS_REVIEW`
- `FAILED`

Não adicione estados silenciosamente.

Não implemente ainda a lógica de transição nesta tarefa.

---

## 2.3 Banco e Docker Compose

Crie um `docker-compose.yml` simples para PostgreSQL.

Objetivo:

uma pessoa deve conseguir clonar o projeto e subir o banco local sem instalar PostgreSQL diretamente no computador.

Mantenha:

- somente o necessário;
- PostgreSQL não exposto além do necessário para desenvolvimento local;
- credenciais locais fictícias/configuráveis por `.env`;
- volume persistente local.

Adicione healthcheck do PostgreSQL se for simples.

Não adicione:

- Redis;
- RabbitMQ;
- Kafka;
- SQS;
- MinIO;
- outro banco.

---

## 2.4 Configuração de ambiente

Crie:

`.env.example`

Ele deve conter apenas valores de exemplo seguros, incluindo o necessário para:

- `DATABASE_URL`;
- porta da aplicação, se usada;
- caminho futuro do storage local, se já fizer sentido;
- outras configurações realmente necessárias para a foundation.

Não crie secrets reais.

Não versione `.env`.

---

## 2.5 Database module

Pode criar a infraestrutura mínima para integrar Prisma ao NestJS, por exemplo:

- `PrismaService`;
- `DatabaseModule`;

se isso for necessário para deixar a foundation pronta.

Não crie repositories de domínio ainda.

Não implemente regras de negócio.

---

## 2.6 README inicial

Crie um `README.md` inicial.

Ele deve ser **executável e honesto**, não promocional.

Inclua pelo menos:

- objetivo curto do projeto;
- stack;
- pré-requisitos;
- como copiar/configurar `.env.example`;
- como subir PostgreSQL;
- como instalar dependências;
- como gerar Prisma client;
- como aplicar migrations;
- como iniciar a aplicação;
- como rodar lint;
- como rodar build;
- como rodar testes;
- estrutura resumida;
- aviso claro de que esta etapa é apenas a foundation e que a vertical slice será implementada nas próximas tarefas.

Não documente comando que você não verificou ou que não exista.

O README poderá ser ampliado depois.

---

## 2.7 CI mínima

Crie:

`.github/workflows/ci.yml`

Objetivo: permitir que, após o push da branch, o GitHub registre o resultado real da validação.

A CI deve ser pequena.

Inclua, quando aplicável:

- checkout;
- Node compatível com o projeto;
- `npm ci`;
- Prisma generate/validate;
- PostgreSQL de serviço se necessário;
- migrations;
- lint;
- build;
- testes.

Não adicione:

- Sonar;
- Codecov;
- deploy;
- release;
- badges;
- ferramentas extras sem necessidade.

A CI deve rodar pelo menos em:

- `push`;
- `pull_request`.

---

# 3. O que está FORA do escopo

NÃO implemente nesta tarefa:

- `POST /documents`;
- `GET /documents/:id`;
- upload multipart de documentos;
- SHA-256 na aplicação;
- deduplicação na aplicação;
- `DocumentStorage`;
- `LocalDocumentStorage`;
- worker funcional;
- claim SQL;
- `FOR UPDATE SKIP LOCKED` em código;
- state machine em código;
- retry em código;
- fake provider;
- validação dos campos do documento;
- `IDENTITY_DOCUMENT` extraction logic;
- `DocumentResult` business validation;
- PDF;
- listagem de documentos;
- API key;
- Swagger/OpenAPI de negócio;
- review queue;
- provider real;
- reprocessamento;
- frontend.

O schema pode preparar os dados necessários para essas features, mas a lógica não deve ser implementada agora.

---

# 4. Shared contracts e novas decisões

Não altere:

- `docs/specification.md`;
- `docs/architecture.md`;
- ADRs;
- `PROJECT_CONTEXT.md`;
- `CLAUDE.md`;
- `AGENTS.md`;

nesta tarefa.

Esses documentos são humanos e estão congelados para início da implementação.

Se a foundation exigir uma decisão que não está coberta:

1. descreva a decisão necessária;
2. apresente no máximo 2 ou 3 alternativas;
3. explique o impacto;
4. pare para aprovação.

Não escolha silenciosamente algo que mude:

- state machine;
- política de retry;
- contrato HTTP;
- divisão de responsabilidades entre Claude e revisão humana;
- estratégia de fila;
- estratégia de storage;
- deduplicação;
- modelo conceitual aprovado.

Pequenas decisões de scaffolding que não alterem esses contratos podem ser tomadas e registradas no relatório.

---

# 5. Segurança

Nesta foundation:

- não use dados reais;
- não coloque PII em fixtures;
- não crie logs com dados pessoais;
- não versione `.env`;
- não coloque tokens no Git;
- não use filename de usuário como path;
- não exponha PostgreSQL publicamente além do necessário para dev local;
- mantenha `storage/` fora do Git.

---

# 6. Ordem de implementação

Faça nesta ordem:

1. inspeção do repo;
2. leitura completa dos documentos;
3. criação da branch;
4. scaffold NestJS na raiz;
5. dependências;
6. Prisma;
7. schema inicial;
8. migration inicial;
9. Docker Compose;
10. `.env.example`;
11. integração mínima Prisma/Nest;
12. README inicial;
13. GitHub Actions;
14. revisão do diff.

Não implemente features da Fase 1 além da foundation.

---

# 7. Regra de testes desta tarefa

A estratégia do projeto é:

`implementar -> subir branch -> observar testes/CI -> corrigir`

Portanto, nesta tarefa:

Antes do push, faça somente as verificações necessárias para saber que a estrutura foi criada e que os arquivos/configurações são legíveis.

NÃO esconda uma falha encontrada.

Depois da implementação, faça commit e push da branch para que a CI registre a validação real.

Não manufacture falhas de propósito.

Se a CI falhar naturalmente:
- preserve o histórico;
- registre o erro;
- diagnostique;
- corrija em novo commit;
- faça novo push;
- valide novamente.

---

# 8. Antes do primeiro commit da foundation

Mostre:

`git status --short`

Mostre um resumo do diff.

Confirme que não foram alterados documentos humanos.

Confirme que não entrou:

- `.env`;
- `node_modules/`;
- storage local;
- secrets;
- arquivos pessoais;
- PDF do desafio.

Depois faça um commit único para a foundation inicial com mensagem:

`chore: initialize NestJS Prisma foundation`

Não misture features da vertical slice.

---

# 9. Push

Depois do commit:

faça push somente da branch:

`feat/project-foundation`

para:

`origin`

Não faça merge em `main`.

Não faça force-push.

---

# 10. CI pós-push

Depois do push:

acompanhe o workflow criado para essa branch usando GitHub CLI, se disponível.

Registre:

- nome do workflow;
- run id;
- resultado;
- etapa que falhou, se houver.

Se a CI passar:

não invente correções.

Se a CI falhar:

diagnostique a falha real.

Você pode corrigir problemas de foundation que estejam dentro deste escopo.

Cada correção deve ser um novo commit, preservando a falha anterior.

Faça push novamente e revalide a CI.

Pare se a correção exigir mudar uma decisão humana/arquitetural.

---

# 11. Validações esperadas

Ao final, quero evidência real para:

- `npm ci` ou equivalente reproduzível;
- Prisma schema válido;
- Prisma client gerado;
- migration aplicável em PostgreSQL limpo;
- aplicação compilando;
- lint;
- testes existentes;
- Docker Compose válido;
- PostgreSQL saudável;
- CI executada após push.

Use somente:

`PASS`
`FAIL`
`NÃO EXECUTADO`

Nunca marque PASS sem ter executado/verificado.

---

# 12. Relatório de entendimento

Crie um relatório usando:

`docs/implementation/TASK_REPORT_TEMPLATE.md`

Salve como:

`docs/implementation/001-project-foundation.md`

O objetivo não é só listar o diff.

O relatório deve me permitir explicar a foundation em uma entrevista.

Inclua especialmente:

- como NestJS foi inicializado;
- por que o PostgreSQL está no Docker;
- como Prisma está configurado;
- explicação dos quatro modelos;
- por que `attemptCount` fica no `ProcessingJob`;
- relação entre `attemptCount` e `ProcessingRun.attemptNumber`;
- campos de lease/claim escolhidos;
- como o schema permite fencing/validação de ownership posteriormente;
- como `DocumentResult` será flexível sem abandonar validação na aplicação;
- o que a migration cria;
- como a CI funciona;
- como reproduzir localmente;
- decisões pequenas tomadas durante scaffolding;
- riscos;
- partes geradas pelo Claude;
- qualquer modificação manual posterior, se houver.

Não diga que algo foi escrito manualmente se foi gerado por você.

---

# 13. Relatório final da tarefa

Além do relatório salvo, responda com:

# Relatório — Project Foundation

## 1. Branch

Branch:
HEAD inicial:
HEAD final:
Remote:

## 2. Escopo concluído

Liste o que foi feito.

## 3. Fora do escopo preservado

Confirme explicitamente que nenhuma feature da vertical slice foi implementada.

## 4. Arquivos criados/modificados

Tabela:

| Arquivo | Ação | Motivo |

## 5. Dependências adicionadas

Para cada dependência nova:

- nome;
- categoria;
- motivo.

## 6. Schema Prisma

Liste:

- modelos;
- enums;
- constraints;
- índices;
- relações principais.

Explique qualquer decisão não óbvia.

## 7. Migration

Nome:
Aplicada localmente?:
Resultado:

## 8. Docker/PostgreSQL

Compose válido?:
Container saudável?:
Conexão Prisma funcionando?:

## 9. Scripts

Liste scripts disponíveis no `package.json`.

## 10. CI

Workflow:
Run:
Primeiro resultado:
Resultado final:

Se houve FAIL:
- etapa;
- erro;
- diagnóstico;
- commit de correção;
- novo resultado.

Se não houve FAIL:
diga explicitamente que nenhuma falha real ocorreu.

## 11. Validação

Tabela:

| Check | Comando/ação | Resultado |
|---|---|---|
| Install | | PASS / FAIL / NÃO EXECUTADO |
| Prisma validate | | PASS / FAIL / NÃO EXECUTADO |
| Prisma generate | | PASS / FAIL / NÃO EXECUTADO |
| Migration | | PASS / FAIL / NÃO EXECUTADO |
| Docker | | PASS / FAIL / NÃO EXECUTADO |
| Build | | PASS / FAIL / NÃO EXECUTADO |
| Lint | | PASS / FAIL / NÃO EXECUTADO |
| Tests | | PASS / FAIL / NÃO EXECUTADO |
| GitHub CI | | PASS / FAIL / NÃO EXECUTADO |

## 12. Documentos humanos

Confirme que NÃO alterou:

- specification;
- architecture;
- ADRs;
- PROJECT_CONTEXT;
- CLAUDE.md;
- AGENTS.md.

## 13. Decisões novas

Liste apenas decisões realmente novas.

Se nenhuma:
`Nenhuma decisão arquitetural nova.`

## 14. Divergências

Se nenhuma:
`Nenhuma divergência da documentação humana.`

## 15. Segurança

Confirme:

- `.env` fora do Git;
- sem secrets;
- sem PII;
- sem documento real;
- sem storage local versionado.

## 16. Riscos / pendências

Liste.

## 17. Git

Mostre:

`git status --short`

`git log --oneline -5`

`git branch -vv`

## 18. Próximo passo recomendado

O próximo passo esperado é:

`revisar a foundation e, depois de aprovada, iniciar o Claude na implementação de ingestion/API e, em seguida, de processing/worker, cada uma em sua própria branch`

NÃO execute esse próximo passo.

Pare depois do relatório.

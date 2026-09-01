# 12 — Fechamento da Fase 2

## 1. Ação

Faça o fechamento formal da Fase 2 sem adicionar feature nova.

Quero validar que tudo que já foi entregue continua funcionando em um clone
limpo e que a documentação está coerente antes de começar a Fase 3.

Ao final, o objetivo é chegar ao estado:

```text
FASE 2 ENCERRADA
```

mas ainda sem merge automático. Pare para revisão humana no final.

## 2. Contexto

Estado esperado no começo:

```text
main

HEAD:
5bfca61841965ccc804477c2de5c9a8cf93dbdb6

CI:
33489686915 — SUCCESS

Unit:
15/15

E2E:
77/77
```

A Fase 2 já entregou:

```text
2.1 — listagem de documentos
2.2 — suporte a PDF
2.3 — API key
2.4 — Swagger/OpenAPI
```

Antes de começar, confirme que `main` está atualizada e limpa.

Depois crie:

```text
chore/phase2-closure
```

Leia os documentos principais do projeto antes de alterar qualquer coisa.

## 3. Papel

Nesta tarefa, seu papel é validar e fechar a Fase 2, não desenvolver uma nova
funcionalidade.

Quero que você:

- valide o projeto em um fresh clone;
- confira banco e migrations;
- rode build, lint, unit e E2E;
- faça um smoke real da API;
- confira README;
- atualize a rastreabilidade da Fase 2;
- registre o fechamento.

Se encontrar problema material, pare e explique antes de tentar resolver.

## 4. Dados de entrada e referências

### Fresh clone

Faça um clone separado de `origin/main`.

Use PostgreSQL vazio e rode:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
docker compose up -d
```

Aplique migrations do zero.

Depois rode:

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

O esperado hoje é:

```text
Unit: 15/15
E2E: 77/77
```

Use somente configuração fictícia.

Não versionar `.env`.

### Smoke real

Suba a aplicação e confirme pelo menos:

```text
GET /documents sem API key
→ 401

GET /documents com API key
→ resposta normal
```

Faça também:

```text
upload de imagem válida
upload de PDF válido
reenvio do mesmo PDF
consulta por id
listagem
/docs
/docs-json
```

No PDF duplicado, confirme:

```text
202
mesmo documentId
deduplicated true
```

Use apenas arquivos fictícios.

Depois do smoke, encerre explicitamente o processo para não deixar worker ou
porta ocupados antes de rodar testes.

### README

Leia o README como se estivesse clonando o projeto pela primeira vez.

Confirme que ele permite:

```text
instalar
subir banco
configurar API_KEY
aplicar migrations
executar aplicação
enviar documento
consultar
listar
usar PDF
abrir Swagger
rodar testes
```

Corrija apenas erro factual. Não reescreva por estilo.

### PROMPT_HISTORY

Atualize:

```text
docs/ai/PROMPT_HISTORY.md
```

Incluindo:

```text
08 — listagem
09 — PDF
10 — API key
11 — OpenAPI
12 — fechamento da Fase 2
```

Mantenha a ordem real e o status correto de uso.

Não reescreva as entradas antigas sem necessidade.

### ADR-007

No:

```text
docs/decisions/ADR-007-fencing-claimtoken.md
```

adicione apenas uma frase deixando claro que ele formaliza uma decisão de
fencing que já havia sido implementada anteriormente na foundation.

Não mude a decisão nem reescreva o ADR.

### Documentação estrutural

Revise:

- specification;
- architecture;
- ADRs.

Confirme que continuam coerentes com listagem, PDF, API key e OpenAPI.

Não altere automaticamente.

Se encontrar divergência material, pare e mostre antes.

### Invariantes

Confirme que continuam verdadeiros:

```text
limite de 10 MB antes de buffering arbitrário
magic bytes
SHA-256
deduplicação
corrida de duplicata
Document + ProcessingJob na mesma transação
provider fora da transação
lease
claimToken
fencing
retry
ProcessingRun
PII fora de logs
API key fora do banco
OpenAPI sem segredo
```

### Audit

Execute:

```bash
npm audit
npm audit --omit=dev
```

Se continuar apenas o finding conhecido de `deepmerge-ts`, registre.

Se aparecer finding novo, destaque e não feche a fase como aprovada sem
explicar.

## 5. Formato de saída

Crie:

```text
docs/implementation/012-phase2-closure.md
```

Registre:

- estado inicial;
- fresh clone;
- banco vazio;
- migrations;
- build/lint/unit/E2E;
- smoke de API key;
- imagem;
- PDF;
- deduplicação;
- processing;
- detail;
- list;
- Swagger;
- README;
- PROMPT_HISTORY;
- ADR-007;
- specification;
- architecture;
- ADRs;
- audit;
- divergências;
- fora de escopo.

Versione também este prompt como:

```text
docs/ai/prompts/claude/12-claude-phase2-closure-prompt.md
```

Depois faça commits pequenos de documentação, push para:

```text
origin/chore/phase2-closure
```

e acompanhe a CI.

No final, informe:

```text
branch
HEAD
fresh clone
migrations
build
lint
unit
E2E
smoke
documentação
audit
arquivos alterados
commits
CI
```

e use apenas um destes resultados:

```text
APTO PARA REVIEW HUMANA FINAL DA FASE 2
```

ou:

```text
NÃO APTO PARA REVIEW HUMANA FINAL DA FASE 2
```

## 6. Restrições e limites

Não implemente:

- AuthModule;
- teste novo de 10 MB;
- Idempotency-Key;
- provider real;
- fila de revisão humana;
- claim de reviewer;
- correção humana;
- nome padronizado;
- segundo tipo documental;
- reprocessamento;
- qualquer parte da Fase 3.

Não altere código por estética.

Não altere:

```text
src/
prisma/schema.prisma
migrations
package.json
package-lock.json
.github/
testes
```

a menos que encontre um problema real. Nesse caso, pare antes e explique.

Não faça merge.

Não execute a auditoria de pontuação ainda.

Não inicie a Fase 3.

Pare depois de enviar o resultado do closure.

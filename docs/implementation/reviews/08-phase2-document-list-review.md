# 08 — Review humana — Fase 2.1: listagem de documentos

## 1. Resultado

**APROVADO PARA MERGE**

A implementação da Fase 2.1 foi revisada e está tecnicamente correta para o escopo definido.

A nova rota:

```http
GET /documents
```

entrega paginação, filtro opcional por status, ordenação determinística, resposta resumida e ausência de PII ou detalhes internos.

A revisão encontrou apenas um finding documental de baixa severidade:

```text
LIST-001
→ o prompt 08 foi renomeado durante o move para a pasta correta
→ conteúdo permaneceu intacto
→ não afeta funcionalidade
→ não bloqueia merge
```

Não foi identificado nenhum problema funcional ou arquitetural que impeça a continuidade da Fase 2.

Decisão:

```text
PODE FAZER MERGE
```

---

## 2. Estado revisado

- **Branch:** `feat/document-list`
- **HEAD:** `a487af4a848afa99c21bb8ba4306c6f60d604cae`
- **Base:** `8957cff`
- **Commits:** `aaefc21`, `142f1be`, `a487af4`
- **CI:** run `33466373347` — `SUCCESS`
- **Unit:** `9/9`
- **E2E:** `44/44`
- **Working tree:** limpa

O diff ficou restrito à listagem, testes e documentação relacionada. Não houve alteração em schema, migrations, processing ou ingestão.

---

## 3. O que eu conferi

Conferi diretamente:

- `GET /documents`;
- compatibilidade com `GET /documents/:id`;
- UUID inválido;
- defaults de paginação;
- limites de `page` e `pageSize`;
- parsing de números;
- filtro por status;
- case sensitivity;
- ordenação;
- cálculo de `skip`/`take`;
- `total`;
- `totalPages`;
- página além do fim;
- consistência entre `count` e `findMany`;
- ausência de PII;
- ausência de campos internos;
- `documentType`;
- ausência de N+1;
- validação runtime;
- testes L1–L12;
- regressões da Fase 1;
- ausência de schema/migration;
- relatório 008;
- prompt 08;
- CI do HEAD revisado.

Também validei empiricamente os principais casos de borda dos query params e o roteamento entre listagem e consulta individual.

---

## 4. Findings confirmados

### LIST-001 — prompt 08 foi renomeado durante o move

**Severidade:** BAIXO  
**Status:** CONFIRMADO  
**Impacto funcional:** nenhum

O prompt 08 foi inicialmente salvo com o nome:

```text
08-claude-phase2-document-list-prompt.md
```

Ao ser movido para:

```text
docs/ai/prompts/claude/
```

o nome final passou a ser:

```text
08-claude-document-list-prompt.md
```

O conteúdo permaneceu intacto. Portanto, a instrução realmente utilizada não foi alterada.

O impacto é apenas de nomenclatura e rastreabilidade: alguém procurando pelo nome original pode não localizar o arquivo diretamente.

### Correção recomendada

Preferência:

```bash
git mv   docs/ai/prompts/claude/08-claude-document-list-prompt.md   docs/ai/prompts/claude/08-claude-phase2-document-list-prompt.md
```

Sem modificar o conteúdo.

Também é aceitável registrar explicitamente essa alteração no `PROMPT_HISTORY.md`.

Por ser um ajuste documental pequeno, não considero bloqueador de merge.

---

## 5. Decisões técnicas relevantes

### Paginação

Defaults confirmados:

```text
page = 1
pageSize = 20
```

Limites confirmados:

```text
page >= 1
1 <= pageSize <= 100
```

Valores inválidos como zero, negativos, decimais e texto retornam `400`.

O parsing é real em runtime e não depende apenas de tipos TypeScript.

### Filtro por status

São aceitos exatamente:

```text
RECEIVED
PROCESSING
RETRYING
COMPLETED
NEEDS_REVIEW
FAILED
```

O filtro é case-sensitive. Valores como `completed`, `Completed` e `UNKNOWN` são rejeitados.

O mesmo objeto `where` é usado por `count` e `findMany`.

### Ordenação

A ordenação é:

```text
createdAt DESC
id DESC
```

O teste L4 realmente prova o desempate por `id`: dois registros usam o mesmo `createdAt`.

### Página além do fim

O comportamento está correto:

```text
200 OK
items = []
```

mantendo metadata coerente.

### Privacidade

A listagem não busca nem retorna PII.

O `select` do Prisma não inclui campos extraídos, storage, hash, claim, lease, job ou run.

### documentType

`documentType` vem do próprio `Document`, então continua disponível mesmo antes de existir `DocumentResult`.

### Somente leitura

O endpoint faz apenas operações de leitura equivalentes a:

```text
count
findMany
```

Não altera status, retry, lease, storage ou processamento.

### Performance

Não há N+1.

Paginação e filtro acontecem no banco.

---

## 6. Riscos não bloqueantes

### Snapshot entre count e findMany

`count` e `findMany` rodam juntos em `$transaction`, mas com isolamento padrão do PostgreSQL.

Em uma escrita concorrente muito específica, é teoricamente possível que as duas operações observem snapshots ligeiramente diferentes.

Para o volume atual, considero risco baixo e não bloqueante.

### Ausência de índice específico

Nenhum índice novo foi criado.

Isso é aceitável para o volume atual. Caso a consulta se torne gargalo, pode ser necessário revisar índices para `status`, `createdAt` e `id`.

### npm audit

Permanece o finding conhecido de `deepmerge-ts` via tooling do Prisma, sem mudança.

---

## 7. Validações / CI

### Testes L1–L12

| Caso | Resultado |
|---|---|
| L1 — lista vazia | PASS |
| L2 — defaults | PASS |
| L3 — paginação | PASS |
| L4 — ordenação | PASS |
| L5 — filtro por status | PASS |
| L6 — status inválido | PASS |
| L7 — page inválida | PASS |
| L8 — pageSize inválido | PASS |
| L9 — página além do fim | PASS |
| L10 — sem PII/infra | PASS |
| L11 — regressão GET individual | PASS |
| L12 — regressões Fase 1 | PASS |

### Regressões

| Área | Resultado |
|---|---|
| ingestão T1–T10 | PASS |
| processing P1–P15 | PASS |
| PROC-002 | PASS |
| consulta Q1–Q9 | PASS |

### Validações gerais

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 44/44 |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido |
| `npm audit --omit=dev` | FAIL — mesmo finding |
| CI | PASS |

Run de CI:

`33466373347`

HEAD:

`a487af4a848afa99c21bb8ba4306c6f60d604cae`

---

## 8. Decisão de merge

**PODE FAZER MERGE**

A Fase 2.1 atende ao escopo proposto.

Não encontrei:

- regressão funcional;
- vazamento de dados;
- problema de paginação;
- problema de filtro;
- problema de ordenação;
- alteração indevida de schema;
- conflito com a consulta individual;
- quebra da Fase 1.

O único finding é `LIST-001`, de natureza documental e baixa severidade.

Recomendo corrigir o nome do prompt 08 antes do merge porque é barato e melhora a rastreabilidade, mas a feature em si está tecnicamente aprovada.

---

## 9. Próximo passo

Fluxo recomendado:

```text
corrigir LIST-001
→ somente git mv / rastreabilidade
→ versionar esta review humana
→ push feat/document-list
→ CI verde
→ merge --ff-only em main
→ CI main verde
→ iniciar Fase 2.2
```

A próxima slice planejada é:

```text
Fase 2.2
→ suporte a PDF
```

Não há pendência técnica da listagem que impeça essa continuidade.

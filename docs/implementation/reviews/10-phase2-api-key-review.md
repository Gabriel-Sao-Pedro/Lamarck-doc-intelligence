# 10 — Review — autenticação por API key

## 1. Resultado

**APROVADO PARA MERGE**

A Fase 2.3 ficou dentro do escopo definido e não introduziu mudança no domínio,
processing, storage, schema ou state machine.

O possível `AUTH-001`, relacionado ao carregamento da `API_KEY` antes do
bootstrap do NestJS, foi investigado e descartado com leitura de código e smoke
test em processo novo.

## 2. Estado revisado

- branch: `feat/api-key-auth`
- HEAD: `08e8f80b0e8c89638f1ea16c6282a38a85f55a64`
- CI: `33485507561` — `SUCCESS`
- unit: `15/15`
- E2E: `68/68`

Nenhum arquivo foi alterado durante a revisão.

## 3. O que eu conferi

Revisei:

- `src/main.ts`;
- carregamento de `.env`;
- `ApiKeyGuard`;
- registro do guard no controller de documentos;
- comportamento com chave ausente, vazia, errada e correta;
- ausência de `API_KEY` na configuração;
- ordem entre autenticação e validação de UUID;
- escopo das rotas protegidas;
- logs e respostas de erro;
- testes unitários;
- testes E2E KEY1–KEY11;
- regressão completa;
- README;
- `.env.example`;
- ausência de mudanças em Prisma, processing e storage.

Também fiz smoke test do bootstrap com e sem `API_KEY`.

## 4. Findings confirmados

**Nenhum finding real confirmado.**

### AUTH-001 — descartado

A hipótese era que `main.ts` pudesse verificar `process.env.API_KEY` antes de o
arquivo `.env` ser carregado.

Isso não acontece.

`src/main.ts` importa:

```ts
import 'dotenv/config';
```

antes do bootstrap.

O smoke test confirmou os dois cenários:

```text
API_KEY somente no .env
→ aplicação inicia normalmente
→ GET / responde 200
```

e:

```text
API_KEY ausente no shell e no .env
→ aplicação falha antes de abrir a porta
→ exit code 1
```

O `.env` usado no teste foi restaurado ao estado original ao final.

## 5. Decisões técnicas relevantes

### Header

A autenticação usa:

```http
X-API-Key
```

### Configuração

A chave é lida de:

```text
API_KEY
```

e não existe fallback silencioso que deixe a API aberta.

### Escopo

Estão protegidos:

```text
POST /documents
GET /documents
GET /documents/:id
```

Continua público:

```text
GET /
```

### Ordem da autenticação

O guard roda antes da validação de parâmetros.

Por isso:

```text
GET /documents/not-a-uuid
sem chave
→ 401
```

e:

```text
GET /documents/not-a-uuid
com chave correta
→ 400
```

### Segurança

A chave:

- não é persistida no banco;
- não vai para storage;
- não aparece em `DocumentResult`;
- não é registrada em logs;
- não é devolvida em erro.

A comparação da credencial não lança exceção quando os comprimentos são
diferentes.

## 6. Riscos não bloqueantes

O único ponto observado foi a ausência de teste dedicado para header repetido,
que pode chegar como formato inesperado.

A leitura do guard mostra que valores que não sejam `string` são rejeitados com
`401`, então não existe finding funcional confirmado.

Não considero necessário adicionar esse teste antes do merge.

Permanece também o finding conhecido de `deepmerge-ts` no `npm audit`, sem
mudança em relação às fases anteriores.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 68/68 |
| KEY1–KEY11 | PASS |
| Regressão completa | PASS |
| Smoke com `API_KEY` somente no `.env` | PASS |
| Smoke sem `API_KEY` | PASS — aplicação recusou iniciar |
| CI | PASS — `33485507561` |
| `npm audit` | FAIL — finding conhecido |

## 8. Decisão de merge

**PODE FAZER MERGE**

A autenticação por API key está coerente com a arquitetura atual, não altera o
núcleo do processamento e mantém a regressão completa verde.

O `AUTH-001` foi descartado com evidência real de bootstrap, então não existe
bloqueio pendente para a Fase 2.3.

## 9. Próximo passo

Versionar esta review na branch:

```text
feat/api-key-auth
```

Depois:

```text
push
→ CI da branch
→ merge --ff-only em main
→ push main
→ CI de main
```

Se a CI de `main` permanecer verde, encerrar formalmente a Fase 2.3 e seguir
para a próxima slice planejada.

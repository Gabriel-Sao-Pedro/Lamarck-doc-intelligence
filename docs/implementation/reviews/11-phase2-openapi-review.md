# 11 — Review — Swagger / OpenAPI

## 1. Resultado

**APROVADO PARA MERGE**

A Fase 2.4 ficou dentro do escopo definido: documentou o contrato HTTP já
existente sem alterar regras de negócio, processing, storage, Prisma ou o
comportamento da autenticação por API key.

A documentação foi validada tanto pelo Swagger UI quanto pelo documento OpenAPI
JSON, e a regressão completa permaneceu verde.

## 2. Estado revisado

- branch: `feat/openapi`
- HEAD: `a48a472a9e9cc8bb3d15d2600d68791fcc9dbc5a`
- CI: `33489017555` — `SUCCESS`
- unit: `15/15`
- E2E: `77/77`
- novos E2E: `9` (`OPENAPI1` a `OPENAPI9`)
- `OPENAPI10`: regressão completa, não um décimo teste dedicado

Nenhuma migration foi criada.

A única dependência nova foi:

```text
@nestjs/swagger@12.0.1
```

compatível com a versão atual do NestJS e sem novo finding no audit.

## 3. O que eu conferi

Revisei o estado informado para:

- Swagger UI em `/docs`;
- OpenAPI JSON em `/docs-json`;
- metadados da API;
- `POST /documents`;
- `GET /documents`;
- `GET /documents/:id`;
- security scheme de `X-API-Key`;
- multipart e arquivo `binary`;
- paginação e filtro por status;
- parâmetro UUID;
- privacidade do schema gerado;
- exclusão de `GET /` da documentação de negócio;
- ausência de mudança em processing;
- ausência de mudança em storage;
- ausência de mudança em Prisma;
- regressão de autenticação;
- regressão completa;
- README;
- relatório 011;
- audit;
- CI.

## 4. Findings confirmados

**Nenhum finding funcional, arquitetural ou documental confirmado.**

O problema observado na primeira execução local da suíte E2E não foi causado
pela implementação de OpenAPI.

A causa foi um processo `node dist/main.js` deixado ativo pelo smoke test
manual, com worker de processamento habilitado, disputando jobs com os testes.

Depois de:

```text
encerrar o processo órfão
→ limpar o banco de teste
→ executar novamente a suíte
```

a regressão passou com:

```text
77/77
```

A CI também passou em ambiente limpo, o que reforça que não se tratava de
regressão no código.

## 5. Decisões técnicas relevantes

### Endpoints de documentação

Foram usados:

```text
GET /docs
GET /docs-json
```

Os dois permanecem públicos.

Isso não ignora a autenticação das operações de negócio: o OpenAPI declara o
security scheme e as rotas de documentos continuam protegidas pelo
`ApiKeyGuard`.

### API key

O documento OpenAPI descreve a autenticação atual como:

```text
type: apiKey
in: header
name: X-API-Key
```

Não foi introduzido Bearer, JWT ou OAuth.

### GET /

O endpoint raiz foi excluído da documentação OpenAPI porque continua sendo
apenas smoke/health e não faz parte do contrato de negócio.

O endpoint continua existindo em runtime.

### Upload

O `POST /documents` foi documentado como:

```text
multipart/form-data
file:
  type: string
  format: binary
```

mantendo JPEG/JPG, PNG e PDF e o limite atual de 10 MB.

A documentação não altera o interceptor, a validação por assinatura, a
deduplicação ou o processamento.

### Listagem

O `GET /documents` documenta:

- `page`;
- `pageSize`;
- `status`;
- defaults atuais;
- limite atual;
- enum compatível com o runtime.

### Consulta individual

O `GET /documents/:id` documenta `id` como parâmetro de path em formato UUID.

### Privacidade

O documento gerado não expõe:

- valor de API key;
- `storageKey`;
- `sha256`;
- `claimToken`;
- `ProcessingJob`;
- `ProcessingRun`;
- PII indevida.

## 6. Riscos não bloqueantes

O smoke test manual deixou um processo órfão no ambiente Windows porque o
comando usado inicialmente não encerrou o processo como esperado.

Isso não é um problema da aplicação, mas vale manter cuidado ao executar smoke
tests locais que iniciem o worker, principalmente antes de rodar a suíte E2E
contra o mesmo banco.

Não considero necessário alterar código ou testes por causa disso nesta fase.

Permanece também o finding conhecido de `deepmerge-ts` no `npm audit`, sem
finding novo introduzido pelo Swagger.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 77/77 |
| OPENAPI1–OPENAPI9 | PASS |
| Regressão completa | PASS |
| Swagger UI | PASS |
| OpenAPI JSON | PASS |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido |
| `npm audit --omit=dev` | FAIL — mesmo finding |
| CI | PASS — `33489017555` |

## 8. Decisão de merge

**PODE FAZER MERGE**

A Fase 2.4 documenta o contrato atual sem alterar comportamento de negócio e
mantém todas as regressões verdes.

Não encontrei motivo técnico para abrir uma rodada de correção antes do merge.

## 9. Próximo passo

Versionar esta review na branch:

```text
feat/openapi
```

Depois:

```text
push
→ CI da branch
→ merge --ff-only em main
→ push main
→ CI de main
```

Se a CI de `main` continuar verde, encerrar formalmente a Fase 2.4.

Depois disso, antes de iniciar a Parte 3, fazer o fechamento da Fase 2 e repetir
a auditoria de pontuação com a mesma régua usada anteriormente.

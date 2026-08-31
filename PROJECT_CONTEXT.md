# Lamarck DOC Intelligence — Contexto Compartilhado do Projeto

> Documento operacional compartilhado entre Claude e Codex.
> Resume decisões já tomadas pelo responsável pelo projeto.
> Não substitui `docs/specification.md`, `docs/architecture.md` nem ADRs.
> Em caso de conflito com documentos humanos de especificação/arquitetura, pare e peça confirmação.

## 1. Objetivo

Construir a trilha de back-end do desafio DOC Intelligence.

A entrega prioriza:
- arquitetura e modularidade;
- rastreabilidade das decisões;
- uso controlado de agentes de IA;
- especificação antes da implementação;
- uma fatia vertical honesta antes de ampliar o produto.

Nome do projeto: `Lamarck-doc-intelligence`.

## 2. Stack definida

- TypeScript
- Node.js
- NestJS
- Prisma ORM
- PostgreSQL
- Docker Compose
- API REST
- npm

Modelo de desenvolvimento:
- aplicação NestJS roda localmente via npm;
- PostgreSQL roda via Docker Compose.

## 3. Tipo documental inicial

A Fase 1 usará um único tipo documental fictício:

`IDENTITY_DOCUMENT`

Campos obrigatórios:
- `fullName`
- `parentage`
- `birthDate`
- `documentNumber`
- `issuingAuthority`

Somente documentos fictícios podem ser usados em testes e exemplos.

## 4. Upload

Fase 1 aceita:
- JPG
- JPEG
- PNG

Limite máximo:
- 10 MB

Fase 2 adiciona:
- PDF

Endpoint previsto:

`POST /documents`

Fluxo esperado:
1. receber upload multipart;
2. validar tamanho;
3. validar tipo/conteúdo real, não apenas extensão;
4. calcular SHA-256 dos bytes recebidos;
5. verificar duplicidade binária exata;
6. armazenar o documento original;
7. persistir metadata;
8. criar job de processamento;
9. responder sem aguardar o processamento documental.

Resposta HTTP:
- `202 Accepted` para documento novo;
- decisão atual do projeto: também usar `202 Accepted` para duplicado exato, retornando a referência já existente.

Essa decisão de resposta para duplicados é intencional e pode ser revisitada por ADR/implementation note.

## 5. Deduplicação

Fase 1:
- SHA-256 dos bytes crus do arquivo.

Se o hash já existir:
- não criar segundo documento;
- não criar segundo job;
- retornar referência do documento existente.

Limitação conhecida:
SHA-256 não identifica o mesmo documento físico quando ele é:
- fotografado novamente;
- recomprimido;
- redimensionado;
- regenerado como PDF;
- alterado em nível de bytes.

Deduplicação perceptual/semântica não faz parte da Fase 1.

## 6. Processamento assíncrono

O processamento deve ser assíncrono.

Motivo:
o provider multimodal do cenário-alvo pode levar de 5 a 40 segundos e pode falhar ou deixar de responder.

Fila na Fase 1:
- PostgreSQL-backed persistent job queue.

Não adicionar na Fase 1:
- Redis
- RabbitMQ
- Kafka
- SQS

A implementação deve impedir que dois workers processem o mesmo job simultaneamente.

O projeto possui material de apoio de concorrência PostgreSQL para:
- transações;
- row locking;
- `FOR UPDATE SKIP LOCKED`;
- transações curtas;
- prevenção de deadlocks;
- claim atômico de jobs.

## 7. Máquina de estados

Estados válidos:
- `RECEIVED`
- `PROCESSING`
- `RETRYING`
- `COMPLETED`
- `NEEDS_REVIEW`
- `FAILED`

Transições inicialmente permitidas:
- `RECEIVED -> PROCESSING`
- `PROCESSING -> COMPLETED`
- `PROCESSING -> NEEDS_REVIEW`
- `PROCESSING -> RETRYING`
- `RETRYING -> PROCESSING`
- `RETRYING -> FAILED`

Não introduzir novas transições silenciosamente.

## 8. Política de retry

Máximo:
- 3 tentativas totais, incluindo a primeira.

Falha técnica/provider:
- retry.

Inconsistência semântica:
- `NEEDS_REVIEW`.

Após a terceira falha técnica:
- `FAILED`.

Não manter lock de banco enquanto aguarda provider externo.

## 9. Fronteira de inteligência documental

A aplicação deve depender de uma abstração como:

`DocumentIntelligenceProvider`

Fase 1:
- `FakeDocumentIntelligenceProvider`

O fake deve suportar cenários controlados:
- sucesso;
- inconsistência semântica;
- falha técnica.

Provider multimodal real fica para a Fase 3.

## 10. Validação

Duas etapas:

### Check 1 — determinístico
Validar:
- campos obrigatórios;
- tipos;
- formatos;
- validade estrutural.

### Check 2 — verificação contra o documento
Verificar se os valores extraídos são sustentados pelo documento.

Somente se os dois checks passarem:
- `COMPLETED`.

Caso contrário:
- `NEEDS_REVIEW`.

Campo preenchido não significa campo correto.

## 11. Persistência

Entidades planejadas:
- `Document`
- `ProcessingJob`
- `ProcessingRun`
- `DocumentResult`

`ProcessingRun` é histórico e imutável.

Cada execução deve preservar proveniência suficiente para explicar o resultado:
- provider;
- modelo;
- versão do modelo;
- identificador/versão/hash do prompt;
- versão do schema de saída;
- tentativa;
- status;
- timestamps de início/fim.

Reprocessamento cria nova execução.
Nunca sobrescrever runs antigos.

## 12. Storage

Usar uma fronteira como:

`DocumentStorage`

Fase 1:
- `LocalDocumentStorage`

PostgreSQL armazena metadata estruturada e `storageKey`.
Não armazenar o blob completo do documento no PostgreSQL.

O nome de arquivo fornecido pelo usuário nunca deve ser usado diretamente como path.

Evolução natural de produção:
- adapter de object storage/S3-compatible.

## 13. Segurança mínima

Nunca colocar em logs:
- conteúdo do documento;
- campos extraídos;
- nome da pessoa;
- número do documento;
- dados pessoais/sensíveis.

Também:
- tratar uploads como entrada não confiável;
- validar tipo real;
- limitar tamanho;
- manter `.env` e secrets fora do Git;
- usar somente documentos fictícios;
- gerar identificadores internos para storage;
- evitar path traversal;
- manter PostgreSQL e arquivos não públicos.

Autenticação completa não faz parte da Fase 1.

## 14. Fase 1 — vertical slice obrigatória

A Fase 1 deve ser entregável sozinha.

Fluxo obrigatório:

upload de imagem
-> validação
-> SHA-256
-> deduplicação
-> persistência do documento
-> persistência do job
-> retorno 202
-> worker faz claim atômico
-> fake provider
-> checks
-> ProcessingRun imutável
-> persistência do resultado
-> exposição via `GET /documents/:id`

Também exige:
- testes automatizados selecionados;
- build/lint/test executados;
- PostgreSQL reproduzível via Docker Compose;
- README reproduzível por terceiro.

## 15. Fase 2 — extensão planejada

Depois da Fase 1 estável:
- suporte a PDF;
- `GET /documents` com paginação/filtro;
- API key service-to-service mínima;
- OpenAPI/Swagger;
- hardening adicional de upload/segurança;
- testes mais amplos.

Stretch:
- `Idempotency-Key`.

A Fase 2 nunca deve desestabilizar a Fase 1.

## 16. Fase 3 — restante do produto-alvo

Pode adicionar:
- classificação real de tipo documental;
- sugestão de nome padronizado;
- adapter real de provider multimodal;
- fila de revisão humana;
- correção de campos;
- claim/lease de revisão;
- optimistic locking/versionamento com `409 Conflict`;
- trilha de auditoria das correções humanas;
- um segundo tipo documental para provar extensibilidade;
- endpoint explícito de reprocessamento;
- segurança service-to-service mais robusta;
- hardening operacional adicional.

A Fase 3 é secundária a uma entrega estável, testada e documentada.

## 17. Divisão de responsabilidades entre agentes

### Claude — dono principal
- fundação do projeto;
- wiring NestJS;
- fundação Prisma/Docker;
- ingestão/API;
- uploads;
- storage;
- SHA-256;
- deduplicação;
- recursos de Fase 2 ligados à API;
- OpenAPI;
- API key.

### Codex — dono principal
- módulo de processamento;
- job claiming;
- worker;
- state machine;
- retry;
- histórico de processamento;
- validação do resultado;
- review/concurrency da Fase 3 quando atribuído.

### Regra para contratos compartilhados
Nenhum agente pode alterar silenciosamente:
- modelos compartilhados do Prisma;
- enums compartilhados;
- contratos da API;
- state machine;
- interfaces cross-module;
- estratégia de migrations;
- DTOs compartilhados.

Se precisar alterar algo compartilhado:
1. explicar o problema;
2. propor alternativas;
3. parar e aguardar aprovação.

## 18. Revisão cruzada

Após implementação/push:
- Codex revisa mudanças de Claude;
- Claude revisa mudanças de Codex.

A primeira revisão é read-only.

Cada finding deve conter:
- severidade;
- arquivo/localização;
- problema;
- cenário de falha/reprodução;
- impacto;
- correção sugerida;
- indicação de confirmado vs hipótese.

Não fabricar defeitos para documentação.

## 19. Ordem de execução

Fluxo operacional:
1. especificar;
2. implementar;
3. subir branch;
4. rodar/observar testes e CI;
5. revisão cruzada;
6. documentar falhas reais;
7. corrigir;
8. rodar novamente;
9. merge após validação.

Testar após o primeiro push é intencional para preservar evidência real quando houver falha.
Nunca marcar PASS sem executar.

## 20. Documentos humanos

São de autoria/controle do responsável pelo projeto e não podem ser reescritos por agente sem autorização explícita:
- `docs/specification.md`
- `docs/architecture.md`
- ADRs em `docs/decisions/`
- carta de fechamento

Agentes podem:
- apontar contradições;
- fazer perguntas;
- sugerir mudanças.

Agentes não podem reescrever silenciosamente a história do projeto.

## 21. Rastreabilidade de IA

Todo uso de agente que afete materialmente o projeto deve permanecer rastreável.

Manter:
- arquivos de instrução dos agentes;
- skills de projeto;
- MCPs realmente usados;
- prompts completos e em ordem cronológica;
- relatórios de tarefas;
- erros reais dos agentes e como foram detectados/corrigidos.

Não reescrever prompts antigos para parecerem mais bonitos.

## 22. Condições de parada

Parar e pedir confirmação antes de:
- adicionar dependência estrutural;
- introduzir broker;
- trocar tecnologia de banco;
- mudar state machine;
- mudar contrato da API;
- alterar modelos Prisma compartilhados de outro agente;
- ampliar escopo da tarefa/fase;
- substituir uma decisão arquitetural documentada.

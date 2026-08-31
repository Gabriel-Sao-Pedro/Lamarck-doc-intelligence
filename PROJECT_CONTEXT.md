# Lamarck DOC Intelligence — Contexto do Projeto

> Contexto operacional usado pelo Claude durante a implementação.
> Este arquivo resume decisões já tomadas pelo responsável pelo projeto.
> Ele **não** substitui `docs/specification.md`, `docs/architecture.md` nem os ADRs.
> Se este arquivo conflitar com esses documentos humanos, pare e peça esclarecimento.

## 1. Objetivo

Construir a trilha de backend do desafio DOC Intelligence.

A entrega prioriza:
- arquitetura e modularidade;
- decisões rastreáveis;
- uso controlado de agentes de IA;
- especificação antes da implementação;
- uma vertical slice honesta antes de ampliar a cobertura do produto.

Nome do projeto: `Lamarck-doc-intelligence`.

## 2. Stack

- TypeScript
- Node.js
- NestJS
- Prisma ORM
- PostgreSQL
- Docker Compose
- REST API
- npm

Modelo de desenvolvimento:
- a aplicação NestJS roda localmente com npm.
- o PostgreSQL roda via Docker Compose.

## 3. Tipo de documento inicial

A Fase 1 usa um tipo de documento de identidade fictício:

`IDENTITY_DOCUMENT`

Campos obrigatórios:
- `fullName`
- `parentage`
- `birthDate`
- `documentNumber`
- `issuingAuthority`

Só documentos fictícios podem ser usados em testes e exemplos.

## 4. Upload

A Fase 1 aceita:
- JPG
- JPEG
- PNG

Tamanho máximo do arquivo:
- 10 MB

O limite de 10 MB precisa ser aplicado na fronteira do parser de upload
multipart, antes de aceitar um arquivo arbitrariamente grande em memória. A
validação de conteúdo/tipo continua acontecendo depois dessa checagem
inicial de limite.

A Fase 2 adiciona:
- PDF

Endpoint planejado:

`POST /documents`

Comportamento esperado:
1. receber o upload multipart;
2. aplicar o limite de tamanho do upload;
3. validar o conteúdo/tipo real, não só a extensão do arquivo;
4. calcular o SHA-256 sobre os bytes recebidos;
5. checar duplicação binária exata;
6. armazenar o documento original;
7. criar `Document` e `ProcessingJob` na mesma transação do PostgreSQL;
8. responder imediatamente sem esperar o processamento de inteligência.

Resposta HTTP:
- usar `202 Accepted` para um documento novo;
- decisão atual do projeto: também retornar `202 Accepted` para uma duplicata exata, devolvendo a referência do documento existente.

Essa decisão de resposta para duplicatas é intencional, mas pode ser revisitada depois por um ADR/nota de implementação.

## 5. Deduplicação

Fase 1:
- deduplicação exata por SHA-256 dos bytes crus.

Se o hash já existir:
- não criar um segundo documento;
- não criar um segundo job de processamento;
- retornar a referência do documento existente.

Limitação conhecida:
o SHA-256 não identifica o mesmo documento físico quando ele é:
- fotografado de novo;
- recomprimido;
- redimensionado;
- regenerado como PDF;
- alterado de qualquer outra forma em nível de bytes.

Detecção perceptual/semântica de duplicata não é Fase 1.

## 6. Processamento assíncrono

O processamento precisa ser assíncrono.

Motivo:
o provider multimodal externo no sistema-alvo pode levar de 5 a 40 segundos e pode falhar ou parar de responder.

Fila da Fase 1:
- fila de jobs persistida no PostgreSQL.

Não adicionar na Fase 1:
- Redis
- RabbitMQ
- Kafka
- SQS

`Document` e `ProcessingJob` são criados na mesma transação de banco para que
um documento não fique persistido em `RECEIVED` sem um job por causa de uma
escrita parcial no banco.

A implementação precisa impedir que dois workers processem o mesmo job ao mesmo tempo.

Fonte de verdade operacional do retry:
- `ProcessingJob.attemptCount`.

Registro histórico:
- cada tentativa iniciada cria um `ProcessingRun` com o mesmo número de tentativa.

Não derive o limite de retry contando linhas de `ProcessingRun`.

O claim do job deve ser curto e atômico:
- reivindicar o job;
- incrementar `attemptCount`;
- criar o `ProcessingRun` correspondente;
- atualizar o estado do documento de forma consistente;
- commitar antes de chamar o provider.

O projeto contém material de apoio de concorrência PostgreSQL voltado para:
- transações;
- row locking;
- `FOR UPDATE SKIP LOCKED`;
- transações curtas;
- prevenção de deadlock;
- claim atômico.

Leases expirados:
- nenhum reaper separado é necessário na Fase 1;
- a própria query de claim do worker também considera jobs cujo lease já expirou;
- quando um job parado é encontrado, a tentativa anterior é tratada como falha técnica;
- se ainda houver tentativas disponíveis, a transição é `PROCESSING -> RETRYING -> PROCESSING`;
- se o limite estiver esgotado, a transição é `PROCESSING -> RETRYING -> FAILED`;
- até algum worker fazer essa checagem, `Document.status` pode continuar mostrando `PROCESSING`, enquanto o lease expirado é o sinal operacional de que o job pode ser recuperado.

A duração do lease precisa ser maior que o timeout do provider mais uma margem de segurança.

Um worker que perdeu a posse do lease não pode persistir o resultado final
sem antes provar que seu claim ainda é válido.

## 7. State machine

Estados válidos:

- `RECEIVED`
- `PROCESSING`
- `RETRYING`
- `COMPLETED`
- `NEEDS_REVIEW`
- `FAILED`

Transições permitidas inicialmente:

- `RECEIVED -> PROCESSING`
- `PROCESSING -> COMPLETED`
- `PROCESSING -> NEEDS_REVIEW`
- `PROCESSING -> RETRYING`
- `RETRYING -> PROCESSING`
- `RETRYING -> FAILED`

Não introduza novas transições silenciosamente.

## 8. Política de retry

Máximo:
- 3 tentativas totais, incluindo a primeira.

Falha técnica/do provider:
- retry.

Inconsistência semântica:
- `NEEDS_REVIEW`.

Depois da terceira tentativa técnica falhada:
- `FAILED`.

A perda de um worker depois que uma tentativa já começou conta como falha
técnica para aquela tentativa.

Não segure um lock de banco enquanto espera o provider de inteligência externo.

## 9. Fronteira do provider de inteligência

A aplicação precisa depender de uma abstração como:

`DocumentIntelligenceProvider`

Implementação da Fase 1:
- `FakeDocumentIntelligenceProvider`

O fake deve suportar cenários controlados:
- sucesso;
- inconsistência semântica;
- falha técnica.

Um provider multimodal real é Fase 3.

## 10. Validação

Está planejada uma validação em duas etapas.

### Check 1 — determinístico
Validar:
- campos obrigatórios;
- tipos;
- formatos;
- validade estrutural.

### Check 2 — verificação do documento
Verificar se os valores extraídos são sustentados pelo documento.

Só quando os dois checks passarem:
- `COMPLETED`.

Caso contrário:
- `NEEDS_REVIEW`.

Um campo preenchido não é automaticamente um campo correto.

## 11. Persistência

Entidades planejadas:
- `Document`
- `ProcessingJob`
- `ProcessingRun`
- `DocumentResult`

`ProcessingRun` é histórico e imutável.

Uma execução de processamento deve preservar proveniência suficiente para explicar como um resultado foi produzido, incluindo:
- provider;
- modelo;
- versão do modelo;
- identificador/versão/hash do prompt;
- versão do schema de saída;
- tentativa;
- status;
- timestamps de início/fim.

Reprocessar cria uma nova execução.
Não sobrescreva execuções antigas.

## 12. Armazenamento de arquivos

Use uma fronteira como:

`DocumentStorage`

Fase 1:
- `LocalDocumentStorage`

O PostgreSQL guarda metadata estruturada e uma storage key.
Não armazene o blob completo do documento no PostgreSQL.

O nome de arquivo fornecido pelo usuário nunca deve ser usado diretamente como path no filesystem.

Evolução potencial em produção:
- adapter de object storage/compatível com S3.

## 13. Segurança mínima

Nunca coloque o seguinte em logs:
- conteúdo do documento;
- campos extraídos do documento;
- nome da pessoa;
- número do documento;
- dados sensíveis/pessoais.

Também:
- aplicar o limite de tamanho na fronteira do parser;
- tratar uploads como entrada não confiável;
- validar o tipo real do arquivo;
- aplicar o limite de tamanho;
- manter `.env` e secrets fora do Git;
- usar só documentos fictícios;
- usar identificadores de storage gerados internamente;
- evitar path traversal;
- manter PostgreSQL e arquivos armazenados não públicos.

Autenticação não está totalmente implementada na Fase 1.

## 14. Fase 1 — vertical slice obrigatória

A Fase 1 precisa ser entregável de forma independente.

Caminho obrigatório:

upload de imagem
-> validar
-> SHA-256
-> deduplicar
-> persistir documento e job de processamento de forma atômica
-> retornar 202
-> worker reivindica o job de forma atômica
-> fake provider
-> checks
-> processing run imutável
-> persistir resultado
-> expor o resultado via `GET /documents/:id`

A Fase 1 também exige:
- testes automatizados selecionados;
- build/lint/test passando;
- PostgreSQL reproduzível via Docker Compose;
- instruções de README que outra pessoa consiga seguir.

## 15. Fase 2 — extensão planejada

Depois que a Fase 1 estiver estável:

- suporte a PDF;
- `GET /documents` com paginação/filtro;
- API key mínima service-to-service;
- OpenAPI/Swagger;
- hardening adicional de upload/segurança;
- testes mais amplos.

Stretch, só se sobrar tempo:
- `Idempotency-Key`.

A Fase 2 nunca deve desestabilizar a Fase 1.

## 16. Fase 3 — restante do produto-alvo

A Fase 3 pode adicionar:

- classificação real do tipo de documento;
- sugestão de nome padronizado;
- adapter real de provider multimodal;
- fila de revisão humana;
- correção de campos extraídos;
- claim/lease de revisão;
- optimistic locking/versionamento e `409 Conflict`;
- trilha de auditoria das correções humanas;
- um segundo tipo de documento para provar extensibilidade;
- endpoint explícito de reprocessamento;
- segurança service-to-service mais forte e hardening operacional.

A Fase 3 é secundária a uma entrega estável, testada e documentada.

## 17. Ownership e revisão

O Claude é o agente principal de implementação para tarefas de backend
delegadas à IA, incluindo:

- foundation do projeto;
- NestJS/Prisma/Docker;
- ingestão/API;
- uploads e storage;
- SHA-256 e deduplicação;
- módulo de processamento;
- job claiming e worker;
- state machine e retries;
- histórico de processamento e validação de resultado;
- trabalho de fases seguintes quando explicitamente atribuído.

O responsável pelo projeto mantém autoridade final sobre:
- escopo;
- arquitetura;
- contratos compartilhados;
- state machine;
- contrato da API;
- migrations;
- aceite de mudanças;
- decisões de merge.

### Ownership do schema Prisma inicial

O Claude é dono da primeira versão completa de:
- `prisma/schema.prisma`;
- a migration inicial.

Esse primeiro schema precisa incluir:
- `Document`;
- `ProcessingJob`;
- `ProcessingRun`;
- `DocumentResult`;
- enums compartilhados exigidos pela state machine inicial.

### Regra de contrato compartilhado

O Claude não pode alterar silenciosamente:
- modelos compartilhados do Prisma;
- enums compartilhados;
- contratos da API;
- state machine;
- interfaces entre módulos;
- estratégia de migration;
- contratos de DTO compartilhados.

Se uma mudança compartilhada for necessária:
1. descrever o problema;
2. propor a menor mudança compatível;
3. parar e esperar aprovação humana.

Se uma correção começar a virar uma nova implementação, prefiro separar uma
nova tarefa e devolver a implementação ao Claude em vez de transformar a
revisão em uma segunda rodada de implementação.

## 18. Revisão humana

Mudanças relevantes de implementação são revisadas pelo responsável pelo
projeto antes do aceite final.

A revisão deve focar em:
- alinhamento com especificação/arquitetura;
- correção de regra de negócio;
- concorrência e transações;
- segurança e PII;
- contratos de API/compartilhados;
- testes e CI;
- riscos restantes.

Quem revisa pode pedir apoio técnico à IA, mas a decisão de aceitar/rejeitar
é humana.

Não fabrique defeitos para fins de documentação.


## 19. Ordem de implementação

Fluxo do projeto:

1. especificar;
2. implementar;
3. subir a branch;
4. rodar/observar testes e CI;
5. revisão humana;
6. documentar falhas reais;
7. corrigir;
8. rodar de novo;
9. merge só depois da validação.

Testar depois do push inicial é intencional, porque falhas reais devem ser
preservadas como evidência de engenharia quando acontecem.

Nunca marque algo como aprovado se não foi executado.

## 20. Documentos de propriedade humana

Estes são de propriedade do responsável pelo projeto e não podem ser reescritos por um agente sem autorização explícita:

- `docs/specification.md`
- `docs/architecture.md`
- ADRs em `docs/decisions/`
- carta de encerramento

Agentes podem:
- apontar contradições;
- fazer perguntas;
- propor emendas.

Agentes não podem reescrever a história silenciosamente.

## 21. Rastreabilidade de IA

Todo uso de agente que afete materialmente o projeto precisa continuar rastreável.

Manter:
- arquivos de instrução de agente;
- skills do projeto;
- configuração de MCP realmente usada;
- prompts completos e em ordem cronológica;
- relatórios de tarefa;
- erros reais da IA e como foram detectados/corrigidos.

Não reescreva prompts antigos para parecerem mais bonitos.

## 22. Condições de parada

Pare e pergunte antes de:
- adicionar dependências estruturais;
- introduzir um broker;
- trocar a tecnologia de banco;
- mudar a state machine;
- mudar o contrato da API;
- mudar modelos Prisma compartilhados sem aprovação;
- expandir além da fase/tarefa atribuída;
- substituir uma decisão arquitetural documentada.

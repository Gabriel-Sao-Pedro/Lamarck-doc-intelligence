# Lamarck DOC Intelligence — Arquitetura

## 1. Visão geral

Minha ideia é manter o projeto simples o suficiente para conseguir entregar uma
solução completa, mas organizado de uma forma que permita crescer depois.

Por isso, decidi começar com um monólito modular.

Isso significa que API, processamento, banco e integrações fazem parte do mesmo
projeto, mas cada responsabilidade fica separada em módulos.

Não pretendo começar com microserviços porque isso adicionaria deploy,
comunicação entre serviços e mais infraestrutura sem resolver um problema real
desta entrega.

A estrutura inicial será aproximadamente:

`Cliente -> API NestJS -> PostgreSQL -> Worker -> Provider de inteligência -> Resultado -> Consulta pela API`

---

## 2. Organização da aplicação

Pretendo separar a aplicação principalmente pelas responsabilidades do sistema.

Os módulos iniciais serão próximos de:

- Documents;
- Processing;
- Storage;
- Intelligence;
- Database.

Conforme o projeto crescer, outros módulos poderão aparecer, como Review.

A intenção é evitar colocar toda a lógica dentro de controllers ou services
muito grandes.

Cada parte deve ter uma responsabilidade clara.

---

## 3. Documents

O módulo de documentos será responsável principalmente pela entrada e consulta
dos documentos.

Ele deve cuidar de coisas como:

- receber uploads;
- validar o arquivo;
- calcular o hash;
- verificar duplicidade;
- registrar o documento;
- disponibilizar consultas.

O módulo não deve realizar diretamente o processamento de inteligência.

Depois que o documento for recebido, ele apenas deixa um trabalho pendente para
o módulo de processamento.

Isso ajuda a separar o recebimento do arquivo do trabalho mais demorado.

---

## 4. Processing

O módulo de processamento será responsável pelo ciclo de processamento do
documento.

Ele deve controlar:

- trabalhos pendentes;
- tentativas;
- mudança de estado;
- chamadas ao provider;
- validação do resultado;
- histórico das execuções.

O processamento acontecerá em segundo plano.

Na primeira versão, o worker poderá rodar dentro da própria aplicação NestJS,
como um componente separado da API.

Escolhi isso para reduzir a quantidade de processos que preciso configurar
nesta entrega.

Mesmo rodando junto inicialmente, quero manter o worker separado por código e
responsabilidade.

Dessa forma, se no futuro for necessário rodar vários workers separados da API,
a lógica principal não precisa ser reescrita.

---

## 5. Banco de dados

O PostgreSQL será usado para duas coisas:

1. guardar os dados da aplicação;
2. controlar os trabalhos de processamento pendentes.

Não pretendo adicionar outro sistema de fila na primeira versão.

As principais entidades serão:

### Document

Representa o documento recebido.

Deve guardar informações como:

- identificador;
- hash;
- tipo;
- estado atual;
- chave usada para encontrar o arquivo;
- data de criação.

O conteúdo completo do arquivo não será salvo no banco.

### ProcessingJob

Representa um processamento que ainda precisa ser executado ou continuado.

Ele será usado pelo worker para saber quais trabalhos estão disponíveis.

Também poderá guardar informações necessárias para controlar tentativas e
evitar que dois workers processem o mesmo job.

### ProcessingRun

Representa uma execução do processamento.

Quero manter esses registros porque o processamento pode mudar ao longo do
tempo.

Por exemplo, um documento pode ser processado hoje com uma versão de prompt e
depois ser processado novamente com outra.

Em vez de sobrescrever a execução anterior, será criado um novo
`ProcessingRun`.

### DocumentResult

Representa os dados extraídos do documento.

Ele deve estar relacionado à execução que produziu aquele resultado.

---

## 6. Como um documento entra no sistema

O fluxo inicial será:

1. a API recebe o arquivo;
2. valida tamanho e tipo;
3. calcula SHA-256;
4. verifica se o conteúdo já existe;
5. armazena o arquivo com uma chave interna única;
6. tenta criar o registro do documento e o job;

A criação de `Document` e `ProcessingJob` deve acontecer na mesma transação. Se a transação falhar, nenhum dos dois registros deve permanecer persistido.
7. retorna `202 Accepted`.

O processamento continua depois dessa resposta.

Isso evita que a API fique aguardando uma chamada de inteligência que pode
demorar vários segundos.

---

## 7. Deduplicação e concorrência

Não quero depender somente de uma consulta como:

"esse hash já existe?"

porque existe a possibilidade de duas requisições iguais chegarem praticamente
ao mesmo tempo.

As duas poderiam consultar o banco antes de qualquer uma ter criado o registro.

Por isso, além da verificação na aplicação, o hash terá uma restrição de
unicidade no banco.

Assim, o PostgreSQL também funciona como última proteção contra duplicação.

Se duas requisições iguais chegarem ao mesmo tempo, as duas ainda podem chegar
a salvar temporariamente seus arquivos antes da disputa ser resolvida no banco.

Apenas uma delas poderá criar o `Document`.

A requisição que perder essa disputa deverá:

- usar o documento já existente;
- remover o arquivo que ela própria acabou de salvar;
- não criar outro job.

Essa remoção faz parte da mesma estratégia de compensação usada quando o banco
falha depois do arquivo ter sido salvo.

Ainda pode existir um arquivo órfão se o processo cair exatamente entre essas
operações. Considero esse risco aceitável para esta entrega e deixo uma limpeza
de órfãos como evolução futura.

---

## 8. Armazenamento dos arquivos

O armazenamento do arquivo ficará atrás de uma abstração.

A ideia é ter algo equivalente a:

`DocumentStorage`

A primeira implementação será local:

`LocalDocumentStorage`

O restante da aplicação não precisa saber exatamente onde o arquivo está sendo
salvo.

Isso permite trocar o armazenamento local por S3 ou outro serviço no futuro
sem espalhar essa mudança pelo sistema inteiro.

O nome original enviado pelo usuário não será usado diretamente como caminho.

O sistema criará sua própria chave de armazenamento.

---

## 9. Arquivo salvo e banco falhou

Sistema de arquivos e PostgreSQL não participam da mesma transação.

Por isso, pode acontecer de um arquivo ser salvo e a operação seguinte no banco
não conseguir ser concluída.

Na primeira versão pretendo resolver isso com uma compensação simples:

- salvar o arquivo;
- tentar persistir o documento e o job;
- se a persistência falhar, tentar remover o arquivo que acabou de ser salvo.

A mesma compensação vale quando duas requisições iguais passam pela verificação
inicial e uma delas perde a corrida na restrição única de hash.

Nesse caso, a requisição perdedora remove somente o arquivo que ela própria
criou e retorna o documento já existente.

Ainda existe uma janela pequena em que o processo pode cair antes da limpeza e
deixar um arquivo órfão.

Considero aceitável para esta entrega.

Em produção, eu adicionaria uma rotina de limpeza e reconciliação entre
storage e banco.

---

## 10. Worker e concorrência

Mais de um worker pode existir no futuro.

Por isso, desde o início quero evitar que dois workers consigam pegar o mesmo
trabalho.

O PostgreSQL será responsável por coordenar isso.

A ideia é que um worker consiga marcar um trabalho como seu de forma atômica.

Os outros workers devem ignorar aquele trabalho e procurar outro.

Pretendo usar o mecanismo de locking do PostgreSQL para isso, com uma estratégia
baseada em:

`FOR UPDATE SKIP LOCKED`

O ponto mais importante não é apenas usar o lock.

O lock deve existir apenas durante o momento em que o worker pega o trabalho.

Depois disso a transação é encerrada.

O sistema NÃO deve manter uma transação do banco aberta enquanto espera a IA
responder.

Uma chamada ao provider pode levar muitos segundos, então segurar o banco
durante esse período criaria um problema desnecessário.

---

## 11. Recuperação de worker e lease

Também preciso considerar que um worker pode pegar um trabalho e cair antes de
terminar.

Por isso, o job poderá guardar informações como:

- quem pegou o trabalho;
- quando ele foi pego;
- até quando aquele claim é considerado válido.

O claim terá um tempo de validade, ou lease.

Quando um worker realmente inicia uma tentativa de processamento, essa
tentativa passa a contar dentro do limite de três.

Se o worker desaparecer e o lease expirar, considero aquela tentativa como uma
falha técnica.

Ela consome uma das três tentativas e outro worker poderá recuperar o job.

Escolhi contar a tentativa perdida porque, depois que o worker começou o
processamento, não tenho como garantir que nenhuma chamada ao provider chegou a
acontecer. Também não quero permitir reprocessamentos infinitos em caso de
quedas repetidas.

Para evitar que um processamento normal seja considerado morto apenas porque o
provider é lento, o tempo de lease deverá ser maior que o timeout configurado
para a chamada externa, com uma margem de segurança.

Na primeira versão não pretendo criar um sistema complexo de heartbeat.

Se um worker antigo voltar depois de perder seu lease, ele não deve conseguir
finalizar o job livremente. A atualização final deve confirmar que aquele
worker/claim ainda é o proprietário válido antes de gravar o resultado.


### Fencing do claim

Depois da implementação da Fase 1, essa proteção ficou mais concreta.

Cada claim válido recebe um `claimToken` novo, gerado no momento em que o worker
pega o job. Esse token representa aquela posse específica do trabalho.

Quando o processamento termina, a finalização não confia apenas no `documentId`
ou em quem era o worker. Ela também precisa confirmar que o `claimToken`
continua sendo o token atual do job.

A ideia é evitar este cenário:

`worker A pega o job -> lease expira -> worker B recupera -> worker A volta atrasado`

Sem fencing, o worker A ainda poderia tentar gravar um resultado depois de já
ter perdido a posse.

Com o token:

`claim antigo != claim atual -> finalização rejeitada`

O token pertence ao estado operacional de `ProcessingJob`. O `ProcessingRun`
continua sendo histórico da tentativa e não vira a fonte de verdade para saber
quem pode finalizar o job.

Essa decisão está detalhada no ADR-007.

---

## 12. Estados

O status do documento não poderá ser alterado livremente.

As mudanças deverão passar por uma regra central.

Estados:

`RECEIVED`

`PROCESSING`

`RETRYING`

`COMPLETED`

`NEEDS_REVIEW`

`FAILED`

As transições aceitas inicialmente serão:

`RECEIVED -> PROCESSING`

`PROCESSING -> COMPLETED`

`PROCESSING -> NEEDS_REVIEW`

`PROCESSING -> RETRYING`

`RETRYING -> PROCESSING`

`RETRYING -> FAILED`

Se alguma parte tentar fazer uma transição que não existe, a operação deverá
ser rejeitada.

Preferi centralizar isso para evitar regras diferentes em vários lugares da
aplicação.

---

## 13. Tentativas

Uma execução poderá ter no máximo três tentativas no total.

Cada tentativa deve ficar registrada.

Um erro técnico poderá gerar outra tentativa.

Exemplos:

- timeout;
- serviço indisponível;
- erro temporário;
- falha de comunicação;
- perda do worker depois que a tentativa já começou.

Já uma inconsistência no conteúdo não será tratada da mesma forma.

Nesse caso, o resultado deverá seguir para:

`NEEDS_REVIEW`

A ideia é separar:

"não consegui concluir tecnicamente o processamento"

de:

"consegui processar, mas não confio no resultado".

---

## 14. Provider de inteligência

A aplicação não deverá conhecer diretamente um fornecedor específico de IA.

Pretendo criar uma interface semelhante a:

`DocumentIntelligenceProvider`

O módulo de processamento fala com essa interface.

Na primeira fase haverá:

`FakeDocumentIntelligenceProvider`

Ele poderá devolver cenários controlados para que eu consiga testar:

- sucesso;
- inconsistência;
- falha técnica.

Mais tarde será possível criar, por exemplo:

`RealMultimodalDocumentIntelligenceProvider`

sem alterar a regra principal de processamento.

---

## 15. Validação do resultado

A validação será separada em duas ideias.

A primeira verifica se a resposta possui a estrutura que espero.

Por exemplo:

- campo obrigatório presente;
- data em formato válido;
- valores com tipo correto.

A segunda representa uma verificação do conteúdo contra o documento.

Como a primeira fase utiliza um provider falso, essa verificação também será
simulada.

Não quero que a implementação pareça realizar uma análise visual real quando
isso ainda não está acontecendo.

Quando for utilizado um provider multimodal real, essa etapa poderá realmente
comparar a informação extraída com o documento.

---

## 16. Histórico

Um dos pontos que considero importantes é conseguir entender futuramente como
um resultado foi produzido.

Por isso pretendo registrar no `ProcessingRun`, quando aplicável:

- provider;
- modelo;
- versão do modelo;
- prompt ou versão do prompt;
- versão do formato esperado;
- tentativa;
- início;
- fim;
- resultado da execução.

Isso também ajuda quando alguma mudança futura piorar ou melhorar a extração.

Será possível comparar execuções em vez de perder o resultado anterior.

---

## 17. Resultado flexível, mas validado

Os tipos de documento podem ter campos diferentes.

Por isso não pretendo criar uma tabela completamente diferente para cada tipo
de documento logo no início.

O resultado poderá guardar os dados extraídos em uma estrutura flexível no
PostgreSQL.

Mesmo assim, a aplicação deve validar esses dados antes de persistir um
resultado considerado válido.

Ou seja:

armazenamento flexível não significa aceitar qualquer estrutura.

---

## 18. Consulta

A consulta individual será:

`GET /documents/:id`

Ela deverá reunir as informações necessárias para o consumidor sem expor
detalhes internos.

O consumidor poderá saber:

- qual é o documento;
- estado atual;
- tipo identificado;
- resultado disponível;
- se precisa de revisão.

Ele não precisa saber:

- caminho físico do arquivo;
- detalhes internos do worker;
- locks;
- informações sensíveis de infraestrutura.

---

## 19. Revisão humana

A revisão humana não é necessária para a primeira vertical slice, mas quero
deixar espaço para ela na arquitetura.

Na Fase 3, documentos em:

`NEEDS_REVIEW`

poderão aparecer em uma fila de revisão.

Como duas pessoas podem abrir essa fila ao mesmo tempo, pretendo controlar quem
está revisando cada item.

Além disso, a atualização deverá considerar uma versão do registro.

Se duas pessoas tentarem salvar alterações sobre a mesma versão, uma delas
deverá receber conflito em vez de sobrescrever silenciosamente o trabalho da
outra.

Também quero manter:

- resultado original da IA;
- correção humana;
- momento da correção;
- responsável;
- versão.

O resultado original não deve simplesmente desaparecer.

---

## 20. Segurança

A arquitetura assume que os documentos podem conter dados pessoais.

Por isso:

- arquivos não serão públicos;
- caminhos internos não serão retornados pela API;
- nomes enviados pelo usuário não serão usados como paths;
- conteúdo de documento não irá para logs;
- dados extraídos não irão para logs;
- secrets ficam fora do Git;
- testes usam apenas dados fictícios.

A API será considerada destinada a sistemas internos.

Na Fase 2 pretendo adicionar uma API key simples para representar essa
comunicação service-to-service.

Uma solução de identidade corporativa completa não faz parte desta entrega.

---

## 21. Logs

Quero ter logs suficientes para entender o funcionamento do sistema sem colocar
dados pessoais neles.

Exemplos aceitáveis:

- `documentId`;
- `processingRunId`;
- status;
- tentativa;
- duração;
- tipo de erro técnico.

Exemplos que não quero registrar:

- nome extraído;
- número do documento;
- conteúdo do arquivo;
- resposta completa da IA contendo informações pessoais.

---

## 22. Estrutura aproximada do código

Não quero congelar nomes de todas as pastas antes de começar a implementação,
mas espero algo próximo de:

```text
src/
├── documents/
├── processing/
├── intelligence/
├── storage/
├── database/
└── common/
```

Depois poderão aparecer módulos como:

```text
src/
└── reviews/
```

A estrutura poderá mudar um pouco durante a implementação se aparecer uma forma
mais simples de organizar o código.

Se a mudança tiver impacto arquitetural, ela será documentada.

---

## 23. Execução inicial

Na primeira versão teremos:

`Aplicação NestJS + PostgreSQL em Docker`

A API e o worker poderão rodar inicialmente no mesmo processo da aplicação.

Isso foi escolhido por simplicidade.

Mesmo assim, os dois terão responsabilidades separadas no código.

Uma evolução possível seria executar:

`API`

e

`Worker`

como processos separados utilizando o mesmo banco.

Não considero necessário fazer essa separação agora.

---

## 24. Escala

O volume inicial apresentado no desafio não me parece justificar uma
arquitetura distribuída.

Por isso escolhi começar com PostgreSQL e um worker simples.

Se o volume crescer muito, os primeiros pontos que eu observaria seriam:

- quantidade de jobs pendentes;
- tempo médio de processamento;
- quantidade de workers;
- conexões com o banco;
- chamadas simultâneas ao provider;
- custo da IA;
- armazenamento dos documentos.

Se PostgreSQL começar a se tornar um gargalo como fila, aí faria sentido
considerar um broker dedicado.

Essa mudança não precisa existir antes que o problema realmente apareça.

---

## 25. O que provavelmente mudaria primeiro em produção

Se este projeto fosse colocado em produção, algumas escolhas desta entrega
mudariam.

Provavelmente eu substituiria:

`LocalDocumentStorage -> object storage`

Também separaria:

`API -> processo`

e

`Worker -> processo`

Dependendo do volume, poderia substituir a fila em PostgreSQL por um sistema
específico para mensageria.

Também seriam necessários pontos como:

- autenticação corporativa;
- métricas;
- alertas;
- política de retenção;
- backup;
- criptografia;
- controle de acesso;
- gerenciamento de secrets.

Não pretendo implementar tudo isso no desafio porque seria uma quantidade de
infraestrutura desproporcional ao que preciso demonstrar.

---

## 26. Uso de IA durante o desenvolvimento

No backend, mantive um fluxo simples: o Claude foi usado como agente de
implementação nas etapas em que houve geração ou alteração de código, e cada
slice passou por revisão antes de seguir para o merge.

O objetivo foi evitar mudanças grandes demais de uma vez e deixar claro o que
estava sendo validado em cada etapa.

O fluxo usado foi, em geral:

`definir escopo -> implementar -> testar -> revisar -> corrigir -> validar -> merge`

As partes compartilhadas não devem ser alteradas sem uma decisão anterior.

Exemplos:

- schema principal do banco;
- contratos entre módulos;
- enums;
- state machine;
- migrations.

Quando uma revisão encontrou um problema, a correção ficou separada da
implementação original e foi validada novamente antes do merge.

Esse processo foi especialmente importante em pontos de concorrência, retry,
lease e fencing, onde uma alteração aparentemente pequena poderia quebrar
invariantes do processamento.

---

## 27. Decisões que terão ADR

Algumas escolhas são importantes o suficiente para terem um registro separado.

Pretendo documentar pelo menos:

- processamento assíncrono;
- PostgreSQL como fila;
- armazenamento local atrás de uma interface;
- deduplicação com SHA-256;
- histórico imutável de processamento;
- resposta `202 Accepted` também para duplicados;
- fencing por `claimToken` em jobs controlados por lease.

Os ADRs terão uma explicação curta sobre:

- problema;
- decisão;
- alternativas consideradas;
- motivo;
- consequência;
- quando eu mudaria de ideia.

---

## 28. Princípio geral

A principal decisão desta arquitetura é evitar adicionar infraestrutura antes
de existir necessidade.

Quero que a primeira versão seja pequena o suficiente para terminar e entender,
mas organizada de forma que as decisões mais simples de hoje não impeçam uma
evolução futura.

Se durante a implementação alguma hipótese desta arquitetura se mostrar errada,
vou registrar a mudança em vez de esconder a diferença entre o que planejei e
o que realmente aconteceu.

---

## 29. Atualizações confirmadas depois da implementação

A arquitetura principal não mudou durante a Fase 1 e o começo da Fase 2, mas
alguns pontos ficaram mais concretos depois que o código e os testes foram
feitos.

### Fase 1

A vertical slice implementada confirmou o desenho principal:

`upload -> persistência -> job -> worker -> resultado -> consulta`

Também confirmou:

- PostgreSQL como fila operacional;
- claim curto com `FOR UPDATE SKIP LOCKED`;
- provider executado fora da transação;
- lease para recuperação;
- `claimToken` como fencing;
- `ProcessingRun` como histórico;
- storage local atrás de `DocumentStorage`;
- SHA-256 como deduplicação exata;
- `GET /documents/:id` como consulta do estado e resultado.

### Fase 2

A evolução da API continua compatível com a mesma arquitetura.

A listagem usa:

`GET /documents`

com paginação e filtro por status, sem carregar PII desnecessária.

O suporte a PDF também reaproveita o pipeline existente. O tipo físico do
arquivo é detectado pelo conteúdo, o SHA-256 continua sendo calculado sobre os
bytes crus e o documento segue para o mesmo `ProcessingJob`.

Isso significa que adicionar PDF não criou:

- nova fila;
- novo worker;
- novo modelo de persistência;
- nova state machine;
- nova infraestrutura.

A API key simples e OpenAPI continuam sendo incrementos de superfície de API,
não mudanças na arquitetura central.

### O que continua para uma fase posterior

Continuam planejados para depois:

- provider multimodal real;
- revisão humana operacional;
- claim/concorrência entre revisores;
- correção de campos;
- nome padronizado;
- segundo tipo documental;
- reprocessamento explícito.

Esses pontos podem exigir novos ADRs quando forem implementados, mas não mudam
as decisões centrais já adotadas.



### Limite de upload

O limite de 10 MB deve ser aplicado no parser multipart, antes de aceitar um arquivo arbitrariamente grande em memória.

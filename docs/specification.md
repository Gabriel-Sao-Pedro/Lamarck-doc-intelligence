# Lamarck DOC Intelligence — Especificação Inicial

## 1. Objetivo

O objetivo deste projeto é construir o backend de um sistema capaz de receber
documentos, processá-los e disponibilizar as informações extraídas para outros
sistemas internos.

O produto completo poderia receber documentos, identificar o tipo, extrair os
dados importantes, validar essas informações e encaminhar casos duvidosos para
revisão humana.

Para esta entrega, porém, preferi começar com uma parte menor e funcional do
problema. A ideia é primeiro fazer o fluxo principal funcionar de ponta a ponta
e depois adicionar as demais funcionalidades.

---

## 2. Escopo escolhido

Escolhi a trilha de backend.

Por isso, o foco do projeto será:

- receber documentos pela API;
- armazenar os arquivos e seus dados;
- processar os documentos;
- salvar o resultado;
- permitir consultar o processamento.

Não pretendo desenvolver uma interface gráfica nesta primeira entrega.

---

## 3. Tecnologias

Vou utilizar:

- TypeScript;
- Node.js;
- NestJS;
- Prisma;
- PostgreSQL;
- Docker Compose;
- API REST.

Escolhi essa stack principalmente porque já tenho familiaridade com ela e
porque ela permite organizar bem um backend sem adicionar complexidade
desnecessária.

O PostgreSQL ficará em Docker, enquanto a aplicação poderá rodar normalmente
com npm durante o desenvolvimento.

Também decidi manter o projeto como uma aplicação única, organizada em
módulos, em vez de começar com microserviços.

---

## 4. Como pretendo desenvolver

Dividi a entrega em três fases.

### Fase 1

Será a parte principal e obrigatória.

Ela deve provar que consigo:

`receber um documento -> salvar -> processar -> armazenar o resultado -> consultar`

### Fase 2

Depois que esse fluxo estiver funcionando, adicionarei algumas funcionalidades
que deixam a API mais próxima de um uso real.

### Fase 3

A última fase reúne funcionalidades mais próximas do produto completo, como
revisão humana e integração com um modelo real.

Minha prioridade é não deixar uma fase posterior quebrar o que já está
funcionando.

---

## 5. Documento usado inicialmente

Para não tentar suportar vários documentos ao mesmo tempo, a primeira versão
trabalhará apenas com um documento de identidade.

Tipo interno:

`IDENTITY_DOCUMENT`

Os dados que pretendo extrair são:

- nome completo;
- filiação;
- data de nascimento;
- número do documento;
- órgão emissor.

Os arquivos utilizados nos testes terão apenas informações fictícias.

A intenção aqui não é construir uma solução completa para todos os documentos,
mas mostrar que a estrutura pode ser ampliada depois.

---

## 6. Arquivos aceitos

Na primeira fase serão aceitos:

- JPG;
- JPEG;
- PNG.

O tamanho máximo será de 10 MB.

PDF será adicionado posteriormente, na Fase 2.

Não vou confiar apenas na extensão do arquivo. O backend também deverá validar
o conteúdo recebido para evitar aceitar um arquivo inválido apenas porque ele
termina em `.jpg` ou `.png`.

---

## 7. Envio de documentos

O endpoint principal será:

`POST /documents`

O arquivo será enviado utilizando `multipart/form-data`.

Quando um documento chegar, o sistema deverá:

1. verificar se o arquivo foi enviado corretamente;
2. validar tamanho e formato;
3. calcular um hash do arquivo;
4. verificar se aquele mesmo arquivo já foi recebido;
5. armazenar o documento;
6. registrar o documento no banco;
7. criar o processamento;
8. responder ao sistema que fez o envio.

O processamento do documento acontecerá depois da resposta da API.

Escolhi isso porque o serviço externo de inteligência pode demorar vários
segundos para responder. Não quero manter a requisição HTTP esperando todo esse
tempo.

---

## 8. Resposta do envio

O envio retornará:

`202 Accepted`

Para um documento novo, um exemplo de resposta seria:

```json
{
  "documentId": "uuid",
  "status": "RECEIVED",
  "deduplicated": false
}
```

Também decidi manter o `202 Accepted` quando o arquivo já existir.

Nesse caso, o sistema não cria outro documento. Ele retorna o identificador do
documento já existente, o estado atual desse documento e informa que o conteúdo
foi deduplicado:

```json
{
  "documentId": "uuid-do-documento-existente",
  "status": "COMPLETED",
  "deduplicated": true
}
```

O valor de `status` no caso duplicado representa o estado atual do documento
já existente. Portanto, ele pode ser `RECEIVED`, `PROCESSING`, `RETRYING`,
`COMPLETED`, `NEEDS_REVIEW` ou `FAILED`, dependendo do momento em que a
duplicata for recebida.

É uma escolha que simplifica o contrato do endpoint, mas reconheço que existe
um trade-off semântico e pretendo registrá-lo nas decisões do projeto.

---

## 9. Documentos duplicados

Para a primeira versão, vou considerar duplicado quando os bytes do arquivo
forem exatamente iguais.

Para isso será utilizado SHA-256.

Além de verificar o hash antes de criar o registro, quero garantir essa
unicidade também no banco de dados, porque duas requisições podem chegar quase
ao mesmo tempo.

Se o documento já existir:

- não será criado outro documento;
- o arquivo não será armazenado novamente;
- não será criado outro processamento;
- será retornado o documento já existente.

Essa solução não consegue perceber que duas fotos diferentes representam o
mesmo papel.

Por exemplo, fotografar novamente o mesmo documento provavelmente produzirá
outro hash.

Esse tipo de comparação mais inteligente poderá ser estudado no futuro, mas
não faz parte da primeira entrega.

---

## 10. Consulta

Inicialmente haverá:

`GET /documents/:id`

Esse endpoint deverá permitir consultar:

- o identificador do documento;
- o estado atual;
- o tipo;
- os dados extraídos, quando existirem;
- informações básicas sobre o processamento.

Detalhes internos, como o caminho físico onde o arquivo foi salvo, não devem
ser expostos pela API.

---

## 11. Processamento em segundo plano

O processamento não será realizado dentro da própria requisição de upload.

Depois que o documento for recebido, será criado um trabalho pendente para um
worker processar.

Escolhi esse modelo porque o serviço externo usado no produto pode demorar
entre alguns segundos e dezenas de segundos, além de poder falhar ou não
responder.

Assim, um problema no serviço de inteligência não precisa deixar a requisição
HTTP aberta por muito tempo.

---

## 12. Fila de processamento

Na primeira versão vou utilizar o próprio PostgreSQL para controlar os
processamentos pendentes.

Eu considerei utilizar Redis, RabbitMQ ou outro sistema de filas, mas não achei
necessário para o volume inicial do desafio.

O PostgreSQL já estará presente no projeto e consegue atender essa necessidade
sem adicionar outra infraestrutura.

Um ponto importante é garantir que dois workers não processem o mesmo documento
ao mesmo tempo.

Também não quero manter o banco bloqueado enquanto estiver esperando uma
resposta do serviço externo.

---

## 13. Estados do processamento

O documento poderá passar pelos seguintes estados:

`RECEIVED`

O documento foi recebido e está aguardando processamento.

`PROCESSING`

O processamento está acontecendo.

`RETRYING`

Ocorreu um problema técnico e haverá uma nova tentativa.

`COMPLETED`

O processamento terminou e o resultado foi considerado válido.

`NEEDS_REVIEW`

O processamento terminou, mas existe alguma inconsistência que precisa ser
revisada.

`FAILED`

O processamento falhou mesmo após as tentativas permitidas.

As mudanças de estado permitidas inicialmente serão:

`RECEIVED -> PROCESSING`

`PROCESSING -> COMPLETED`

`PROCESSING -> NEEDS_REVIEW`

`PROCESSING -> RETRYING`

`RETRYING -> PROCESSING`

`RETRYING -> FAILED`

A intenção é evitar que qualquer parte do sistema altere o status livremente e
gere estados impossíveis.

---

## 14. Tentativas em caso de erro

O sistema terá no máximo três tentativas no total.

Isso significa:

- primeira tentativa;
- segunda tentativa;
- terceira tentativa.

Não são três tentativas extras.

Quando ocorrer um problema técnico, como timeout ou indisponibilidade do
serviço externo, o sistema poderá tentar novamente.

Se continuar falhando depois da terceira tentativa, o documento ficará como:

`FAILED`

Já uma resposta tecnicamente válida, mas com informações inconsistentes, não
deve ficar sendo reenviada automaticamente para o modelo.

Nesse caso, o documento ficará como:

`NEEDS_REVIEW`

---

## 15. Serviço de inteligência

Não quero que o sistema fique preso a um fornecedor específico.

Por isso, haverá uma interface para representar o serviço responsável por
analisar os documentos.

Na primeira fase não vou integrar uma IA real.

Será utilizado um provider falso que consiga simular:

- processamento com sucesso;
- resultado inconsistente;
- erro técnico.

Isso permite testar todo o comportamento do sistema sem depender de uma API
externa, custo por chamada ou disponibilidade de terceiros.

A integração com um modelo multimodal real poderá ser feita na Fase 3.

---

## 16. Validação do resultado

Não quero considerar um processamento válido apenas porque todos os campos
vieram preenchidos.

Pretendo fazer duas verificações.

A primeira será uma validação mais simples, verificando campos obrigatórios,
tipos e formatos.

A segunda verificará se o resultado realmente faz sentido em relação ao
documento.

Como na primeira fase o provider será falso, essa segunda verificação também
será simulada.

Quero deixar isso explícito para não dar a impressão de que a aplicação está
realmente fazendo uma validação visual nessa etapa.

Se as verificações forem aprovadas:

`COMPLETED`

Caso exista alguma inconsistência:

`NEEDS_REVIEW`

---

## 17. Dados no banco

Inicialmente penso em quatro entidades principais:

- `Document`;
- `ProcessingJob`;
- `ProcessingRun`;
- `DocumentResult`.

A estrutura detalhada dessas entidades ficará no documento de arquitetura e
no schema do Prisma.

---

## 18. Histórico dos processamentos

Quero manter o histórico das execuções em vez de simplesmente sobrescrever o
resultado anterior.

Cada processamento será representado por um `ProcessingRun`.

Isso é importante porque, no produto real, o modelo utilizado, o prompt e suas
versões podem mudar.

Quando possível, quero registrar informações como:

- provider utilizado;
- modelo;
- versão do modelo;
- versão ou identificador do prompt;
- versão do formato esperado;
- número da tentativa;
- início e fim do processamento;
- resultado da execução.

Se um documento for processado novamente, será criada outra execução em vez de
apagar o histórico anterior.

---

## 19. Resultado extraído

O resultado ficará separado do documento original.

A ideia é salvar o tipo documental, a versão da estrutura utilizada e os dados
extraídos.

Mesmo que parte desses dados seja armazenada de forma flexível no banco, eles
deverão ser validados pela aplicação antes de serem considerados válidos.

---

## 20. Armazenamento dos arquivos

Na primeira versão, os documentos serão armazenados localmente.

Não vou salvar o arquivo inteiro dentro do PostgreSQL.

O banco guardará apenas informações sobre o documento e uma chave que permita
encontrar o arquivo armazenado.

Também não vou utilizar diretamente o nome enviado pelo usuário como caminho
do arquivo.

Além de ser inseguro, arquivos diferentes podem chegar com o mesmo nome.

No futuro, esse armazenamento local poderá ser substituído por S3 ou outro
object storage sem precisar mudar as regras principais do sistema.

---

## 21. Segurança

Mesmo sendo um projeto de demonstração, os documentos tratados poderiam conter
informações pessoais.

Por isso, alguns cuidados serão adotados desde o início.

Não pretendo registrar nos logs:

- conteúdo do documento;
- nome da pessoa;
- número do documento;
- dados extraídos.

Também serão usados apenas documentos fictícios nos testes.

Secrets e arquivos `.env` não serão enviados para o Git.

Uploads serão tratados como entradas não confiáveis e terão validação de
tamanho e formato.

O PostgreSQL e os arquivos armazenados também não deverão ficar publicamente
acessíveis.

Uma autenticação mais completa não faz parte da primeira fase.

---

## 22. Quando considero a Fase 1 pronta

A primeira fase estará pronta quando eu conseguir demonstrar o seguinte fluxo:

`upload`

→ validação

→ cálculo do hash

→ verificação de duplicidade

→ armazenamento

→ criação do documento no banco

→ criação do processamento

→ resposta `202`

→ worker processando

→ provider fake

→ validação do resultado

→ armazenamento do resultado

→ consulta através de `GET /documents/:id`

Também quero testar os cenários mais importantes:

- processamento com sucesso;
- upload inválido;
- documento duplicado;
- erro técnico e nova tentativa;
- falha após o limite de tentativas;
- resultado que precisa de revisão;
- tentativa de mudança inválida de estado.

Se houver tempo, também quero testar dois workers tentando buscar trabalho ao
mesmo tempo.

---

## 23. Fase 2

Depois da primeira versão funcionando, pretendo adicionar:

- suporte a PDF;
- listagem de documentos;
- paginação;
- filtro por status;
- autenticação simples com API key;
- documentação da API com Swagger/OpenAPI;
- mais validações;
- testes adicionais.

Se houver tempo, também posso avaliar suporte a `Idempotency-Key`.

---

## 24. Fase 3

A terceira fase reúne funcionalidades que deixam o sistema mais próximo do
produto completo.

Entre elas:

- classificar automaticamente o tipo do documento;
- sugerir um nome padronizado;
- integrar um modelo multimodal real;
- criar uma fila de revisão humana;
- permitir correção de campos;
- evitar que duas pessoas revisem o mesmo item sem controle;
- guardar histórico das correções;
- adicionar um segundo tipo documental;
- permitir reprocessamento;
- melhorar a segurança da comunicação entre sistemas.

A sugestão de nome do arquivo não deve incluir dados pessoais sem necessidade.

---

## 25. O que não pretendo fazer inicialmente

Na primeira fase não pretendo implementar:

- frontend;
- microserviços;
- Redis;
- RabbitMQ;
- Kafka;
- armazenamento real em S3;
- IA multimodal real;
- sistema completo de revisão humana;
- vários tipos documentais;
- OAuth;
- Kubernetes;
- deploy em cloud;
- infraestrutura de alta disponibilidade;
- observabilidade completa.

Esses pontos podem fazer sentido em um produto maior, mas adicionariam bastante
complexidade sem melhorar a demonstração principal desta entrega.

---

## 26. Prioridade

Minha ordem de prioridade será:

`Fase 1 -> Fase 2 -> Fase 3`

Se eu não conseguir terminar alguma funcionalidade, prefiro deixar isso
claramente documentado em vez de entregar algo incompleto como se estivesse
pronto.

---

## 27. Mudanças durante a implementação

Esta especificação representa minhas decisões antes de começar a programar.

Se alguma decisão precisar mudar durante a implementação, não quero simplesmente
reescrever este documento e fingir que sempre foi assim.

Vou registrar:

- o que estava planejado;
- o que mudou;
- por que mudou;
- qual foi o impacto.

Além da especificação, o projeto terá registros das principais decisões,
histórico de commits, prompts utilizados com os agentes e os problemas
encontrados durante implementação e testes.

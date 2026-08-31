# ADR-003 — Armazenamento local atrás de uma interface

## Status

Aceito

## Contexto

Os documentos recebidos precisam ser armazenados em algum lugar para que o
sistema consiga processá-los depois e, se necessário, consultá-los novamente.

Uma opção seria salvar o arquivo diretamente no PostgreSQL.

Outra seria já começar usando um serviço de object storage, como S3.

Para esta entrega, eu não quero adicionar uma infraestrutura externa sem
necessidade, mas também não quero espalhar pelo código a ideia de que os
arquivos sempre ficarão salvos no disco local.

---

## Decisão

Na primeira versão, os arquivos serão armazenados localmente.

Mesmo assim, o restante da aplicação não deve depender diretamente do sistema
de arquivos.

Pretendo criar uma abstração semelhante a:

`DocumentStorage`

E a primeira implementação será:

`LocalDocumentStorage`

A aplicação vai conversar com essa interface para operações como:

- salvar um arquivo;
- localizar um arquivo;
- remover um arquivo quando necessário.

Dessa forma, o restante do sistema não precisa saber se o documento está em um
diretório local, S3 ou outro serviço.

---

## Por que escolhi isso

Escolhi armazenamento local porque é a forma mais simples de deixar o projeto
executável sem adicionar credenciais, serviços externos ou configuração de
cloud.

Isso ajuda principalmente em dois pontos:

- facilita para quem clonar o projeto e quiser testar;
- reduz a quantidade de infraestrutura que preciso configurar nesta entrega.

Ao mesmo tempo, não quero que essa escolha temporária vire uma dependência
espalhada pelo sistema.

Por isso a interface de storage é importante.

Ela me permite começar simples sem impedir uma troca futura.

---

## Como os arquivos serão identificados

O nome original enviado pelo usuário não será usado diretamente como caminho do
arquivo.

Em vez disso, o sistema deve criar uma chave interna própria.

Essa chave será armazenada no banco como algo equivalente a:

`storageKey`

Com isso, evito problemas como:

- dois arquivos diferentes com o mesmo nome;
- nomes inválidos para o sistema operacional;
- tentativa de usar caminhos como parte do nome;
- exposição desnecessária de informações pessoais no nome físico do arquivo.

O nome original poderá ser guardado como metadado se houver necessidade, mas
não será usado como caminho de armazenamento.

---

## Relação com o banco

O arquivo completo não será salvo dentro do PostgreSQL.

O banco guardará apenas informações necessárias para localizar e entender o
documento, como:

- identificador;
- hash;
- tipo;
- status;
- storageKey;
- datas e metadados necessários.

O conteúdo binário fica no storage.

Escolhi separar essas responsabilidades porque o banco é mais adequado para os
dados estruturados da aplicação, enquanto os arquivos ficam em uma camada
própria.

---

## E se o arquivo for salvo e o banco falhar?

Sistema de arquivos e PostgreSQL não fazem parte da mesma transação.

Por isso existe uma situação em que:

1. o arquivo é salvo;
2. a operação no banco falha.

Nesse caso, pretendo fazer uma compensação simples:

- tentar remover o arquivo que acabou de ser criado.

A mesma ideia vale se duas requisições iguais salvarem seus arquivos e apenas
uma conseguir criar o documento por causa da restrição de hash.

A requisição que perder essa disputa deve remover somente o arquivo que ela
mesma criou.

Ainda existe uma pequena janela em que a aplicação pode cair antes dessa
limpeza e deixar um arquivo órfão.

Considero esse risco aceitável para esta entrega.

Em produção, eu adicionaria uma rotina de reconciliação ou limpeza de arquivos
órfãos.

---

## Alternativas consideradas

### Salvar o arquivo dentro do PostgreSQL

Teria a vantagem de manter arquivo e dados no mesmo sistema.

Não escolhi essa opção porque não preciso que o banco carregue também os
arquivos binários nesta entrega.

Prefiro deixar o PostgreSQL responsável pelos dados estruturados e o storage
responsável pelos documentos.

### Usar S3 desde o início

É uma opção mais próxima de produção e provavelmente seria minha escolha em um
ambiente real.

Não escolhi agora porque exigiria configuração externa, credenciais e mais
infraestrutura para uma entrega que precisa rodar localmente de forma simples.

### Usar diretamente o sistema de arquivos em todos os módulos

Seria mais rápido no começo.

Não escolhi porque isso espalharia detalhes de armazenamento pelo projeto e
dificultaria uma troca futura.

### Storage local atrás de uma interface

Foi a opção escolhida porque mantém o projeto simples agora e deixa uma troca
futura mais fácil.

---

## Consequências

Com essa decisão:

- o projeto roda localmente sem serviço externo de arquivos;
- preciso garantir que o diretório de storage não vá para o Git;
- o banco não guarda o arquivo completo;
- a aplicação precisa manter uma chave de storage;
- o código precisa tratar falhas entre storage e banco;
- trocar para S3 no futuro deve exigir principalmente um novo adapter, não uma
  reescrita das regras do sistema.

---

## Limitações

Armazenamento local não é uma boa solução para vários servidores compartilhando
os mesmos documentos.

Também não oferece sozinho recursos como:

- replicação;
- alta disponibilidade;
- versionamento;
- políticas de retenção;
- criptografia gerenciada;
- distribuição entre regiões.

Esses pontos não são necessários para a primeira entrega.

---

## Quando eu mudaria essa decisão

Eu mudaria para object storage quando o sistema precisasse rodar de forma
distribuída ou quando os requisitos de disponibilidade, retenção e segurança
deixassem o armazenamento local inadequado.

Nesse momento, eu esperaria conseguir manter a mesma interface
`DocumentStorage` e substituir principalmente a implementação.

# ADR-004 — Deduplicação com SHA-256

## Status

Aceito

## Contexto

É comum que o mesmo documento seja enviado mais de uma vez.

Se eu simplesmente aceitar todos os uploads como novos, o sistema pode:

- armazenar cópias desnecessárias;
- criar processamentos duplicados;
- gastar chamadas do provider sem necessidade;
- dificultar a consulta e o histórico.

Para a primeira versão, quero resolver o caso mais simples e mais seguro:
arquivos exatamente iguais.

---

## Decisão

Vou calcular o SHA-256 dos bytes recebidos no upload.

Esse hash será usado para identificar arquivos binariamente iguais.

Também haverá uma restrição de unicidade no banco para esse valor.

Assim, a deduplicação não depende apenas de uma consulta feita pela aplicação.

Se o mesmo arquivo já existir:

- não será criado outro `Document`;
- não será criado outro job;
- não será mantida uma segunda cópia do arquivo;
- a API retornará o documento já existente;
- a resposta indicará `deduplicated: true`.

---

## Por que escolhi isso

SHA-256 é simples, determinístico e suficiente para detectar arquivos
exatamente iguais.

Também é barato de calcular quando comparado ao custo de processar o documento
novamente com um modelo de inteligência.

A restrição única no banco é importante porque duas requisições iguais podem
chegar praticamente ao mesmo tempo.

Se eu fizesse apenas:

1. procurar o hash;
2. não encontrar;
3. criar o documento;

duas requisições poderiam passar pela etapa 2 antes de qualquer uma gravar.

A constraint do banco funciona como a proteção final contra essa corrida.

---

## O que acontece em uma corrida

Pode acontecer de duas requisições iguais:

1. calcularem o mesmo hash;
2. verificarem que ainda não existe registro;
3. salvarem temporariamente seus arquivos;
4. tentarem criar o mesmo documento.

Nesse caso, apenas uma deverá conseguir criar o registro por causa da
restrição de unicidade.

A outra requisição deve:

- reconhecer que perdeu a disputa;
- recuperar o documento que já foi criado;
- remover somente o arquivo temporário que ela própria salvou;
- retornar o documento existente.

Essa compensação evita manter uma segunda cópia desnecessária.

Ainda existe uma pequena possibilidade de arquivo órfão se o processo cair
antes dessa limpeza. Para esta entrega, considero esse risco aceitável.

---

## Alternativas consideradas

### Comparar pelo nome do arquivo

Não escolhi porque nomes não são confiáveis.

Dois arquivos diferentes podem ter o mesmo nome e o mesmo documento pode chegar
com nomes diferentes.

### Comparar tamanho do arquivo

Também não é suficiente.

Arquivos diferentes podem ter o mesmo tamanho.

### Hash perceptual de imagem

Poderia ajudar a detectar imagens visualmente parecidas mesmo quando os bytes
mudam.

Não escolhi para a primeira versão porque aumenta bastante a complexidade e
também pode gerar falsos positivos.

### Comparar os dados extraídos

Seria possível considerar dois documentos semelhantes depois do processamento.

Não quero usar isso para auto-merge nesta versão, porque dados extraídos podem
estar errados ou incompletos.

### SHA-256 dos bytes

Foi a opção escolhida porque resolve de forma simples e previsível o caso de
duplicação exata.

---

## Limitações

Essa decisão não identifica o mesmo documento quando o arquivo muda.

Por exemplo:

- uma nova foto do mesmo documento;
- imagem redimensionada;
- imagem recomprimida;
- rotação;
- conversão de PNG para JPG;
- PDF gerado a partir da mesma imagem.

Todos esses casos podem gerar hashes diferentes.

Por isso, SHA-256 deve ser entendido como:

"mesmo arquivo"

e não como:

"mesmo documento físico".

---

## Evolução futura

Se a duplicação de documentos visualmente iguais se tornar um problema real,
eu avaliaria uma segunda etapa de detecção.

Ela poderia combinar:

- hash perceptual;
- normalização visual;
- comparação de campos extraídos;
- regras de similaridade.

Mesmo assim, eu evitaria juntar registros automaticamente sem uma política bem
definida.

Um resultado parecido poderia ser tratado primeiro como:

`POSSIBLE_DUPLICATE`

ou equivalente, em vez de apagar ou unir informações automaticamente.

---

## Consequências

Com essa decisão:

- uploads exatamente iguais são reaproveitados;
- evitamos processamentos duplicados;
- reduzimos armazenamento desnecessário;
- reduzimos chamadas desnecessárias ao provider;
- precisamos tratar corrida de inserção;
- precisamos tratar compensação de arquivo temporário;
- documentos visualmente iguais ainda podem ser considerados diferentes.

---

## Quando eu mudaria essa decisão

Eu mudaria ou complementaria essa estratégia quando duplicatas não binárias
passassem a representar uma parte relevante dos uploads.

Até lá, prefiro uma regra simples, fácil de explicar e com baixo risco de
considerar dois documentos diferentes como se fossem o mesmo.

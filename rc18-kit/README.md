# Kit RC 18 — como medir as 12 dimensões com recursos do Google Cloud

O painel RC 18 só mostra o que existe no projeto. Parte das dimensões de qualidade da informação da
Resolução Conjunta nº 18/2025 (art. 2º, § 2º) tem fonte automática — regras de qualidade, descrições,
linhagem, uso. Outras dependem de evidência que a instituição produz: comparar o dado revisado com o
informado, registrar revisões autorizadas, testar a geração da informação fora da rotina.

Este kit mostra, com **dados sintéticos**, com que recurso do Google Cloud cada evidência é produzida e
como o painel a lê. Ele cria uma tabela de exemplo com tudo configurado e serve de modelo para as
tabelas reais.

> A Resolução não define métricas nem níveis mínimos por dimensão. Os limites usados nas regras deste
> kit (5%, 10 dias, 35 dias, 180 dias) são exemplos: cada instituição declara os seus. O painel mostra
> evidências técnicas e não atesta conformidade.

## Com que recurso cada dimensão é medida

| Inciso | Dimensão | Recurso do Google Cloud | O que o painel mostra |
| --- | --- | --- | --- |
| I | Acessibilidade | Knowledge Catalog: aspecto `contacts` na entrada da tabela (e `overview` para local, forma de pedir e prazos) | Tabelas do escopo com contatos |
| II | Acurácia | Dataplex: regras de qualidade com dimensão `ACCURACY` ou `VALIDITY` | Regras aprovadas |
| III | Adaptabilidade | BigQuery: tabela de controle dos testes de geração fora da rotina. Dataplex: regras com dimensão `ADAPTABILIDADE` | Regras aprovadas |
| IV | Clareza | BigQuery: descrições de tabelas e colunas. Knowledge Catalog: aspecto `overview` | Colunas com descrição |
| V | Comparabilidade | Knowledge Catalog: glossário de negócios, com termos vinculados às colunas. Dataplex: regras com dimensão `COMPARABILIDADE` | Tabelas com termo vinculado; regras aprovadas |
| VI | Completude | Dataplex: regras com dimensão `COMPLETENESS` ou `VOLUME` | Regras aprovadas |
| VII | Confiabilidade | BigQuery: snapshot de tabela com a versão informada. Dataplex: regras com dimensão `CONFIABILIDADE` | Regras aprovadas |
| VIII | Consistência | Dataplex: regras com dimensão `CONSISTENCY` ou `UNIQUENESS` | Regras aprovadas |
| IX | Integridade | BigQuery: hash por registro e tabela de revisões autorizadas. Dataplex: regras com dimensão `INTEGRIDADE` | Regras aprovadas |
| X | Rastreabilidade | Data Lineage API: origem registrada pelos jobs do BigQuery que gravam a tabela | Tabelas com origem registrada |
| XI | Relevância | Knowledge Catalog: aspecto `usage`, preenchido pelo catálogo | Tabelas com consultas em 30 dias |
| XII | Tempestividade | Dataplex: regras com dimensão `FRESHNESS` | Regras aprovadas |

A regra entra na dimensão pelo campo `dimension`. As dimensões personalizadas usam o nome da dimensão
da Resolução em maiúsculas e sem acento. Na visão **Qualidade por tabela** o painel lista cada regra
com o nome, a descrição e o resultado.

## O que o kit cria

| Recurso | Nome padrão | Para quê |
| --- | --- | --- |
| Dataset do BigQuery | `rc18_demo_origem` | Extração sintética do sistema de origem (`operacoes_credito_bruto`) |
| Dataset do BigQuery | `rc18_demo` | Tabela preparada para remessa (`posicao_credito`), snapshot da versão informada (`posicao_credito_informada`), domínios (`ref_modalidade`, `ref_uf`), `revisoes_autorizadas` e `testes_geracao_sob_demanda` |
| DataScan de qualidade | `rc18-demo-posicao-credito` | 19 regras em [regras/rc18-regras-demo.yaml](regras/rc18-regras-demo.yaml), sob demanda |
| Aspectos do catálogo | `contacts` e `overview` na entrada de `posicao_credito` | Acessibilidade e clareza |
| Glossário | `rc18-demo-glossario`, termos `saldo-devedor` e `data-base` | Definições padronizadas |
| Vínculos (entry links) | `rc18-demo-saldo-devedor`, `rc18-demo-data-base` | Ligam as colunas `valor_saldo` e `data_base` aos termos |

A tabela `posicao_credito` é criada por uma consulta sobre a tabela de origem, e a Data Lineage API
registra essa origem sem configuração adicional.

## Como executar

Pré-requisitos: `gcloud`, `bq`, `envsubst` e `curl`; APIs BigQuery, Dataplex e Data Lineage ativadas;
permissão para criar datasets, DataScans e glossários e para editar entradas do catálogo.

```bash
PROJECT_ID=meu-projeto ./rc18-kit/criar-demo.sh
```

Variáveis opcionais: `BQ_LOCATION` (padrão `US`), `DATAPLEX_LOCATION` (padrão `us-central1`),
`GLOSSARY_LOCATION` (padrão `global`) e `PREFIX` (padrão `rc18_demo`).

O script só cria e atualiza: não apaga nada e pode ser executado de novo. Depois, abra o painel e
clique em **Consultar**. A origem da tabela na visão de rastreabilidade aparece alguns minutos depois.

## Resultado esperado

Os dados trazem desvios de propósito, para o painel mostrar regras aprovadas e reprovadas:

| Dimensão | Regras aprovadas | Desvio proposital |
| --- | --- | --- |
| VI Completude | 2 de 2 | — |
| II Acurácia | 1 de 1 | — |
| VIII Consistência | 1 de 1 | — |
| XII Tempestividade | 1 de 2 | Um lote mensal ficou disponível 16 dias após a data-base: 550 de 600 linhas dentro do prazo de 10 dias |
| VII Confiabilidade | 1 de 2 | A operação `OP-00007` foi revisada em +12%, acima do limite de 5%: 1 linha em desacordo |
| IX Integridade | 1 de 3 | A operação `OP-00011` foi alterada sem revisão registrada e sem recalcular o hash: 1 linha em desacordo e 599 de 600 hashes conferem |
| V Comparabilidade | 3 de 4 | A operação `OP-00050` usa uma modalidade fora do domínio: 588 de 600 linhas no domínio |
| III Adaptabilidade | 3 de 4 | O teste de contingência está registrado como falha: 1 linha em desacordo |

No total, 13 de 19 regras aprovadas. A regra `carga-dentro-do-prazo` aprova enquanto a carga mais
recente tiver até 35 dias; como os dados do kit não são recarregados, ela passa a reprovar se o
DataScan for executado depois disso.

## Como aplicar às suas tabelas

1. **Tempestividade.** Grave em cada registro o momento em que ele ficou disponível e crie regras
   `FRESHNESS`: uma para a carga mais recente e outra para o intervalo entre a data do fato e a
   disponibilização.
2. **Confiabilidade.** No momento da remessa, guarde a versão informada com
   `CREATE SNAPSHOT TABLE ... CLONE ...`. Crie regras `CONFIABILIDADE` que comparam a tabela atual com
   o snapshot.
3. **Integridade.** Grave na carga um hash do conteúdo de cada registro e mantenha uma tabela com as
   revisões autorizadas. Crie regras `INTEGRIDADE` que conferem o hash e exigem revisão registrada
   para toda diferença em relação ao snapshot.
4. **Comparabilidade.** Mantenha os domínios em tabelas de referência e crie regras `COMPARABILIDADE`.
   Vincule as colunas aos termos do glossário de negócios.
5. **Adaptabilidade.** Registre em uma tabela de controle cada teste de geração da informação fora da
   rotina, com cenário, início, entrega, prazo e resultado. Crie regras `ADAPTABILIDADE` que verificam
   se há teste bem-sucedido de cada cenário na janela definida.
6. **Acessibilidade.** Grave o aspecto `contacts` na entrada de cada tabela (modelo em
   [catalogo/aspectos-posicao-credito.json](catalogo/aspectos-posicao-credito.json)).
7. **Rastreabilidade.** Gere as tabelas com jobs do BigQuery (consultas, Dataform, pipelines) com a
   Data Lineage API ativada.

Para avaliar as regras todos os dias, troque `--on-demand=true` por `--schedule="0 6 * * *"` na
criação do DataScan.

## O que foi verificado

Tudo abaixo foi executado em um projeto real em 19/11/2026, com datasets em `US` e DataScan em
`us-central1`:

- criação dos dados, do snapshot e das tabelas de controle;
- criação e execução do DataScan com as 19 regras, incluindo regras que consultam outras tabelas
  (snapshot, domínios, controle), com o resultado da tabela acima;
- gravação dos aspectos `contacts` e `overview`, criação do glossário e dos vínculos com as colunas;
- registro da origem da tabela pela Data Lineage API, entre 16 e 25 minutos após a criação;
- leitura de tudo isso pelo painel.

Não foi verificado:

- a execução do script inteiro em um projeto vazio: os comandos foram executados um a um na primeira
  vez, e o script completo foi executado sobre os recursos já existentes;
- outras localizações do BigQuery e do Dataplex;
- o conjunto mínimo de papéis para executar o kit: foi usado um administrador do projeto.

## Alternativa avaliada: modelos de regra

O Dataplex tem uma biblioteca de modelos de regra do sistema, em
`projects/dataplex-templates/locations/global/entryGroups/rule-library`, com 64 modelos — entre eles
`freshness_expectation`, `reference_set_expectation` e `table_comparison_aggregate_range_expectation`.
Uma regra referencia o modelo pelo campo `templateReference`. A API só aceita esse tipo de regra em
DataScans que executam com uma conta de serviço própria. O kit usa regras explícitas para não exigir
essa conta; os modelos não foram executados nesta validação.

## Remoção

```bash
PROJECT_ID=meu-projeto ./rc18-kit/remover-demo.sh
```

O script apaga de forma definitiva os datasets, o DataScan, o glossário e os vínculos da demonstração.
Ele pede que o ID do projeto seja digitado antes de apagar.

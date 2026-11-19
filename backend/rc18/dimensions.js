'use strict';

/**
 * Catálogo das 12 dimensões de qualidade da informação da
 * Resolução Conjunta nº 18, de 28 de novembro de 2025 (art. 2º, § 2º, incisos I a XII).
 *
 * - `definicao` é transcrição literal do normativo. Não parafrasear.
 * - `coleta` descreve o que ESTA versão do painel consegue observar por API:
 *     'automatica'   -> indicador calculado a partir de regras de qualidade (Dataplex DataScans);
 *     'parcial'      -> indicador técnico que cobre apenas parte da definição (metadados do
 *                       BigQuery, Data Lineage API ou aspectos do Knowledge Catalog);
 *     'declaratoria' -> sem coletor nesta versão (só aparece indicador se a instituição
 *                       marcar regras de DataScan com a dimensão personalizada correspondente).
 * - `dqDimensions` são os nomes de dimensão do Dataplex DataScan agregados em cada dimensão.
 *   O mapeamento das dimensões padrão (VALIDITY, UNIQUENESS, VOLUME, FRESHNESS) e a escolha dos
 *   indicadores parciais (contatos -> acessibilidade, uso -> relevância etc.) são escolhas deste
 *   projeto, não do normativo: a instituição deve validá-las com a sua área de conformidade.
 */

const NORMA = Object.freeze({
  nome: 'Resolução Conjunta nº 18, de 28 de novembro de 2025',
  emissores: 'Banco Central do Brasil e Conselho Monetário Nacional',
  ementa:
    'Dispõe sobre a política de qualidade das informações prestadas na esfera de atuação do Banco Central do Brasil pelas instituições financeiras e demais instituições autorizadas a funcionar pelo Banco Central do Brasil.',
  dispositivoDimensoes: 'art. 2º, § 2º, incisos I a XII',
  vigencia: '2026-01-01',
  prazoAdequacao: '2026-12-31',
  url: 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20Conjunta&numero=18',
  aviso:
    'Os indicadores deste painel são evidências técnicas de apoio à política de qualidade das informações da instituição. A Resolução não define métricas nem níveis mínimos por dimensão (o Banco Central do Brasil pode estabelecê-los — art. 10, I e II). O painel não atesta conformidade regulatória.',
});

const DIMENSIONS = Object.freeze([
  {
    id: 'acessibilidade',
    inciso: 'I',
    nome: 'Acessibilidade',
    definicao:
      'condições que permitam aos usuários obter informações, incluindo a indicação clara do local de disponibilização, a forma de realizar eventual demanda, os prazos e outras características relevantes de acesso, assegurado tratamento especial às pessoas com deficiência',
    coleta: 'parcial',
    dqDimensions: ['ACESSIBILIDADE'],
    fontes: ['Knowledge Catalog (aspecto contacts)'],
    comoEMedido:
      'Percentual de tabelas do escopo com contatos registrados no Knowledge Catalog (aspecto contacts).',
    lacuna:
      'Cobre apenas a indicação, no catálogo de dados, de a quem dirigir demandas sobre a informação. O local de disponibilização ao usuário, os prazos e o tratamento especial às pessoas com deficiência precisam ser evidenciados pela instituição.',
  },
  {
    id: 'acuracia',
    inciso: 'II',
    nome: 'Acurácia',
    definicao:
      'medida em que a informação fornecida reflete a realidade de maneira precisa e confiável, de acordo com a metodologia utilizada',
    coleta: 'automatica',
    dqDimensions: ['ACCURACY', 'VALIDITY', 'ACURACIA'],
    fontes: ['Dataplex DataScan (qualidade de dados)'],
    comoEMedido:
      'Percentual de regras de qualidade aprovadas na última execução dos DataScans (dimensões ACCURACY e VALIDITY).',
    lacuna:
      'Regras de validação são aproximações: a aderência à realidade também exige reconciliação com os sistemas internos (art. 3º, V, "a").',
  },
  {
    id: 'adaptabilidade',
    inciso: 'III',
    nome: 'Adaptabilidade',
    definicao:
      'capacidade de gerar informações em formato que atenda às diversas demandas por informações, incluindo as não periodicamente reportadas, bem como as decorrentes de mudanças regulamentares previstas, inclusive em situações adversas ou de crise',
    coleta: 'declaratoria',
    dqDimensions: ['ADAPTABILIDADE'],
    fontes: [],
    comoEMedido: null,
    lacuna:
      'Sem coleta automática nesta versão. É um atributo de arquitetura e de processo, a ser evidenciado pela instituição.',
  },
  {
    id: 'clareza',
    inciso: 'IV',
    nome: 'Clareza',
    definicao:
      'apresentação das informações de forma concisa, permitindo a fácil compreensão e atendendo às necessidades do usuário',
    coleta: 'parcial',
    dqDimensions: ['CLAREZA'],
    fontes: ['BigQuery (metadados de tabelas e colunas)', 'Knowledge Catalog (aspecto overview)'],
    comoEMedido: 'Percentual de colunas com descrição nas tabelas do escopo.',
    lacuna:
      'Cobre apenas a documentação técnica (dicionário de dados — art. 3º, III, "c"). A clareza da informação entregue ao usuário não é avaliada.',
  },
  {
    id: 'comparabilidade',
    inciso: 'V',
    nome: 'Comparabilidade',
    definicao:
      'capacidade de possibilitar ao usuário identificar e compreender semelhanças e diferenças entre informações, seja em diferentes períodos ou entre diferentes áreas geográficas ou domínios não geográficos',
    coleta: 'declaratoria',
    dqDimensions: ['COMPARABILIDADE'],
    fontes: [],
    comoEMedido: null,
    lacuna: 'Sem coleta automática nesta versão.',
  },
  {
    id: 'completude',
    inciso: 'VI',
    nome: 'Completude',
    definicao: 'capacidade de a informação atender integralmente os aspectos requeridos, com dados completos',
    coleta: 'automatica',
    dqDimensions: ['COMPLETENESS', 'VOLUME', 'COMPLETUDE'],
    fontes: ['Dataplex DataScan (qualidade de dados)'],
    comoEMedido:
      'Percentual de regras de qualidade aprovadas na última execução dos DataScans (dimensões COMPLETENESS e VOLUME).',
    lacuna:
      'Mede apenas os campos e as tabelas com regras configuradas; não verifica se todos os aspectos requeridos pelo demandante foram atendidos.',
  },
  {
    id: 'confiabilidade',
    inciso: 'VII',
    nome: 'Confiabilidade',
    definicao: 'ausência de desvio relevante nos dados revisados em relação ao seu valor inicial',
    coleta: 'declaratoria',
    dqDimensions: ['CONFIABILIDADE'],
    fontes: [],
    comoEMedido: null,
    lacuna:
      'Sem coleta automática nesta versão. A definição trata de revisões: exige comparar o dado revisado com o valor inicialmente prestado.',
  },
  {
    id: 'consistencia',
    inciso: 'VIII',
    nome: 'Consistência',
    definicao:
      'medida em que as informações referentes ao mesmo evento ou fato estão padronizadas e livres de contradições, mesmo quando geradas por diferentes fontes ou métodos',
    coleta: 'automatica',
    dqDimensions: ['CONSISTENCY', 'UNIQUENESS', 'CONSISTENCIA'],
    fontes: ['Dataplex DataScan (qualidade de dados)'],
    comoEMedido:
      'Percentual de regras de qualidade aprovadas na última execução dos DataScans (dimensões CONSISTENCY e UNIQUENESS).',
    lacuna:
      'A consistência entre fontes distintas depende de regras de reconciliação definidas pela instituição.',
  },
  {
    id: 'integridade',
    inciso: 'IX',
    nome: 'Integridade',
    definicao:
      'propriedade pela qual se assegura que a informação é autêntica e que não foi modificada de maneira não autorizada ou acidental',
    coleta: 'declaratoria',
    dqDimensions: ['INTEGRIDADE'],
    fontes: [],
    comoEMedido: null,
    lacuna:
      'Sem coleta automática nesta versão. Depende dos controles da instituição contra modificação não autorizada ou acidental e das trilhas de verificação previstas no art. 3º, III, "e".',
  },
  {
    id: 'rastreabilidade',
    inciso: 'X',
    nome: 'Rastreabilidade',
    definicao:
      'condições que permitam rastrear a informação desde a origem até a sua disponibilização ao usuário final',
    coleta: 'parcial',
    dqDimensions: ['RASTREABILIDADE'],
    fontes: ['Data Lineage API'],
    comoEMedido: 'Percentual de tabelas do escopo com origem registrada na Data Lineage API.',
    lacuna:
      'Cobre apenas as transformações registradas no Google Cloud. Os trechos fora da plataforma (sistemas de origem e entrega ao usuário final) precisam ser documentados pela instituição.',
  },
  {
    id: 'relevancia',
    inciso: 'XI',
    nome: 'Relevância',
    definicao:
      'capacidade de fornecer informações úteis, que possam influenciar a tomada de decisões pelos usuários',
    coleta: 'parcial',
    dqDimensions: ['RELEVANCIA'],
    fontes: ['Knowledge Catalog (aspecto usage)'],
    comoEMedido:
      'Percentual de tabelas do escopo com consultas registradas nos últimos 30 dias (aspecto usage do Knowledge Catalog).',
    lacuna:
      'O uso técnico da tabela não comprova que a informação é útil para a tomada de decisões pelos usuários; a contagem de consultas é a informada pelo catálogo e pode incluir consultas automatizadas.',
  },
  {
    id: 'tempestividade',
    inciso: 'XII',
    nome: 'Tempestividade',
    definicao:
      'fornecimento das informações em tempo hábil, no prazo estabelecido, observado um curto intervalo de tempo entre os fatos relatados e a data da prestação da informação, de modo a não comprometer sua utilidade aos usuários',
    coleta: 'parcial',
    dqDimensions: ['FRESHNESS', 'TIMELINESS', 'TEMPESTIVIDADE'],
    fontes: [
      'Dataplex DataScan (qualidade de dados)',
      'Knowledge Catalog (aspecto refresh-cadence)',
      'BigQuery (data da última modificação)',
    ],
    comoEMedido:
      'Percentual de regras de atualidade aprovadas (dimensão FRESHNESS), quando existirem. A cadência de atualização declarada no catálogo e a data da última modificação das tabelas são exibidas apenas como informação.',
    lacuna: 'O cumprimento dos prazos de remessa ao Banco Central do Brasil não é observável nesta plataforma.',
  },
]);

/** Índice NOME_DIMENSAO_DATAPLEX -> id da dimensão da Resolução. */
function buildDqDimensionIndex(dimensions = DIMENSIONS) {
  const index = new Map();
  for (const d of dimensions) {
    for (const name of d.dqDimensions) {
      index.set(String(name).toUpperCase(), d.id);
    }
  }
  return index;
}

module.exports = { NORMA, DIMENSIONS, buildDqDimensionIndex };

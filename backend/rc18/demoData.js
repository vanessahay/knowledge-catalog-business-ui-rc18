'use strict';

/**
 * DADOS SINTÉTICOS — usados somente quando o modo demonstração é pedido explicitamente
 * (`?demo=true`). Nunca são usados como substituto silencioso quando uma API falha.
 *
 * Os objetos têm o mesmo formato das respostas das APIs para que o modo demonstração percorra
 * exatamente o mesmo código dos dados reais. Nomes de datasets, tabelas e valores são fictícios.
 */

const { catalogItemFromEntry } = require('./catalogEntries');

const DEMO_TIME = '2026-01-15T08:03:36.000Z';

function executedRule(column, dimension, typeKey, passed, evaluated, passedCount, name) {
  const item = {
    rule: { column, dimension, name, [typeKey]: {} },
    failingRowsQuery: passed ? '' : `SELECT * FROM tabela_exemplo WHERE /* regra ${name} */ FALSE`,
  };
  if (passed) item.passed = true;
  if (evaluated !== null) {
    item.evaluatedCount = String(evaluated);
    item.passedCount = String(passedCount);
    item.passRatio = evaluated > 0 ? passedCount / evaluated : 0;
  }
  return item;
}

function demoScan(projectId, scanId, dataset, table, { result, spec }) {
  const scan = {
    name: `projects/${projectId}/locations/us-central1/dataScans/${scanId}`,
    displayName: scanId,
    type: 'DATA_QUALITY',
    data: { resource: `//bigquery.googleapis.com/projects/${projectId}/datasets/${dataset}/tables/${table}` },
  };
  if (result) {
    scan.executionStatus = { latestJobEndTime: DEMO_TIME };
    scan.dataQualityResult = { rules: result };
  }
  if (spec) scan.dataQualitySpec = { rules: spec };
  return scan;
}

function demoScans(projectId) {
  return [
    demoScan(projectId, 'dq-exemplo-cadastro', 'fin_demo_cadastro', 'dados_cadastrais', {
      result: [
        executedRule('cpf', 'COMPLETENESS', 'nonNullExpectation', true, 48920, 48920, 'cpf-nao-nulo'),
        executedRule('cpf', 'VALIDITY', 'regexExpectation', true, 48920, 48920, 'cpf-formato'),
        executedRule('nome_completo', 'COMPLETENESS', 'nonNullExpectation', true, 48920, 48920, 'nome-nao-nulo'),
        executedRule('email', 'VALIDITY', 'regexExpectation', false, 48920, 47850, 'email-formato'),
        executedRule('id_cliente', 'UNIQUENESS', 'uniquenessExpectation', true, 48920, 48920, 'id-unico'),
      ],
    }),
    demoScan(projectId, 'dq-exemplo-cartoes', 'fin_demo_cartoes', 'transacao_cartao', {
      result: [
        executedRule('nsu_transacao', 'UNIQUENESS', 'uniquenessExpectation', false, 128500, 128430, 'nsu-unico'),
        executedRule('data_hora_transacao', 'COMPLETENESS', 'nonNullExpectation', true, 128500, 128500, 'data-hora-nao-nula'),
        executedRule('valor_transacao', 'ACCURACY', 'rangeExpectation', true, 128500, 128500, 'valor-positivo'),
        executedRule('data_hora_transacao', 'FRESHNESS', 'sqlAssertion', true, null, null, 'carga-do-dia'),
      ],
    }),
    demoScan(projectId, 'dq-exemplo-contas', 'fin_demo_contas', 'saldos_extratos', {
      result: [
        executedRule('saldo_disponivel', 'CONSISTENCY', 'rowConditionExpectation', true, 94300, 94300, 'saldo-confere-lancamentos'),
        // Exemplo de dimensão personalizada com o nome de uma dimensão da Resolução.
        executedRule(null, 'INTEGRIDADE', 'tableConditionExpectation', true, null, null, 'hash-de-carga-confere'),
      ],
    }),
    // Scan configurado e ainda não executado: aparece como "sem execução" e não entra em score.
    demoScan(projectId, 'dq-exemplo-credito', 'fin_demo_credito', 'operacoes_ativas', {
      spec: [
        { column: 'taxa_juros_anual', dimension: 'ACCURACY', name: 'taxa-em-intervalo', rangeExpectation: {} },
        { column: 'cnpj_empresa', dimension: 'COMPLETENESS', name: 'cnpj-nao-nulo', nonNullExpectation: {} },
      ],
    }),
  ];
}

function demoColumns(names, described, tagged = []) {
  return names.map((name) => ({
    name,
    hasDescription: described.includes(name),
    policyTags: tagged.includes(name)
      ? [`projects/projeto-exemplo/locations/us/taxonomies/0/policyTags/${name}`]
      : [],
  }));
}

function demoTableMetadata(projectId) {
  const mk = (dataset, table, tableDescription, names, described, tagged) => {
    const columns = demoColumns(names, described, tagged);
    return {
      key: `${dataset}.${table}`,
      project: projectId,
      dataset,
      table,
      ok: true,
      location: 'us',
      tableDescription,
      totalColumns: columns.length,
      columnsWithDescription: columns.filter((c) => c.hasDescription).length,
      lastModifiedTime: DEMO_TIME,
      columns,
    };
  };
  return [
    mk('fin_demo_cadastro', 'dados_cadastrais', true,
      ['id_cliente', 'cpf', 'nome_completo', 'email', 'telefone_celular'],
      ['id_cliente', 'cpf', 'nome_completo', 'email'], ['cpf']),
    mk('fin_demo_cartoes', 'transacao_cartao', true,
      ['nsu_transacao', 'numero_cartao', 'valor_transacao', 'data_hora_transacao'],
      ['nsu_transacao', 'valor_transacao'], ['numero_cartao']),
    mk('fin_demo_contas', 'saldos_extratos', false,
      ['numero_conta', 'chave_pix', 'saldo_disponivel'], [], []),
    mk('fin_demo_credito', 'operacoes_ativas', true,
      ['id_operacao', 'cnpj_empresa', 'taxa_juros_anual'],
      ['id_operacao', 'cnpj_empresa', 'taxa_juros_anual'], []),
  ];
}

function demoLineage(projectId) {
  const fqn = (dataset, table) => `bigquery:${projectId}.${dataset}.${table}`;
  const proc = (id, displayName, sourceType) => ({
    name: `projects/${projectId}/locations/us/processes/${id}`,
    displayName,
    sourceType,
    originName: null,
  });
  const mk = (dataset, table, upstream, downstream, processes) => ({
    key: `${dataset}.${table}`,
    dataset,
    table,
    ok: true,
    location: 'us',
    locationsTried: ['us'],
    upstream,
    downstream,
    processes,
  });
  return [
    mk('fin_demo_cadastro', 'dados_cadastrais', [fqn('fin_demo_bruto', 'cadastro_origem')],
      [fqn('fin_demo_relatorios', 'base_clientes')], [proc('exemplo-1', 'carga_cadastro', 'DATAFORM')]),
    mk('fin_demo_cartoes', 'transacao_cartao', [fqn('fin_demo_bruto', 'eventos_cartao')], [],
      [proc('exemplo-2', 'carga_cartoes', 'BIGQUERY')]),
    // Tabela sem elos registrados: aparece como "sem origem registrada".
    mk('fin_demo_contas', 'saldos_extratos', [], [], []),
    mk('fin_demo_credito', 'operacoes_ativas', [fqn('fin_demo_bruto', 'contratos_origem')],
      [fqn('fin_demo_relatorios', 'base_credito')], [proc('exemplo-3', 'carga_credito', 'DATAFORM')]),
  ];
}

/**
 * Entradas do Knowledge Catalog no formato da resposta de GetEntry (aspectos de sistema com a
 * chave `<projeto>.global.<tipo>`), convertidas pelo mesmo código usado com os dados reais.
 */
function demoCatalog(projectId) {
  const usage = (queries30d) => ({
    metrics: [
      {
        name: 'total_queries',
        timeSeries: [
          { interval: '1d', value: Math.round(queries30d / 30) },
          { interval: '7d', value: Math.round(queries30d / 4) },
          { interval: '30d', value: queries30d },
        ],
      },
    ],
    refreshTime: DEMO_TIME,
  });
  const mk = (dataset, table, aspects) => {
    const entryName = `projects/${projectId}/locations/us/entryGroups/@bigquery/entries/bigquery.googleapis.com/projects/${projectId}/datasets/${dataset}/tables/${table}`;
    const entry = {
      name: entryName,
      entrySource: { displayName: table },
      aspects: Object.fromEntries(
        Object.entries({ 'bigquery-table': {}, schema: {}, storage: {}, ...aspects }).map(([type, data]) => [
          `dataplex-types.global.${type}`,
          { data },
        ])
      ),
    };
    const base = {
      key: `${dataset}.${table}`,
      dataset,
      table,
      linkedResource: `//bigquery.googleapis.com/projects/${projectId}/datasets/${dataset}/tables/${table}`,
    };
    return catalogItemFromEntry(base, entry, { entryName, entryLocation: 'us' });
  };
  return [
    mk('fin_demo_cadastro', 'dados_cadastrais', {
      contacts: {
        identities: [
          { role: 'Responsável pelo dado', name: 'Equipe de Cadastro (exemplo)', id: 'cadastro@exemplo.invalid' },
          { role: 'Curadoria', name: 'Governança de Dados (exemplo)', id: 'governanca@exemplo.invalid' },
        ],
      },
      overview: { content: '<p>Base cadastral de clientes (exemplo sintético).</p>', links: [] },
      usage: usage(412),
      'refresh-cadence': { frequency: 'Daily' },
      'data-quality-scorecard': { score: 80, status: 'FAIL' },
    }),
    mk('fin_demo_cartoes', 'transacao_cartao', {
      contacts: { identities: [{ role: 'Responsável pelo dado', name: 'Equipe de Cartões (exemplo)', id: 'cartoes@exemplo.invalid' }] },
      usage: usage(96),
    }),
    // Entrada sem contexto de negócio e com aspecto de uso vazio (métrica não informada).
    mk('fin_demo_contas', 'saldos_extratos', { usage: {} }),
    mk('fin_demo_credito', 'operacoes_ativas', {
      overview: { content: '<p>Operações de crédito ativas (exemplo sintético).</p>', links: [] },
      usage: usage(0),
    }),
  ];
}

module.exports = { DEMO_TIME, demoScans, demoTableMetadata, demoLineage, demoCatalog };

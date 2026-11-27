// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

/**
 * DADOS SINTÉTICOS — usados somente quando o modo demonstração é pedido explicitamente
 * (`?demo=true`). Nunca são usados como substituto silencioso quando uma API falha.
 *
 * Os objetos têm o mesmo formato das respostas REST das APIs para que o modo demonstração percorra
 * exatamente o mesmo código dos dados reais. Nomes de datasets, tabelas e valores são fictícios.
 */

const { catalogItemFromEntry, glossaryFactsFromLinks } = require('./catalogEntries');

// Relógio determinístico do modo demonstração: scans recentes têm 5 dias; o scan desatualizado tem 71 dias.
const DEMO_TIME = '2026-01-15T08:03:36.000Z';
const DEMO_STALE_TIME = '2025-11-10T08:00:00.000Z';
const DEMO_NOW_MS = Date.parse('2026-01-20T12:00:00.000Z');

function executedRule(column, dimension, typeKey, passed, evaluated, passedCount, name, extra = {}) {
  const rule = { column, dimension, name, [typeKey]: {} };
  if (extra.description) rule.description = extra.description;
  if (extra.threshold !== undefined) rule.threshold = extra.threshold;
  if (extra.suspended) rule.suspended = true;
  const item = {
    rule,
    failingRowsQuery:
      passed || extra.suspended
        ? ''
        : extra.failingRowsQuery || `SELECT * FROM \`projeto-exemplo.fin_demo.tabela\` WHERE /* regra ${name} */ TRUE`,
  };
  if (extra.assertionRowCount) item.assertionRowCount = String(extra.assertionRowCount);
  if (passed && !extra.suspended) item.passed = true;
  // Mesmo formato do JSON REST (proto3): contadores e razões iguais a zero são omitidos.
  if (evaluated !== null && !extra.suspended) {
    if (evaluated > 0) item.evaluatedCount = String(evaluated);
    if (passedCount > 0) item.passedCount = String(passedCount);
    if (evaluated > 0 && passedCount > 0) item.passRatio = passedCount / evaluated;
  }
  return item;
}

function demoScan(projectId, scanId, dataset, table, { result, spec, labels, executionTime, catalogPublishingEnabled }) {
  const scan = {
    name: `projects/${projectId}/locations/us-central1/dataScans/${scanId}`,
    displayName: scanId,
    type: 'DATA_QUALITY',
    labels: labels || {},
    data: { resource: `//bigquery.googleapis.com/projects/${projectId}/datasets/${dataset}/tables/${table}` },
  };
  if (result) {
    scan.executionStatus = { latestJobEndTime: executionTime || DEMO_TIME };
    scan.dataQualityResult = { rules: result };
  }
  const specObj = {};
  if (spec) specObj.rules = spec;
  if (catalogPublishingEnabled !== undefined) specObj.catalogPublishingEnabled = catalogPublishingEnabled;
  if (Object.keys(specObj).length > 0) scan.dataQualitySpec = specObj;
  return scan;
}

function demoScans(projectId) {
  return [
    demoScan(projectId, 'dq-exemplo-cadastro', 'fin_demo_cadastro', 'dados_cadastrais', {
      labels: { escopo: 'rc18', dominio: 'cadastro' },
      catalogPublishingEnabled: true,
      result: [
        executedRule('cpf', 'COMPLETENESS', 'nonNullExpectation', true, 48920, 48920, 'cpf-nao-nulo'),
        executedRule('cpf', 'VALIDITY', 'regexExpectation', true, 48920, 48920, 'cpf-formato'),
        executedRule('nome_completo', 'COMPLETENESS', 'nonNullExpectation', true, 48920, 48920, 'nome-nao-nulo'),
        executedRule('email', 'VALIDITY', 'regexExpectation', false, 48920, 47850, 'email-formato', {
          threshold: 0.99,
          failingRowsQuery: `SELECT id_cliente, email FROM \`${projectId}.fin_demo_cadastro.dados_cadastrais\` WHERE NOT REGEXP_CONTAINS(email, r'^[^@]+@[^@]+\\.[^@]+$')`,
        }),
        executedRule('id_cliente', 'UNIQUENESS', 'uniquenessExpectation', true, 48920, 48920, 'id-unico'),
      ],
      spec: [
        {
          column: 'telefone_celular',
          dimension: 'VALIDITY',
          name: 'telefone-formato-legado',
          description: 'Regra suspensa temporariamente durante migração de formato E.164.',
          regexExpectation: {},
          suspended: true,
        },
      ],
    }),
    demoScan(projectId, 'dq-exemplo-cartoes', 'fin_demo_cartoes', 'transacao_cartao', {
      labels: { escopo: 'rc18', dominio: 'cartoes' },
      catalogPublishingEnabled: true,
      executionTime: DEMO_STALE_TIME,
      result: [
        executedRule('nsu_transacao', 'UNIQUENESS', 'uniquenessExpectation', false, 128500, 128430, 'nsu-unico', {
          failingRowsQuery: `SELECT nsu_transacao, COUNT(*) AS qtd FROM \`${projectId}.fin_demo_cartoes.transacao_cartao\` GROUP BY 1 HAVING qtd > 1`,
        }),
        executedRule('data_hora_transacao', 'COMPLETENESS', 'nonNullExpectation', true, 128500, 128500, 'data-hora-nao-nula'),
        executedRule('valor_transacao', 'ACCURACY', 'rangeExpectation', true, 128500, 128500, 'valor-positivo'),
        executedRule('data_hora_transacao', 'FRESHNESS', 'sqlAssertion', true, null, null, 'carga-do-dia'),
      ],
    }),
    demoScan(projectId, 'dq-exemplo-contas', 'fin_demo_contas', 'saldos_extratos', {
      labels: { escopo: 'rc18', dominio: 'contas' },
      catalogPublishingEnabled: true,
      result: [
        executedRule('saldo_disponivel', 'CONSISTENCY', 'rowConditionExpectation', true, 94300, 94300, 'saldo-confere-lancamentos'),
        executedRule(null, 'INTEGRIDADE', 'tableConditionExpectation', true, null, null, 'hash-de-carga-confere', {
          description: 'O hash do lote carregado confere com o hash calculado na origem.',
        }),
        executedRule(null, 'CONFIABILIDADE', 'sqlAssertion', false, null, null, 'revisao-sem-desvio-relevante', {
          description: 'Nenhum saldo revisado se afasta mais de 5% do valor informado (comparação com o snapshot da remessa).',
          assertionRowCount: 3,
          failingRowsQuery: `SELECT atual.numero_conta, atual.saldo_disponivel, snap.saldo_disponivel AS saldo_informado FROM \`${projectId}.fin_demo_contas.saldos_extratos\` atual JOIN \`${projectId}.fin_demo_contas.saldos_informados\` snap USING (numero_conta) WHERE ABS(atual.saldo_disponivel - snap.saldo_disponivel) / NULLIF(ABS(snap.saldo_disponivel), 0) > 0.05`,
        }),
        executedRule(null, 'CONFIABILIDADE', 'tableConditionExpectation', true, null, null, 'total-revisado-proximo-do-informado', {
          description: 'O saldo total revisado difere no máximo 1% do total informado.',
        }),
        executedRule(null, 'COMPARABILIDADE', 'sqlAssertion', true, null, null, 'moeda-unica-por-data-base', {
          description: 'Cada data-base usa uma única moeda.',
        }),
      ],
    }),
    // Scan configurado e ainda não executado: aparece como "sem execução" e não entra em score.
    demoScan(projectId, 'dq-exemplo-credito', 'fin_demo_credito', 'operacoes_ativas', {
      labels: { escopo: 'rc18', dominio: 'credito' },
      spec: [
        { column: 'taxa_juros_anual', dimension: 'ACCURACY', name: 'taxa-em-intervalo', rangeExpectation: {} },
        { column: 'cnpj_empresa', dimension: 'COMPLETENESS', name: 'cnpj-nao-nulo', nonNullExpectation: {} },
      ],
    }),
  ];
}

function demoTableMetadata(projectId) {
  const mk = (dataset, table, tableDescription, names, described) => ({
    canonicalKey: `${projectId}.${dataset}.${table}`,
    key: `${dataset}.${table}`,
    project: projectId,
    dataset,
    table,
    ok: true,
    location: 'us',
    tableDescription,
    totalColumns: names.length,
    columnsWithDescription: names.filter((n) => described.includes(n)).length,
    lastModifiedTime: DEMO_TIME,
  });
  return [
    mk('fin_demo_cadastro', 'dados_cadastrais', true,
      ['id_cliente', 'cpf', 'nome_completo', 'email', 'telefone_celular'],
      ['id_cliente', 'cpf', 'nome_completo', 'email']),
    mk('fin_demo_cartoes', 'transacao_cartao', true,
      ['nsu_transacao', 'numero_cartao', 'valor_transacao', 'data_hora_transacao'],
      ['nsu_transacao', 'valor_transacao']),
    mk('fin_demo_contas', 'saldos_extratos', false,
      ['numero_conta', 'chave_pix', 'saldo_disponivel'], []),
    mk('fin_demo_credito', 'operacoes_ativas', true,
      ['id_operacao', 'cnpj_empresa', 'taxa_juros_anual'],
      ['id_operacao', 'cnpj_empresa', 'taxa_juros_anual']),
  ];
}

function demoLineage(projectId) {
  const fqn = (dataset, table) => `bigquery:${projectId}.${dataset}.${table}`;
  const mk = (dataset, table, upstream) => ({
    canonicalKey: `${projectId}.${dataset}.${table}`,
    key: `${dataset}.${table}`,
    project: projectId,
    dataset,
    table,
    ok: true,
    location: 'us',
    locationsTried: ['us'],
    upstream,
  });
  return [
    mk('fin_demo_cadastro', 'dados_cadastrais', [fqn('fin_demo_bruto', 'cadastro_origem')]),
    mk('fin_demo_cartoes', 'transacao_cartao', [fqn('fin_demo_bruto', 'eventos_cartao')]),
    // Tabela sem elos registrados: aparece como lacuna de rastreabilidade.
    mk('fin_demo_contas', 'saldos_extratos', []),
    mk('fin_demo_credito', 'operacoes_ativas', [fqn('fin_demo_bruto', 'contratos_origem')]),
  ];
}

/**
 * Entradas do Knowledge Catalog no formato REST de GetEntry (JSON plano), convertidas pelo
 * mesmo código usado com os dados reais.
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
  const termLinks = {
    dados_cadastrais: [['cpf', 'cpf'], ['id_cliente', 'cliente']],
    saldos_extratos: [['saldo_disponivel', 'saldo-disponivel']],
  };
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
      canonicalKey: `${projectId}.${dataset}.${table}`,
      key: `${dataset}.${table}`,
      project: projectId,
      dataset,
      table,
    };
    const item = catalogItemFromEntry(base, entry, { entryName, entryLocation: 'us' });
    item.glossary = glossaryFactsFromLinks({
      entryLinks: (termLinks[table] || []).map(([column, term]) => ({
        entryLinkType: 'projects/dataplex-types/locations/global/entryLinkTypes/definition',
        entryReferences: [
          { name: entryName, path: `Schema.${column}`, type: 'SOURCE' },
          {
            name: `projects/${projectId}/locations/global/entryGroups/@dataplex/entries/projects/${projectId}/locations/global/glossaries/glossario-exemplo/terms/${term}`,
            type: 'TARGET',
          },
        ],
      })),
    });
    return item;
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
    }),
    mk('fin_demo_cartoes', 'transacao_cartao', {
      contacts: { identities: [{ role: 'Responsável pelo dado', name: 'Equipe de Cartões (exemplo)', id: 'cartoes@exemplo.invalid' }] },
      usage: usage(96),
    }),
    mk('fin_demo_contas', 'saldos_extratos', { usage: {} }),
    mk('fin_demo_credito', 'operacoes_ativas', {
      overview: { content: '<p>Operações de crédito ativas (exemplo sintético).</p>', links: [] },
      usage: usage(0),
    }),
  ];
}

module.exports = { DEMO_TIME, DEMO_STALE_TIME, DEMO_NOW_MS, demoScans, demoTableMetadata, demoLineage, demoCatalog };

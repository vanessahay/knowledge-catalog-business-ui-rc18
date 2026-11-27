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
 * Testes unitários e de rota do painel RC 18 (Node >= 20, sem dependências externas).
 * Rodar: `npm test` em `backend/`.
 * Para regenerar o fixture do frontend: `UPDATE_RC18_FIXTURES=1 npm test`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const { DIMENSIONS, NORMA } = require('./dimensions');
const {
  STALE_SCAN_DAYS,
  parseScanName,
  parseTableRef,
  canonicalKeyForScan,
  executionFreshness,
  deduplicateScansByTable,
  describeRule,
  rulesFromScan,
  scoreFromRules,
  tablesFromScans,
  disambiguateTableKeys,
} = require('./dqScans');
const { buildDimensionReport } = require('./dimensionReport');
const { buildQualityView } = require('./qualityView');
const { catalogItemFromEntry, glossaryFactsFromLinks } = require('./catalogEntries');
const collectors = require('./collectors');
const demoData = require('./demoData');
const { createRc18Router, parseLabelFilter, matchesLabelFilter } = require('../routes/rc18Routes');

const PROJECT = 'projeto-exemplo';
const FIXTURE_PATH = path.resolve(__dirname, '../../src/component/RC18/__fixtures__/rc18-respostas.json');

const makeScan = (scanId, dataset, table, opts = {}) => {
  const proj = opts.project || PROJECT;
  const loc = opts.location || 'us-central1';
  const resource =
    opts.resource !== undefined
      ? opts.resource
      : `//bigquery.googleapis.com/projects/${proj}/datasets/${dataset}/tables/${table}`;
  const scan = {
    name: `projects/${proj}/locations/${loc}/dataScans/${scanId}`,
    displayName: scanId,
    type: 'DATA_QUALITY',
    labels: opts.labels || {},
    data: { resource },
  };
  if (opts.executionTime !== undefined) {
    scan.executionStatus = opts.executionTime ? { latestJobEndTime: opts.executionTime } : {};
  }
  if (opts.resultRules) {
    scan.dataQualityResult = { rules: opts.resultRules };
  }
  const spec = {};
  if (opts.specRules) spec.rules = opts.specRules;
  if (opts.catalogPublishingEnabled !== undefined) spec.catalogPublishingEnabled = opts.catalogPublishingEnabled;
  if (Object.keys(spec).length > 0) scan.dataQualitySpec = spec;
  return scan;
};

test('catálogo das 12 dimensões separa categoria dados (8) e governanca (4)', () => {
  assert.equal(DIMENSIONS.length, 12);
  assert.deepEqual(
    DIMENSIONS.map((d) => d.inciso),
    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  );
  assert.equal(DIMENSIONS.filter((d) => d.categoria === 'dados').length, 8);
  assert.equal(DIMENSIONS.filter((d) => d.categoria === 'governanca').length, 4);
  assert.equal(NORMA.vigencia, '2026-01-01');
  assert.equal(NORMA.prazoAdequacao, '2026-12-31');
});

test('deduplicateScansByTable: precedência completa, desempate por scan.name e limites de data', () => {
  const nowMs = Date.parse('2026-02-01T00:00:00Z');

  // 1) Executado vence não executado mesmo que o não executado tenha catalogPublishingEnabled=true
  const unexecPub = makeScan('scan-a', 'ds', 't1', { catalogPublishingEnabled: true });
  const execNoPub = makeScan('scan-b', 'ds', 't1', { executionTime: '2026-01-20T00:00:00Z' });

  // 2) Entre executados, catalogPublishingEnabled=true vence mais recente sem publicação
  const execPubOlder = makeScan('scan-pub', 'ds', 't2', {
    executionTime: '2026-01-10T00:00:00Z',
    catalogPublishingEnabled: true,
  });
  const execNewerNoPub = makeScan('scan-new', 'ds', 't2', {
    executionTime: '2026-01-25T00:00:00Z',
    catalogPublishingEnabled: false,
  });

  // 3) Mesmo status de publicação: mais recente vence
  const older = makeScan('scan-old', 'ds', 't3', { executionTime: '2025-12-01T00:00:00Z' });
  const newer = makeScan('scan-rec', 'ds', 't3', { executionTime: '2026-01-28T00:00:00Z' });

  // 4) Empate total com mesmo scanId em regiões diferentes: desempate determinístico por scan.name
  const locB = makeScan('same-id', 'ds', 't4', { location: 'us-east1', executionTime: '2026-01-20T00:00:00Z' });
  const locA = makeScan('same-id', 'ds', 't4', { location: 'southamerica-east1', executionTime: '2026-01-20T00:00:00Z' });

  // Limites de executionFreshness: ausente, inválido, futuro (clock skew -> 0) e > 30 dias (stale)
  assert.deepEqual(executionFreshness(makeScan('x', 'ds', 'tx'), nowMs), {
    executionTime: null,
    executionMs: null,
    daysSinceExecution: null,
    isStale: false,
  });
  assert.deepEqual(executionFreshness(makeScan('x', 'ds', 'tx', { executionTime: 'data-invalida' }), nowMs), {
    executionTime: null,
    executionMs: null,
    daysSinceExecution: null,
    isStale: false,
  });
  const future = executionFreshness(makeScan('x', 'ds', 'tx', { executionTime: '2026-02-05T00:00:00Z' }), nowMs);
  assert.equal(future.daysSinceExecution, 0);
  assert.equal(future.isStale, false);

  const stale = executionFreshness(makeScan('x', 'ds', 'tx', { executionTime: '2025-12-15T00:00:00Z' }), nowMs);
  assert.equal(stale.daysSinceExecution > STALE_SCAN_DAYS, true);
  assert.equal(stale.isStale, true);

  const { activeScans, ignoredDuplicates, scanMetaByKey } = deduplicateScansByTable(
    [unexecPub, execNoPub, execPubOlder, execNewerNoPub, older, newer, locB, locA],
    nowMs
  );
  assert.equal(activeScans.length, 4);
  assert.equal(ignoredDuplicates.length, 4);
  assert.equal(scanMetaByKey.get(`${PROJECT}.ds.t1`).scanId, 'scan-b');
  assert.equal(scanMetaByKey.get(`${PROJECT}.ds.t2`).scanId, 'scan-pub');
  assert.equal(scanMetaByKey.get(`${PROJECT}.ds.t3`).scanId, 'scan-rec');
  assert.equal(scanMetaByKey.get(`${PROJECT}.ds.t4`).location, 'southamerica-east1');
});

test('canonicalKey cross-project, fallback não-BigQuery e desambiguação de tableKey após agregação', () => {
  const s1 = makeScan('s1', 'core', 'clientes', { project: 'proj-a', executionTime: '2026-01-20T00:00:00Z' });
  const s2 = makeScan('s2', 'core', 'clientes', { project: 'proj-b', executionTime: '2026-01-20T00:00:00Z' });
  const gcs1 = makeScan('g1', null, null, { resource: '//storage.googleapis.com/bucket-a/file1' });
  const gcs2 = makeScan('g2', null, null, { resource: null });

  assert.equal(canonicalKeyForScan(s1), 'proj-a.core.clientes');
  assert.equal(canonicalKeyForScan(s2), 'proj-b.core.clientes');
  assert.equal(canonicalKeyForScan(gcs1), '//storage.googleapis.com/bucket-a/file1');
  assert.equal(canonicalKeyForScan(gcs2), gcs2.name);
  assert.notEqual(canonicalKeyForScan(gcs2), 'null.null.null');

  const { activeScans, scanMetaByKey } = deduplicateScansByTable([s1, s2, gcs1, gcs2], Date.parse('2026-01-25T00:00:00Z'));
  assert.equal(activeScans.length, 4);

  const tables = tablesFromScans(activeScans, scanMetaByKey, Date.parse('2026-01-25T00:00:00Z'));
  const rules = activeScans.flatMap((s) => rulesFromScan(s, Date.parse('2026-01-25T00:00:00Z')));
  const { multiProject } = disambiguateTableKeys(rules, tables);
  assert.equal(multiProject, true);
  assert.equal(tables.find((t) => t.canonicalKey === 'proj-a.core.clientes').key, 'proj-a.core.clientes');
  assert.equal(tables.find((t) => t.canonicalKey === 'proj-b.core.clientes').key, 'proj-b.core.clientes');
});

test('regras suspended, threshold, templateReference e colisão de regras sem nome', () => {
  const scan = makeScan('scan-edge', 'ds', 't', {
    executionTime: '2026-01-20T00:00:00Z',
    specRules: [
      // Duas regras sem nome idênticas: 1 ativa e 1 suspensa — a suspensa NÃO pode sequestrar a ativa!
      { column: 'valor', dimension: 'VALIDITY', rowConditionExpectation: { sqlExpression: 'valor > 0' } },
      { column: 'valor', dimension: 'VALIDITY', rowConditionExpectation: { sqlExpression: 'valor > 0' }, suspended: true },
      // Regra nomeada suspensa na spec que tinha resultado antigo em resultRules
      { name: 'regra-toggled', column: 'cpf', dimension: 'COMPLETENESS', nonNullExpectation: {}, suspended: true },
    ],
    resultRules: [
      {
        rule: { column: 'valor', dimension: 'VALIDITY', rowConditionExpectation: { sqlExpression: 'valor > 0' } },
        passed: true,
        evaluatedCount: '100',
        passedCount: '100',
        passRatio: 1,
      },
      {
        rule: { name: 'regra-toggled', column: 'cpf', dimension: 'COMPLETENESS', nonNullExpectation: {} },
        // Sem `passed: true` — sem normalização de suspended viraria falha!
        evaluatedCount: '100',
        passedCount: '90',
        passRatio: 0.9,
      },
      // templateReference com contadores por linha
      {
        rule: { name: 'tpl-linhas', dimension: 'ACCURACY', templateReference: { name: 'tpl-1' }, threshold: 0.95 },
        passed: false,
        evaluatedCount: '200',
        passedCount: '180',
        passRatio: 0.9,
        failingRowsQuery: 'SELECT * FROM t WHERE bad',
      },
      // templateReference asserção reprovada
      {
        rule: { name: 'tpl-assert-fail', dimension: 'INTEGRIDADE', templateReference: { name: 'tpl-2' } },
        assertionRowCount: '4',
      },
      // templateReference asserção aprovada (proto3 omite assertionRowCount = 0) -> resultKind deve ser null
      {
        rule: { name: 'tpl-assert-ok', dimension: 'INTEGRIDADE', templateReference: { name: 'tpl-3' } },
        passed: true,
      },
    ],
  });

  const rules = rulesFromScan(scan, Date.parse('2026-01-25T00:00:00Z'));
  const activeUnnamed = rules.filter((r) => !r.ruleName && !r.suspended);
  const suspendedUnnamed = rules.filter((r) => !r.ruleName && r.suspended);
  assert.equal(activeUnnamed.length, 1);
  assert.equal(activeUnnamed[0].executed, true);
  assert.equal(activeUnnamed[0].passed, true);
  assert.equal(activeUnnamed[0].threshold, 1.0);
  assert.equal(suspendedUnnamed.length, 1);
  assert.equal(suspendedUnnamed[0].executed, false);
  assert.equal(suspendedUnnamed[0].passed, null);

  const toggled = rules.find((r) => r.ruleName === 'regra-toggled');
  assert.equal(toggled.suspended, true);
  assert.equal(toggled.executed, false);
  assert.equal(toggled.passed, null);
  assert.equal(toggled.evaluatedCount, null);
  assert.equal(toggled.executionTime, null);

  const tplLinhas = rules.find((r) => r.ruleName === 'tpl-linhas');
  assert.equal(tplLinhas.resultKind, 'linhas');
  assert.equal(tplLinhas.threshold, 0.95);
  assert.equal(tplLinhas.evaluatedCount, 200);

  const tplAssertFail = rules.find((r) => r.ruleName === 'tpl-assert-fail');
  assert.equal(tplAssertFail.resultKind, 'assercao');
  assert.equal(tplAssertFail.threshold, null);
  assert.equal(tplAssertFail.assertionRowCount, 4);

  const tplAssertOk = rules.find((r) => r.ruleName === 'tpl-assert-ok');
  assert.equal(tplAssertOk.resultKind, null);
  assert.equal(tplAssertOk.threshold, null);
  assert.equal(tplAssertOk.passed, true);

  const score = scoreFromRules(rules);
  assert.equal(score.rulesSuspended, 2);
  assert.equal(score.rulesTotal, 4);
  assert.equal(score.rulesExecuted, 4);
  assert.equal(score.rulesPassed, 2);
  assert.equal(score.rulesFailed, 2);
});

test('rulesFromScan: JSON REST sem zeros e regras ativas adicionadas depois do último job', () => {
  const nowMs = Date.parse('2026-01-25T00:00:00Z');
  const scan = makeScan('scan-rest', 'ds', 't', {
    executionTime: '2026-01-20T00:00:00Z',
    specRules: [
      { name: 'todas-reprovadas', column: 'c', dimension: 'COMPLETENESS', nonNullExpectation: {} },
      // Regra nomeada editada depois do job (limiar mudou): casa pelo nome e não duplica
      { name: 'uma-reprovada', column: 'c', dimension: 'COMPLETENESS', nonNullExpectation: {}, threshold: 0.95 },
      // Regra nova, adicionada depois do último job (sem resultado)
      { name: 'regra-nova', column: 'd', dimension: 'VALIDITY', rangeExpectation: {} },
    ],
    resultRules: [
      // 100% das linhas reprovadas: o REST omite passed (false), passedCount (0) e passRatio (0)
      {
        rule: { name: 'todas-reprovadas', column: 'c', dimension: 'COMPLETENESS', nonNullExpectation: {} },
        evaluatedCount: '1000',
        failingRowsQuery: 'SELECT 1',
      },
      {
        rule: { name: 'uma-reprovada', column: 'c', dimension: 'COMPLETENESS', nonNullExpectation: {} },
        evaluatedCount: '1000',
        passedCount: '999',
        passRatio: 0.999,
        failingRowsQuery: 'SELECT 1',
      },
    ],
  });

  const rules = rulesFromScan(scan, nowMs);
  assert.equal(rules.length, 3);

  const todas = rules.find((r) => r.ruleName === 'todas-reprovadas');
  assert.equal(todas.executed, true);
  assert.equal(todas.passed, false);
  assert.equal(todas.passedCount, 0);
  assert.equal(todas.passRatio, 0);

  const nova = rules.find((r) => r.ruleName === 'regra-nova');
  assert.equal(nova.executed, false);
  assert.equal(nova.passed, null);
  assert.equal(nova.suspended, false);
  // Sem resultado no último job: não herda a data nem a defasagem do job do scan
  assert.equal(nova.executionTime, null);
  assert.equal(nova.daysSinceExecution, null);
  assert.equal(nova.isStale, false);
  // Com o scan defasado (40 dias depois do job), só as regras executadas aparecem desatualizadas
  const rulesLater = rulesFromScan(scan, Date.parse('2026-03-01T00:00:00Z'));
  assert.equal(rulesLater.find((r) => r.ruleName === 'todas-reprovadas').isStale, true);
  assert.equal(rulesLater.find((r) => r.ruleName === 'regra-nova').isStale, false);

  const score = scoreFromRules(rules);
  assert.equal(score.rulesExecuted, 2);
  assert.equal(score.rulesFailed, 2);
  assert.equal(score.rulesNotExecuted, 1);

  // A regra com todas as linhas reprovadas lidera a fila (maior número de linhas afetadas)
  const view = buildQualityView(rules, { activeScans: [scan] });
  const completude = view.dimensionGroups.find((g) => g.id === 'completude');
  assert.equal(completude.rules[0].ruleName, 'todas-reprovadas');
  assert.equal(completude.rules[0].failedCount, 1000);
  assert.equal(completude.rules[0].passPercentage, 0);
  assert.equal('group' in completude, false);
});

test('dimensionReport e qualityView: situacao factual, regra DQ reprovada em governança, scan com 0 regras e unmappedRules', () => {
  const nowMs = Date.parse('2026-02-15T00:00:00Z');
  const staleZeroRuleScan = makeScan('scan-zero', 'ds', 'vazia', { executionTime: '2025-12-01T00:00:00Z' });
  const mainScan = makeScan('scan-main', 'ds', 'principal', {
    executionTime: '2026-02-10T00:00:00Z',
    resultRules: [
      // Regra DQ personalizada reprovada em Relevância -> deve virar 'com_falhas' (nunca 'informativo')
      { rule: { name: 'rel-fail', dimension: 'RELEVANCIA', sqlAssertion: {} }, assertionRowCount: '2' },
      // Regra sem mapeamento reprovada -> deve reconciliar 1:1 com totalRegrasReprovadas
      { rule: { name: 'custom-unmapped', dimension: 'OUTRA_DIM', sqlAssertion: {} }, assertionRowCount: '5' },
      // Comparabilidade com regra executada e aprovada -> 'sem_falhas' (as regras prevalecem sobre o glossário)
      { rule: { name: 'comp-ok', dimension: 'COMPARABILIDADE', sqlAssertion: {} }, passed: true },
    ],
  });

  const { activeScans, scanMetaByKey } = deduplicateScansByTable([staleZeroRuleScan, mainScan], nowMs);
  const rules = activeScans.flatMap((s) => rulesFromScan(s, nowMs));
  const tables = tablesFromScans(activeScans, scanMetaByKey, nowMs);

  const catalog = [
    {
      canonicalKey: `${PROJECT}.ds.principal`,
      key: 'ds.principal',
      found: true,
      entryName: 'projects/p/locations/us/entryGroups/@bigquery/entries/t1',
      facts: { contactsCount: 1, hasOverview: true, queries30d: 0 },
      glossary: { termLinks: 1, terms: ['t'], truncated: false },
    },
    {
      canonicalKey: `${PROJECT}.ds.vazia`,
      key: 'ds.vazia',
      found: false,
      entryName: null,
      facts: null,
      glossary: null,
    },
  ];
  const metadata = [
    { canonicalKey: `${PROJECT}.ds.principal`, key: 'ds.principal', ok: true, totalColumns: 2, columnsWithDescription: 2, tableDescription: true },
  ];
  const lineage = [
    { canonicalKey: `${PROJECT}.ds.principal`, key: 'ds.principal', ok: true, upstream: ['bigquery:orig.t'] },
  ];

  const report = buildDimensionReport({
    rules,
    activeScans,
    scanMetaByKey,
    tableMetadata: metadata,
    lineage,
    catalog,
  });

  const byId = Object.fromEntries(report.dimensoes.map((d) => [d.id, d]));
  assert.equal(byId.relevancia.situacao, 'com_falhas');
  assert.equal(byId.comparabilidade.situacao, 'sem_falhas');
  // 'vazia' não tem entrada no catálogo (404, fato verificado): entra como tabela sem contatos
  assert.equal(byId.acessibilidade.situacao, 'lacunas');
  assert.equal(byId.acessibilidade.indicadores[0].denominador, 2);
  assert.equal(report.resumoNaoConformidades.totalRegrasReprovadas, 2);
  assert.equal(report.resumoNaoConformidades.regrasSemMapeamentoReprovadas, 1);
  assert.equal(report.resumoNaoConformidades.scansDesatualizados, 1);
  assert.equal(report.resumoNaoConformidades.lacunasGovernanca, 1);
  assert.equal(report.resumoNaoConformidades.governancaNaoVerificada, 0);
  assert.deepEqual(report.governanceGapKeys, [`${PROJECT}.ds.vazia`]);
  assert.equal('resumo' in report, false);
  // Termos de glossário distintos: "+" quando a lista de vínculos de alguma tabela foi cortada
  const termosDistintos = (r) =>
    r.dimensoes
      .find((d) => d.id === 'comparabilidade')
      .evidencias.find((e) => e.rotulo === 'Termos de glossário distintos vinculados').valor;
  assert.equal(termosDistintos(report), '1');
  catalog[0].glossary.truncated = true;
  const reportCortado = buildDimensionReport({ rules, activeScans, scanMetaByKey, tableMetadata: metadata, lineage, catalog });
  assert.equal(termosDistintos(reportCortado), '1+');
  catalog[0].glossary.truncated = false;

  const catalogByKey = Object.fromEntries(catalog.map((c) => [c.canonicalKey, c]));
  const quality = buildQualityView(rules, { activeScans, tables, catalogByKey, scanMetaByKey });
  assert.equal(quality.tableSummaries.length, 2);
  const vaziaSummary = quality.tableSummaries.find((t) => t.canonicalKey === `${PROJECT}.ds.vazia`);
  assert.equal(vaziaSummary.isStale, true);
  assert.equal(vaziaSummary.totalRules, 0);
  assert.equal(vaziaSummary.entryName, null);
  const principalSummary = quality.tableSummaries.find((t) => t.canonicalKey === `${PROJECT}.ds.principal`);
  assert.equal(principalSummary.entryName, 'projects/p/locations/us/entryGroups/@bigquery/entries/t1');
  // Regras reprovadas ordenadas por assertionRowCount decrescente
  assert.equal(quality.unmappedRules[0].ruleName, 'custom-unmapped');
});

test('dimensionReport: completo pelos números exatos, texto factual com regras não executadas e marcador de lacuna por tabela', () => {
  const nowMs = Date.parse('2026-02-15T00:00:00Z');
  const scan = makeScan('scan-int', 'ds', 'controle', {
    executionTime: '2026-02-10T00:00:00Z',
    specRules: [{ name: 'hash-suspenso', dimension: 'INTEGRIDADE', sqlAssertion: {}, suspended: true }],
    resultRules: [
      {
        rule: { name: 'ok', column: 'c', dimension: 'COMPLETENESS', nonNullExpectation: {} },
        passed: true,
        evaluatedCount: '5',
        passedCount: '5',
        passRatio: 1,
      },
    ],
  });
  const { activeScans, scanMetaByKey } = deduplicateScansByTable([scan], nowMs);
  const rules = activeScans.flatMap((s) => rulesFromScan(s, nowMs));
  const ck = `${PROJECT}.ds.controle`;
  const report = buildDimensionReport({
    rules,
    activeScans,
    scanMetaByKey,
    tableMetadata: [
      { canonicalKey: ck, key: 'ds.controle', ok: true, totalColumns: 20001, columnsWithDescription: 20000, tableDescription: true },
    ],
    lineage: [{ canonicalKey: ck, key: 'ds.controle', ok: true, upstream: ['bigquery:orig.t'] }],
    catalog: [],
  });
  const byId = Object.fromEntries(report.dimensoes.map((d) => [d.id, d]));

  // 20.000 de 20.001 colunas arredonda para 100%, mas há lacuna: não pode ser 'completo'
  assert.equal(byId.clareza.indicadores[0].valorPct, 100);
  assert.equal(byId.clareza.situacao, 'lacunas');
  assert.deepEqual(report.governanceGapKeys, [ck]);
  assert.equal(report.resumoNaoConformidades.lacunasGovernanca, 1);
  assert.equal(report.resumoNaoConformidades.governancaNaoVerificada, 0);

  // Integridade só com regra suspensa: texto factual em vez de "Não há regras marcadas"
  assert.equal(byId.integridade.estado, 'nao_medido');
  assert.equal(byId.integridade.regras.suspensas, 1);
  assert.doesNotMatch(byId.integridade.lacuna, /Não há regras marcadas/);
  assert.match(byId.integridade.lacuna, /1 suspensa/);
  // Sem nenhuma regra da dimensão o texto padrão continua correto
  assert.match(byId.adaptabilidade.lacuna, /Não há regras marcadas/);
});

test('dimensionReport: leitura parcial de governança e escopo não lido nunca viram fato', () => {
  const nowMs = Date.parse('2026-02-15T00:00:00Z');
  const nomes = ['t1', 't2', 't3'];
  const scans = nomes.map((t) =>
    makeScan(`scan-${t}`, 'ds', t, {
      executionTime: '2026-02-10T00:00:00Z',
      // Uma regra aprovada (Acurácia) só em t1
      resultRules:
        t === 't1'
          ? [{ rule: { name: 'ok', column: 'c', dimension: 'VALIDITY', nonNullExpectation: {} }, passed: true, evaluatedCount: '5', passedCount: '5', passRatio: 1 }]
          : [],
    })
  );
  const { activeScans, scanMetaByKey } = deduplicateScansByTable(scans, nowMs);
  const rules = activeScans.flatMap((s) => rulesFromScan(s, nowMs));
  const ck = (t) => `${PROJECT}.ds.${t}`;
  const evidencias = {
    rules,
    activeScans,
    scanMetaByKey,
    tableMetadata: nomes.map((t) => ({
      canonicalKey: ck(t),
      key: `ds.${t}`,
      ok: true,
      totalColumns: 1,
      columnsWithDescription: 1,
      tableDescription: true,
    })),
    lineage: nomes.map((t) => ({ canonicalKey: ck(t), key: `ds.${t}`, ok: true, upstream: ['bigquery:o.t'] })),
    // Catálogo lido só para t1 (t2 e t3 com 403 -> found null)
    catalog: [
      { canonicalKey: ck('t1'), key: 'ds.t1', found: true, facts: { contactsCount: 1, hasOverview: true, queries30d: 1 }, glossary: null },
      { canonicalKey: ck('t2'), key: 'ds.t2', found: null, facts: null, glossary: null },
      { canonicalKey: ck('t3'), key: 'ds.t3', found: null, facts: null, glossary: null },
    ],
  };

  // Escopo lido por inteiro: só o catálogo parcial vira "leitura parcial"
  const lido = Object.fromEntries(buildDimensionReport(evidencias).dimensoes.map((d) => [d.id, d]));
  assert.equal(lido.acuracia.situacao, 'sem_falhas');
  assert.equal(lido.clareza.situacao, 'completo');
  assert.equal(lido.acessibilidade.indicadores[0].valorPct, 100);
  assert.equal(lido.acessibilidade.indicadores[0].naoVerificadas, 2);
  assert.equal(lido.acessibilidade.situacao, 'leitura_parcial');

  // Escopo não lido por inteiro: nada vira "sem falhas" nem "completo"
  const report = buildDimensionReport({ ...evidencias, regrasLidas: false });
  const byId = Object.fromEntries(report.dimensoes.map((d) => [d.id, d]));
  assert.equal(byId.acuracia.situacao, 'leitura_parcial');
  assert.equal(byId.clareza.indicadores[0].naoVerificadas, 0);
  assert.equal(byId.clareza.situacao, 'leitura_parcial');
  assert.equal(byId.rastreabilidade.situacao, 'leitura_parcial');
  assert.equal(byId.acessibilidade.situacao, 'leitura_parcial');
  assert.equal(report.resumoNaoConformidades.governancaNaoVerificada, 2);
  // A lacuna das dimensões medidas por regras e sem regras lidas não afirma que não há regras
  for (const id of ['integridade', 'completude']) {
    assert.doesNotMatch(byId[id].lacuna, /Não há regras marcadas/);
    assert.match(byId[id].lacuna, /não é possível afirmar/);
  }
});

test('catalogEntries: lê JSON plano (REST) e vínculos de glossário', () => {
  const restEntry = {
    entrySource: { displayName: 'tabela_a' },
    aspects: {
      '123.global.contacts': { data: { identities: [{ id: 'equipe@exemplo.invalid' }] } },
      '123.global.overview': { data: { content: '<p>Doc</p>' } },
      '123.global.usage': { data: { metrics: [{ name: 'total_queries', timeSeries: [{ interval: '30d', value: 12 }] }] } },
    },
  };
  const item = catalogItemFromEntry({ canonicalKey: 'p.d.t', key: 'd.t' }, restEntry, { entryName: 'e1', entryLocation: 'us' });
  assert.equal(item.found, true);
  assert.deepEqual(item.facts, { contactsCount: 1, hasOverview: true, queries30d: 12 });

  const g = glossaryFactsFromLinks({
    entryLinks: [
      {
        entryLinkType: 'projects/dataplex-types/locations/global/entryLinkTypes/definition',
        entryReferences: [
          { name: 'e1', path: 'Schema.valor', type: 'SOURCE' },
          { name: 'projects/1/locations/global/glossaries/g/terms/saldo', type: 'TARGET' },
        ],
      },
    ],
    nextPageToken: 'tok',
  });
  assert.equal(g.termLinks, 1);
  assert.deepEqual(g.terms, ['saldo']);
  assert.equal(g.truncated, true);
});

test('collectors REST: desembrulho de erro axios, guarda de token, paginação parcial e unreachable dedup', async () => {
  const savedGet = axios.get;
  try {
    // 1) Token ausente não envia Bearer null
    let called = false;
    axios.get = async () => {
      called = true;
      return { data: {} };
    };
    const noTok = await collectors.listDataQualityScansBasic({ accessToken: null, projectId: PROJECT, location: 'global' });
    assert.equal(called, false);
    assert.equal(noTok.diagnostics.length, 1);
    assert.equal(noTok.listingRead, false);

    // 2) Paginação multi-página com unreachable duplicado e erro na página 2 preserva página 1 + truncated=true
    let pageCalls = 0;
    axios.get = async (_url, cfg) => {
      pageCalls += 1;
      if (pageCalls === 1) {
        assert.equal(cfg.params.filter, 'type = "DATA_QUALITY"');
        return {
          data: {
            dataScans: [makeScan('s1', 'ds', 't1')],
            unreachable: ['projects/p/locations/europe-west9', 'projects/p/locations/europe-west9'],
            nextPageToken: 'p2',
          },
        };
      }
      const err = new Error('Request failed with status code 503');
      err.response = {
        status: 503,
        data: {
          error: {
            code: 503,
            message: 'Backend temporarily unavailable',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'UNAVAILABLE' }],
          },
        },
      };
      throw err;
    };
    const res = await collectors.listDataQualityScansBasic({ accessToken: 'tok-ok', projectId: PROJECT, location: 'global' });
    assert.equal(res.scans.length, 1);
    assert.equal(res.listTruncated, true);
    assert.equal(res.listingRead, true);
    assert.equal(res.diagnostics.some((d) => d.mensagem === 'Backend temporarily unavailable' && d.codigo === 503), true);
    const unreachDiag = res.diagnostics.find((d) => d.fonte.includes('inacessíveis'));
    assert.equal(unreachDiag.local, 'projects/p/locations/europe-west9');

    // 3) Falha já na 1ª página: listagem não lida (nada pode ser afirmado sobre o escopo)
    axios.get = async () => {
      const err = new Error('Request failed with status code 403');
      err.response = { status: 403, data: { error: { code: 403, message: 'Permission denied' } } };
      throw err;
    };
    const firstFail = await collectors.listDataQualityScansBasic({ accessToken: 'tok-ok', projectId: PROJECT, location: 'global' });
    assert.equal(firstFail.listingRead, false);
    assert.equal(firstFail.listTruncated, false);
    assert.equal(firstFail.diagnostics.some((d) => d.codigo === 403), true);
  } finally {
    axios.get = savedGet;
  }
});

test('collectors REST: view=FULL, corte MAX_PAGES, metadados, linhagem sem localização e catálogo (found null/false, paginação e truncamento)', async () => {
  const savedGet = axios.get;
  const savedPost = axios.post;
  const httpError = (status) => {
    const e = new Error(`Request failed with status code ${status}`);
    e.response = { status, data: { error: { code: status, message: `erro ${status}` } } };
    return e;
  };
  try {
    // getDataScanFull pede a visão FULL
    let fullParams = null;
    axios.get = async (_url, cfg) => {
      fullParams = cfg.params;
      return { data: { name: 'projects/p/locations/l/dataScans/s' } };
    };
    const full = await collectors.getDataScanFull({ accessToken: 'tok', scanName: 'projects/p/locations/l/dataScans/s' });
    assert.equal(full.ok, true);
    assert.equal(fullParams.view, 'FULL');

    // Listagem com nextPageToken em todas as páginas: para em MAX_PAGES e sinaliza truncamento
    let listCalls = 0;
    axios.get = async () => {
      listCalls += 1;
      return { data: { dataScans: [makeScan(`s${listCalls}`, 'ds', `t${listCalls}`)], nextPageToken: 'mais' } };
    };
    const listed = await collectors.listDataQualityScansBasic({ accessToken: 'tok', projectId: PROJECT, location: 'global' });
    assert.equal(listCalls, collectors.MAX_PAGES);
    assert.equal(listed.listTruncated, true);
    assert.equal(listed.scans.length, collectors.MAX_PAGES);

    // Metadados: campos pedidos, colunas aninhadas contadas e nenhuma lista de colunas no item
    let mdParams = null;
    axios.get = async (_url, cfg) => {
      mdParams = cfg.params;
      return {
        data: {
          location: 'US',
          description: 'Tabela',
          schema: {
            fields: [
              { name: 'a', description: 'A' },
              { name: 'b', fields: [{ name: 'b1', description: 'B1' }, { name: 'b2' }] },
            ],
          },
        },
      };
    };
    const tableRef = {
      canonicalKey: `${PROJECT}.ds.t`,
      key: 'ds.t',
      project: PROJECT,
      dataset: 'ds',
      table: 't',
      isBigQuery: true,
      scanLocations: ['us-central1'],
    };
    const md = await collectors.collectSingleTableMetadata({ accessToken: 'tok', projectId: PROJECT, table: tableRef });
    assert.equal(mdParams.fields, 'location,description,lastModifiedTime,schema');
    assert.equal(md.item.ok, true);
    assert.equal(md.item.location, 'us');
    assert.equal(md.item.totalColumns, 4);
    assert.equal(md.item.columnsWithDescription, 2);
    assert.equal('columns' in md.item, false);

    // Linhagem sem localização da tabela: não chama a API e fica "não lida" (nunca "sem origem")
    let postCalls = 0;
    axios.post = async () => {
      postCalls += 1;
      return { data: { links: [] } };
    };
    const lnNoMeta = await collectors.collectSingleLineage({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: { ok: false } });
    assert.equal(postCalls, 0);
    assert.equal(lnNoMeta.item.ok, false);

    // Com localização: tenta a da tabela e depois a do scan
    axios.post = async (url) => {
      postCalls += 1;
      return url.includes('/locations/us-central1:')
        ? { data: { links: [{ source: { fullyQualifiedName: 'bigquery:p.raw.origem' } }] } }
        : { data: { links: [] } };
    };
    const lnFound = await collectors.collectSingleLineage({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(lnFound.item.ok, true);
    assert.deepEqual(lnFound.item.locationsTried, ['us', 'us-central1']);
    assert.deepEqual(lnFound.item.upstream, ['bigquery:p.raw.origem']);
    assert.equal(lnFound.item.upstreamTruncated, false);
    // Mais elos além da primeira página: a contagem de origens é parcial
    axios.post = async () => ({
      data: { links: [{ source: { fullyQualifiedName: 'bigquery:p.raw.a' } }], nextPageToken: 'mais' },
    });
    const lnTrunc = await collectors.collectSingleLineage({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(lnTrunc.item.upstreamTruncated, true);

    // Catálogo: sem localização -> found null; 404 -> false; 403 -> null com diagnóstico
    const catNoMeta = await collectors.collectSingleCatalogEntry({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: null });
    assert.equal(catNoMeta.item.found, null);
    axios.get = async () => {
      throw httpError(404);
    };
    const cat404 = await collectors.collectSingleCatalogEntry({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(cat404.item.found, false);
    axios.get = async () => {
      throw httpError(403);
    };
    const cat403 = await collectors.collectSingleCatalogEntry({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(cat403.item.found, null);
    assert.equal(cat403.diagnostics[0].codigo, 403);

    // lookupEntryLinks: MAX_LINK_PAGES páginas com nextPageToken -> truncated; erro na página 2 -> truncated + diagnóstico
    const link = (term) => ({
      entryLinkType: 'projects/dataplex-types/locations/global/entryLinkTypes/definition',
      entryReferences: [
        { name: 'e', path: 'Schema.c', type: 'SOURCE' },
        { name: `projects/p/locations/global/glossaries/g/terms/${term}`, type: 'TARGET' },
      ],
    });
    let linkPages = 0;
    axios.get = async (url) => {
      if (!url.includes(':lookupEntryLinks')) return { data: { aspects: {} } };
      linkPages += 1;
      return { data: { entryLinks: [link(`t${linkPages}`)], nextPageToken: 'mais' } };
    };
    const catTrunc = await collectors.collectSingleCatalogEntry({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(catTrunc.item.found, true);
    assert.equal(linkPages, collectors.MAX_LINK_PAGES);
    assert.equal(catTrunc.item.glossary.termLinks, collectors.MAX_LINK_PAGES);
    assert.equal(catTrunc.item.glossary.truncated, true);

    linkPages = 0;
    axios.get = async (url) => {
      if (!url.includes(':lookupEntryLinks')) return { data: { aspects: {} } };
      linkPages += 1;
      if (linkPages === 2) throw httpError(503);
      return { data: { entryLinks: [link('saldo')], nextPageToken: 'mais' } };
    };
    const catPartial = await collectors.collectSingleCatalogEntry({ accessToken: 'tok', projectId: PROJECT, table: tableRef, meta: md.item });
    assert.equal(catPartial.item.glossary.termLinks, 1);
    assert.equal(catPartial.item.glossary.truncated, true);
    assert.equal(catPartial.diagnostics.length, 1);
  } finally {
    axios.get = savedGet;
    axios.post = savedPost;
  }
});

test('parseLabelFilter e matchesLabelFilter: chave-apenas, valor vazio e proteção contra protótipo', () => {
  const keyOnly = parseLabelFilter('escopo');
  const emptyVal = parseLabelFilter('escopo:');
  const exactVal = parseLabelFilter('escopo:rc18');
  const protoKey = parseLabelFilter('constructor');

  assert.equal(matchesLabelFilter({ escopo: 'rc18' }, keyOnly), true);
  assert.equal(matchesLabelFilter({ escopo: '' }, keyOnly), true);
  assert.equal(matchesLabelFilter({ escopo: '' }, emptyVal), true);
  assert.equal(matchesLabelFilter({ escopo: 'rc18' }, emptyVal), false);
  assert.equal(matchesLabelFilter({ escopo: 'rc18' }, exactVal), true);
  assert.equal(matchesLabelFilter({ escopo: 'rc18' }, protoKey), false);
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'timestamp' ? demoData.DEMO_TIME : stable(v)])
    );
  }
  return value;
}

test('rota /api/v1/rc18/overview: demo, filtros, validação 400, cache sem negative caching, refresh=true, IS_SERVICE_ACCOUNT=true e fixture', async () => {
  const express = require('express');
  const savedEnv = {
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
    IS_SERVICE_ACCOUNT: process.env.IS_SERVICE_ACCOUNT,
    DISABLE_AUTH: process.env.DISABLE_AUTH,
  };
  const savedCollectors = { ...collectors };
  process.env.GOOGLE_CLOUD_PROJECT_ID = PROJECT;
  delete process.env.IS_SERVICE_ACCOUNT;
  delete process.env.DISABLE_AUTH;

  let basicCalls = 0;
  let fullCalls = 0;
  let metaCalls = 0;
  let lineageCalls = 0;
  let catalogCalls = 0;
  let saTokenCalls = 0;
  const tokensSeen = new Set();
  let basicResp = { scans: [], listTruncated: false, diagnostics: [] };
  let fullMap = new Map();
  let metaRespByKey = new Map();
  let lineageRespByKey = new Map();
  let catalogRespByKey = new Map();

  // Quando definidas, retêm a etapa correspondente até o teste liberar (requisições simultâneas em voo).
  let basicGate = null;
  let metaGate = null;
  let linksGate = null;
  collectors.listDataQualityScansBasic = async ({ accessToken }) => {
    basicCalls += 1;
    tokensSeen.add(`basic:${accessToken}`);
    if (basicGate) await basicGate;
    return basicResp;
  };
  collectors.getDataScanFull = async ({ scanName, accessToken }) => {
    fullCalls += 1;
    tokensSeen.add(`full:${accessToken}`);
    return fullMap.get(scanName) || { ok: false, scan: null, diagnostics: [{ fonte: 'Dataplex', local: scanName, mensagem: 'Not found', codigo: 404 }] };
  };
  collectors.collectSingleTableMetadata = async ({ table, accessToken }) => {
    metaCalls += 1;
    tokensSeen.add(`meta:${accessToken}`);
    if (metaGate) await metaGate;
    return metaRespByKey.get(table.canonicalKey) || { item: { canonicalKey: table.canonicalKey, key: table.key, ok: false, error: 'Erro BQ' }, diagnostics: [] };
  };
  collectors.collectSingleLineage = async ({ table, accessToken }) => {
    lineageCalls += 1;
    tokensSeen.add(`lineage:${accessToken}`);
    if (linksGate) await linksGate;
    return lineageRespByKey.get(table.canonicalKey) || { item: { canonicalKey: table.canonicalKey, key: table.key, ok: false, upstream: [], error: 'Erro Lineage' }, diagnostics: [] };
  };
  // Padrão: entrada não lida (found null), como o coletor devolve sem localização da tabela.
  collectors.collectSingleCatalogEntry = async ({ table, accessToken }) => {
    catalogCalls += 1;
    tokensSeen.add(`catalog:${accessToken}`);
    if (linksGate) await linksGate;
    return catalogRespByKey.get(table.canonicalKey) || { item: { canonicalKey: table.canonicalKey, key: table.key, found: null, entryName: null, error: 'Erro Catalog' }, diagnostics: [] };
  };

  const app = express();
  app.use(
    '/api/v1/rc18',
    createRc18Router({
      getRequestAccessToken: async () => {
        saTokenCalls += 1;
        return 'sa-token-valido';
      },
      dataFilePath: null,
    })
  );

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/rc18`;
  const get = async (q, token) => {
    const res = await fetch(`${base}/overview${q}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    return { status: res.status, body: await res.json() };
  };

  try {
    // 1) Sem token retorna 401; parâmetros inválidos ou array retornam 400
    assert.equal((await get('?location=global')).status, 401);
    assert.equal((await get('?location=BAD!', 'tok')).status, 400);
    assert.equal((await get('?dataset=bad-ds', 'tok')).status, 400);
    assert.equal((await get('?dataset=a&dataset=b', 'tok')).status, 400);
    assert.equal((await get('?label=:semchave', 'tok')).status, 400);
    assert.equal((await get('?label=a:b:c', 'tok')).status, 400);
    assert.equal((await get('?label=Env', 'tok')).status, 400);

    // 2) Modo demonstração + filtro dataset em demo=true filtra também metadados/linhagem/catálogo
    const demoAll = await get('?demo=true&location=global');
    assert.equal(demoAll.status, 200);
    assert.equal(demoAll.body.demo, true);
    assert.equal(demoAll.body.filtrosCompletos, true);
    assert.equal(demoAll.body.escopo.listagemLida, true);
    assert.equal(demoAll.body.escopo.lidoPorInteiro, true);
    assert.equal(demoAll.body.escopo.scansNaoLidos, 0);
    assert.equal(demoAll.body.escopo.tabelas.length, 4);
    assert.equal(demoAll.body.resumoNaoConformidades.totalRegrasReprovadas, 3);
    assert.equal(demoAll.body.resumoNaoConformidades.scansDesatualizados, 1);
    assert.equal(demoAll.body.resumoNaoConformidades.regrasSuspensas, 1);
    // Marcador por tabela reconcilia 1:1 com o KPI de lacunas de governança
    const demoGapTables = Object.values(demoAll.body.catalogByTable).filter((c) => c.lacunaGovernanca === true);
    assert.equal(demoGapTables.length, demoAll.body.resumoNaoConformidades.lacunasGovernanca);
    assert.equal(demoAll.body.governanceGapKeys, undefined);
    assert.equal(demoAll.body.resumo, undefined);
    assert.equal(demoAll.body.isDemoFallback, undefined);
    assert.equal(demoAll.body.escopo.limiteTabelas, undefined);
    assert.equal(demoAll.body.dimensionGroups.some((g) => 'group' in g || 'inciso' in g), false);
    assert.equal(demoAll.body.otherRulesCount, undefined);
    assert.equal(demoAll.body.dimensionGroups.some((g) => g.rules.some((r) => 'inciso' in r)), false);
    assert.equal(demoAll.body.tableSummaries.some((t) => t.dimensionScores.some((s) => 'inciso' in s)), false);

    const demoFiltered = await get('?demo=true&location=global&dataset=fin_demo_cadastro');
    assert.equal(demoFiltered.status, 200);
    assert.equal(demoFiltered.body.escopo.tabelas.length, 1);
    assert.equal(demoFiltered.body.filtrosDisponiveis.datasets.length, 4);
    const acessFiltered = demoFiltered.body.dimensoes.find((d) => d.id === 'acessibilidade');
    assert.equal(acessFiltered.indicadores[0].denominador, 1);

    // 3) Projeto real vazio -> sem dados presumidos
    const emptyReal = await get('?location=global', 'tok-vazio');
    assert.equal(emptyReal.status, 200);
    assert.equal(emptyReal.body.escopo.tabelas.length, 0);
    assert.equal(emptyReal.body.dimensoes.filter((d) => d.estado === 'medido').length, 0);

    // 4) Erro transitório NÃO é cacheado (sem negative caching)
    basicCalls = 0;
    basicResp = {
      scans: [],
      listTruncated: false,
      listingRead: false,
      diagnostics: [{ fonte: 'Dataplex DataScans (listagem)', local: 'todas as localizações', mensagem: '503', codigo: 503 }],
    };
    const fail1 = await get('?location=global', 'tok-err');
    assert.equal(fail1.status, 200);
    assert.equal(fail1.body.diagnostics.length, 1);
    assert.equal(fail1.body.filtrosCompletos, false);
    assert.equal(fail1.body.escopo.listagemLida, false);
    assert.equal(fail1.body.escopo.lidoPorInteiro, false);
    await get('?location=global', 'tok-err');
    assert.equal(basicCalls, 2);

    // 4b) Listagem cortada sem diagnóstico (MAX_PAGES): lida, mas com filtros incompletos
    basicResp = { scans: [], listTruncated: true, diagnostics: [] };
    const corte = await get('?location=global', 'tok-corte');
    assert.equal(corte.status, 200);
    assert.equal(corte.body.filtrosCompletos, false);
    assert.equal(corte.body.escopo.listagemLida, true);
    assert.equal(corte.body.escopo.lidoPorInteiro, false);

    // 5) Cache de sessão reaproveita troca de filtro e refresh=true invalida todas as camadas
    const sA = makeScan('scan-a', 'ds_a', 't1', {
      labels: { env: 'prod', vazio: '', 'área': 'crédito' },
      executionTime: '2026-01-20T00:00:00Z',
      resultRules: [{ rule: { name: 'r1', column: 'c1', dimension: 'VALIDITY', nonNullExpectation: {} }, passed: true, evaluatedCount: '10', passedCount: '10', passRatio: 1 }],
    });
    const ckA = `${PROJECT}.ds_a.t1`;
    basicCalls = 0;
    fullCalls = 0;
    metaCalls = 0;
    basicResp = { scans: [sA], listTruncated: false, diagnostics: [] };
    fullMap.set(sA.name, { ok: true, scan: sA, diagnostics: [] });
    // Simula falha parcial no catálogo/metadados -> catalogByTable deve ter null explícito
    metaRespByKey.set(ckA, { item: { canonicalKey: ckA, key: 'ds_a.t1', ok: false, error: '403' }, diagnostics: [{ fonte: 'BQ', local: 'ds_a.t1', mensagem: '403', codigo: 403 }] });

    const r1 = await get('?location=global', 'tok-cache');
    assert.equal(r1.status, 200);
    assert.equal(r1.body.filtrosCompletos, true);
    assert.equal(r1.body.escopo.listagemLida, true);
    assert.equal(r1.body.escopo.lidoPorInteiro, true);
    assert.equal(r1.body.escopo.scansNaoLidos, 0);
    assert.equal(basicCalls, 1);
    assert.equal(fullCalls, 1);
    assert.equal(metaCalls, 1);
    const catA = r1.body.catalogByTable[ckA];
    assert.equal(catA.contactsCount, null);
    assert.equal(catA.entryName, null);
    assert.equal(catA.hasUpstream, null);
    assert.equal(catA.found, null);
    assert.equal(catA.glossaryTerms, null);
    assert.equal(catA.glossaryLinksTruncated, null);
    assert.equal(catA.upstreamTruncated, null);
    assert.equal(catA.lacunaGovernanca, false);
    assert.ok(r1.body.filtrosDisponiveis.labels.includes('vazio:'));
    assert.ok(r1.body.filtrosDisponiveis.labels.includes('área:crédito'));

    // Troca de filtro label=vazio: reaproveita sessão (basicCalls e fullCalls permanecem 1);
    // a falha de metadados não ficou em cache e é tentada de novo.
    const r2 = await get('?location=global&label=vazio:', 'tok-cache');
    assert.equal(r2.status, 200);
    assert.equal(r2.body.escopo.tabelas.length, 1);
    assert.equal(basicCalls, 1);
    assert.equal(fullCalls, 1);
    assert.equal(metaCalls, 2);

    // Rótulo com caracteres internacionais (permitidos pelo Google Cloud)
    const rUni = await get(`?location=global&label=${encodeURIComponent('área:crédito')}`, 'tok-cache');
    assert.equal(rUni.status, 200);
    assert.equal(rUni.body.escopo.tabelas.length, 1);

    // Filtro válido sem correspondências retorna 200 mantendo filtrosDisponiveis
    const rZero = await get('?location=global&dataset=nao_existe', 'tok-cache');
    assert.equal(rZero.status, 200);
    assert.equal(rZero.body.escopo.tabelas.length, 0);
    assert.deepEqual(rZero.body.filtrosDisponiveis.datasets, ['ds_a']);

    // refresh=true logo após a criação da sessão (< 15 s) não refaz a coleta
    await get('?location=global&refresh=true', 'tok-cache');
    assert.equal(basicCalls, 1);
    assert.equal(fullCalls, 1);

    // Depois de 15 s, refresh=true descarta a sessão e recarrega etapas 1 e 5
    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 1000;
    try {
      await get('?location=global&refresh=true', 'tok-cache');
    } finally {
      Date.now = realNow;
    }
    assert.equal(basicCalls, 2);
    assert.equal(fullCalls, 2);

    // 6) Modo IS_SERVICE_ACCOUNT=true: token da conta de serviço chega a todos os coletores
    metaRespByKey.set(ckA, {
      item: { canonicalKey: ckA, key: 'ds_a.t1', ok: true, location: 'us', totalColumns: 1, columnsWithDescription: 1, tableDescription: true },
      diagnostics: [],
    });
    lineageRespByKey.set(ckA, { item: { canonicalKey: ckA, key: 'ds_a.t1', ok: true, upstream: ['bigquery:p.raw.origem'] }, diagnostics: [] });
    catalogRespByKey.set(ckA, {
      item: {
        canonicalKey: ckA,
        key: 'ds_a.t1',
        found: true,
        entryName: 'projects/p/locations/us/entryGroups/@bigquery/entries/ds_a.t1',
        facts: { contactsCount: 1, hasOverview: true, queries30d: 3 },
        glossary: { termLinks: 1, terms: ['saldo'], truncated: false },
      },
      diagnostics: [],
    });
    tokensSeen.clear();
    process.env.IS_SERVICE_ACCOUNT = 'true';
    const saRes = await get('?location=global');
    delete process.env.IS_SERVICE_ACCOUNT;
    assert.equal(saRes.status, 200);
    assert.equal(saRes.body.identityMode, 'service_account');
    assert.equal(saTokenCalls, 1);
    assert.equal(saRes.body.escopo.tabelas.length, 1);
    assert.equal(saRes.body.diagnostics.length, 0);
    for (const stage of ['basic', 'full', 'meta', 'lineage', 'catalog']) {
      assert.ok(tokensSeen.has(`${stage}:sa-token-valido`), `token da conta de serviço ausente em ${stage}`);
    }
    assert.equal([...tokensSeen].every((t) => t.endsWith(':sa-token-valido')), true);
    assert.equal(saRes.body.catalogByTable[ckA].found, true);
    assert.equal(saRes.body.catalogByTable[ckA].lacunaGovernanca, false);
    assert.equal(saRes.body.catalogByTable[ckA].upstreamTruncated, false);

    // 6b) Falhas de linhagem e catálogo não ficam no cache da sessão: a requisição seguinte tenta de novo
    const lineageOk = lineageRespByKey.get(ckA);
    const catalogOk = catalogRespByKey.get(ckA);
    lineageRespByKey.set(ckA, {
      item: { canonicalKey: ckA, key: 'ds_a.t1', ok: false, upstream: [], error: '503' },
      diagnostics: [{ fonte: 'Data Lineage API', local: 'ds_a.t1', mensagem: '503', codigo: 503 }],
    });
    catalogRespByKey.set(ckA, {
      item: { canonicalKey: ckA, key: 'ds_a.t1', found: null, entryName: null, error: '503' },
      diagnostics: [{ fonte: 'Knowledge Catalog (GetEntry)', local: 'ds_a.t1', mensagem: '503', codigo: 503 }],
    });
    basicResp = { scans: [sA], listTruncated: false, diagnostics: [] };
    lineageCalls = 0;
    catalogCalls = 0;
    const neg1 = await get('?location=global', 'tok-neg');
    assert.equal(neg1.status, 200);
    assert.equal(neg1.body.catalogByTable[ckA].hasUpstream, null);
    assert.equal(neg1.body.catalogByTable[ckA].found, null);
    lineageRespByKey.set(ckA, lineageOk);
    catalogRespByKey.set(ckA, catalogOk);
    const neg2 = await get('?location=global', 'tok-neg');
    assert.equal(lineageCalls, 2);
    assert.equal(catalogCalls, 2);
    assert.equal(neg2.body.catalogByTable[ckA].hasUpstream, true);
    assert.equal(neg2.body.catalogByTable[ckA].found, true);

    // 6c) Entrada inexistente no catálogo (404): fato verificado, sem contatos nem termos (lacuna)
    catalogRespByKey.set(ckA, {
      item: { canonicalKey: ckA, key: 'ds_a.t1', found: false, entryName: null, error: 'erro 404' },
      diagnostics: [],
    });
    const ausente = await get('?location=global', 'tok-404');
    assert.equal(ausente.body.catalogByTable[ckA].found, false);
    assert.equal(ausente.body.catalogByTable[ckA].contactsCount, 0);
    assert.equal(ausente.body.catalogByTable[ckA].glossaryTermLinks, 0);
    assert.equal(ausente.body.catalogByTable[ckA].lacunaGovernanca, true);
    assert.equal(ausente.body.resumoNaoConformidades.lacunasGovernanca, 1);
    catalogRespByKey.set(ckA, catalogOk);

    // 6d) Listagem com falha depois da 1ª página: escopo não lido por inteiro (nada vira "sem falhas")
    basicResp = {
      scans: [sA],
      listTruncated: true,
      listingRead: true,
      diagnostics: [{ fonte: 'Dataplex DataScans (listagem)', local: 'todas as localizações', mensagem: '503', codigo: 503 }],
    };
    const pag2 = await get('?location=global', 'tok-pag2');
    assert.equal(pag2.body.escopo.listagemLida, true);
    assert.equal(pag2.body.escopo.lidoPorInteiro, false);
    assert.equal(pag2.body.filtrosCompletos, false);
    const pag2Dims = Object.fromEntries(pag2.body.dimensoes.map((d) => [d.id, d]));
    assert.equal(pag2Dims.acuracia.situacao, 'leitura_parcial');
    assert.match(pag2Dims.integridade.lacuna, /não é possível afirmar/);
    basicResp = { scans: [sA], listTruncated: false, diagnostics: [] };

    // 7) Corte MAX_SCANS: lê no máximo 50 scans em detalhe e sinaliza escopo truncado
    const many = Array.from({ length: collectors.MAX_SCANS + 1 }, (_, i) =>
      makeScan(`scan-${String(i).padStart(2, '0')}`, 'ds_m', `t${i}`)
    );
    basicResp = { scans: many, listTruncated: false, diagnostics: [] };
    fullCalls = 0;
    const rMany = await get('?location=global', 'tok-max');
    assert.equal(rMany.status, 200);
    assert.equal(fullCalls, collectors.MAX_SCANS);
    assert.equal(rMany.body.escopo.truncado, true);
    // Nenhum dos 50 scans selecionados foi lido em detalhe (sem resposta FULL no mock)
    assert.equal(rMany.body.escopo.scansNaoLidos, collectors.MAX_SCANS);

    // 7b) Corte MAX_SCANS com os 50 selecionados lidos: o escopo segue não lido por inteiro
    const regraAprovada = [
      { rule: { name: 'r1', column: 'c1', dimension: 'VALIDITY', nonNullExpectation: {} }, passed: true, evaluatedCount: '10', passedCount: '10', passRatio: 1 },
    ];
    const manyOk = Array.from({ length: collectors.MAX_SCANS + 1 }, (_, i) =>
      makeScan(`ok-${String(i).padStart(2, '0')}`, 'ds_k', `t${i}`, { executionTime: '2026-01-20T00:00:00Z', resultRules: regraAprovada })
    );
    for (const s of manyOk) fullMap.set(s.name, { ok: true, scan: s, diagnostics: [] });
    basicResp = { scans: manyOk, listTruncated: false, diagnostics: [] };
    const rManyOk = await get('?location=global', 'tok-max-ok');
    assert.equal(rManyOk.body.filtrosCompletos, true);
    assert.equal(rManyOk.body.escopo.truncado, true);
    assert.equal(rManyOk.body.escopo.scansNaoLidos, 0);
    assert.equal(rManyOk.body.escopo.lidoPorInteiro, false);
    assert.equal(rManyOk.body.dimensoes.find((d) => d.id === 'acuracia').situacao, 'leitura_parcial');

    // 7c) Listagem completa, sem corte, mas um scan sem leitura FULL: nada vira "sem falhas"
    const sB = makeScan('scan-b', 'ds_b', 't2', { executionTime: '2026-01-20T00:00:00Z' });
    fullMap.delete(sB.name);
    basicResp = { scans: [sA, sB], listTruncated: false, diagnostics: [] };
    const rFalhaFull = await get('?location=global', 'tok-full-falha');
    assert.equal(rFalhaFull.body.filtrosCompletos, true);
    assert.equal(rFalhaFull.body.escopo.truncado, false);
    assert.equal(rFalhaFull.body.escopo.scansNaoLidos, 1);
    assert.equal(rFalhaFull.body.escopo.lidoPorInteiro, false);
    const falhaFullDims = Object.fromEntries(rFalhaFull.body.dimensoes.map((d) => [d.id, d]));
    assert.equal(falhaFullDims.acuracia.situacao, 'leitura_parcial');
    assert.match(falhaFullDims.integridade.lacuna, /não é possível afirmar/);

    // 8) Requisições simultâneas compartilham as promessas em voo da sessão em todas as etapas. Cada etapa
    //    fica retida até a outra requisição alcançá-la (sem isso, a 2ª seria só um acerto de cache). No modo
    //    conta de serviço cada requisição pede o token uma vez, o que marca a entrada na rota.
    basicResp = { scans: [sA], listTruncated: false, diagnostics: [] };
    basicCalls = 0;
    fullCalls = 0;
    metaCalls = 0;
    lineageCalls = 0;
    catalogCalls = 0;
    const flush = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    };
    let releaseBasic = () => {};
    let releaseMeta = () => {};
    let releaseLinks = () => {};
    basicGate = new Promise((resolve) => {
      releaseBasic = resolve;
    });
    metaGate = new Promise((resolve) => {
      releaseMeta = resolve;
    });
    linksGate = new Promise((resolve) => {
      releaseLinks = resolve;
    });
    const tokenCallsBefore = saTokenCalls;
    process.env.IS_SERVICE_ACCOUNT = 'true';
    let par1;
    let par2;
    try {
      // Localização ainda sem sessão de cache para a conta de serviço
      const p1 = get('?location=us-east1');
      const p2 = get('?location=us-east1');
      for (let i = 0; i < 400 && saTokenCalls - tokenCallsBefore < 2; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal(saTokenCalls - tokenCallsBefore, 2, 'as duas requisições deveriam ter entrado na rota');
      await flush();
      // Listagem em voo: a 2ª requisição aguarda a da 1ª em vez de iniciar outra
      assert.equal(basicCalls, 1);
      releaseBasic();
      await flush();
      // Leitura FULL e metadados em voo
      assert.equal(fullCalls, 1);
      assert.equal(metaCalls, 1);
      releaseMeta();
      await flush();
      // Linhagem e catálogo em voo
      assert.equal(lineageCalls, 1);
      assert.equal(catalogCalls, 1);
      releaseLinks();
      [par1, par2] = await Promise.all([p1, p2]);
    } finally {
      releaseBasic();
      releaseMeta();
      releaseLinks();
      basicGate = null;
      metaGate = null;
      linksGate = null;
      delete process.env.IS_SERVICE_ACCOUNT;
    }
    assert.equal(par1.status, 200);
    assert.equal(par2.status, 200);
    assert.equal(par1.body.escopo.tabelas.length, 1);
    assert.equal(par2.body.escopo.tabelas.length, 1);
    assert.equal(basicCalls, 1);
    assert.equal(fullCalls, 1);
    assert.equal(metaCalls, 1);
    assert.equal(lineageCalls, 1);
    assert.equal(catalogCalls, 1);

    // 9) Fixture sincronizado para testes de frontend
    const scenarios = {
      demo: stable(demoAll.body),
      vazio: stable(emptyReal.body),
      erroApi: stable(fail1.body),
    };
    const serialized = `${JSON.stringify(scenarios, null, 2)}\n`;
    if (process.env.UPDATE_RC18_FIXTURES === '1') {
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, serialized, 'utf8');
    } else {
      assert.equal(
        fs.readFileSync(FIXTURE_PATH, 'utf8'),
        serialized,
        'Fixture do frontend desatualizado. Rode UPDATE_RC18_FIXTURES=1 npm test em backend/.'
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(collectors, savedCollectors);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('parseScanName e parseTableRef preservam contrato básico', () => {
  assert.deepEqual(parseScanName('projects/p/locations/us-central1/dataScans/s1'), {
    project: 'p',
    location: 'us-central1',
    scanId: 's1',
  });
  assert.deepEqual(parseTableRef('//bigquery.googleapis.com/projects/p/datasets/d/tables/t'), {
    project: 'p',
    dataset: 'd',
    table: 't',
  });
  assert.equal(parseTableRef('gs://bucket/file'), null);
  assert.equal(describeRule({ dimension: 'VALIDITY', nonNullExpectation: {} }).threshold, 1.0);
});

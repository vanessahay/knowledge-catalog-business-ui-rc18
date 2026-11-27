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
 * Visão de não conformidades, regras e tabelas: todas as regras dos DataScans ativos,
 * agrupadas pela dimensão da Resolução Conjunta nº 18/2025 a que foram atribuídas, além do
 * resumo por tabela (incluindo scans ativos com 0 regras para reconciliação 1:1).
 *
 * Função pura. Regras reprovadas são ordenadas primeiro (por maior número de linhas afetadas),
 * seguidas de sem execução, aprovadas e suspensas.
 */

const { DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { scoreFromRules, statusFromScore, round2, canonicalKeyForScan } = require('./dqScans');

function rulePriority(r) {
  if (r.suspended) return 3;
  if (r.executed && r.passed === false) return 0;
  if (!r.executed) return 1;
  return 2;
}

function affectedRowsOf(r) {
  if (r.failedCount !== null && r.failedCount !== undefined) return r.failedCount;
  if (r.assertionRowCount !== null && r.assertionRowCount !== undefined) return r.assertionRowCount;
  return -1;
}

function compareViewRules(a, b) {
  const pa = rulePriority(a);
  const pb = rulePriority(b);
  if (pa !== pb) return pa - pb;
  if (pa === 0) {
    const diff = affectedRowsOf(b) - affectedRowsOf(a);
    if (diff !== 0) return diff;
  }
  const tbl = String(a.tableKey || '').localeCompare(String(b.tableKey || ''));
  if (tbl !== 0) return tbl;
  return String(a.ruleName || '').localeCompare(String(b.ruleName || ''));
}

function toViewRule(r, dimension, entryName) {
  const hasCounts = r.evaluatedCount !== null && r.passedCount !== null;
  const suspended = Boolean(r.suspended);
  return {
    ruleName: r.ruleName || `${r.ruleType}${r.column ? ` (${r.column})` : ''}`,
    description: r.ruleDescription || null,
    column: r.column || '—',
    table: r.table || r.tableKey || '—',
    dataset: r.dataset || '—',
    tableKey: r.tableKey || '—',
    canonicalKey: r.canonicalKey || r.tableKey || '—',
    entryName: entryName || null,
    scanId: r.scanId || null,
    executed: suspended ? false : Boolean(r.executed),
    passed: suspended ? null : r.executed ? r.passed : null,
    suspended,
    threshold: r.threshold === undefined ? null : r.threshold,
    resultKind: r.resultKind || null,
    evaluatedCount: r.evaluatedCount,
    passedCount: r.passedCount,
    failedCount: hasCounts ? Math.max(0, r.evaluatedCount - r.passedCount) : null,
    passPercentage: r.passRatio !== null && r.passRatio !== undefined ? round2(r.passRatio * 100) : null,
    assertionRowCount: r.assertionRowCount === undefined ? null : r.assertionRowCount,
    dimension: r.dqDimension || '—',
    dimensionId: dimension ? dimension.id : null,
    dimensionName: dimension ? dimension.nome : null,
    ruleType: r.ruleType,
    failedRecordsQuery: suspended ? '' : r.failingRowsQuery || '',
    executionTime: r.executionTime || null,
    daysSinceExecution: r.daysSinceExecution === undefined ? null : r.daysSinceExecution,
    isStale: Boolean(r.isStale),
  };
}

function buildQualityView(
  rules = [],
  { dimensions = DIMENSIONS, activeScans = [], tables = [], catalogByKey = {}, scanMetaByKey = null } = {}
) {
  const index = buildDqDimensionIndex(dimensions);
  const byId = new Map(dimensions.map((d) => [d.id, d]));
  const dimensionOf = (r) => byId.get(r.dqDimension ? index.get(r.dqDimension) : undefined) || null;

  const entryNameOf = (canonicalKey) => {
    const cat = catalogByKey && catalogByKey[canonicalKey];
    return cat && cat.found === true && cat.entryName ? cat.entryName : null;
  };

  const grouped = new Map(dimensions.map((d) => [d.id, []]));
  const unmapped = [];
  for (const r of rules) {
    const d = dimensionOf(r);
    if (d) grouped.get(d.id).push(r);
    else unmapped.push(r);
  }

  const dimensionGroups = dimensions
    .filter((d) => grouped.get(d.id).length > 0)
    .map((d) => {
      const list = grouped.get(d.id);
      const s = scoreFromRules(list);
      const viewRules = list
        .map((r) => toViewRule(r, d, entryNameOf(r.canonicalKey || r.tableKey)))
        .sort(compareViewRules);
      return {
        id: d.id,
        name: d.nome,
        dqDimensions: [...new Set(list.map((r) => r.dqDimension).filter(Boolean))].sort(),
        scorePct: s.scorePct,
        rulesEvaluated: s.rulesExecuted,
        rulesPassed: s.rulesPassed,
        rulesFailed: s.rulesFailed,
        rulesNotExecuted: s.rulesNotExecuted,
        rulesSuspended: s.rulesSuspended,
        rules: viewRules,
      };
    });

  // Inicializa `byTable` a partir das tabelas dos scans ativos para cobrir scans com 0 regras.
  const byTable = new Map();
  const tableDescriptorByKey = new Map();
  for (const t of tables || []) {
    if (!t) continue;
    const ck = t.canonicalKey || t.key;
    tableDescriptorByKey.set(ck, t);
    if (!byTable.has(ck)) byTable.set(ck, []);
  }
  for (const scan of activeScans || []) {
    if (!scan) continue;
    const ck = canonicalKeyForScan(scan);
    if (!byTable.has(ck)) byTable.set(ck, []);
  }
  for (const r of rules) {
    const ck = r.canonicalKey || r.tableKey || '—';
    if (!byTable.has(ck)) byTable.set(ck, []);
    byTable.get(ck).push(r);
  }

  const tableSummaries = [...byTable.entries()].map(([canonicalKey, list]) => {
    const all = scoreFromRules(list);
    const desc = tableDescriptorByKey.get(canonicalKey) || null;
    const scanMeta = scanMetaByKey ? scanMetaByKey.get(canonicalKey) : null;
    const times = list.map((r) => r.executionTime).filter(Boolean).sort();
    const lastExecutionTime =
      (scanMeta && scanMeta.executionTime) ||
      (desc && desc.executionTime) ||
      (times.length > 0 ? times[times.length - 1] : null);
    const daysSinceExecution =
      scanMeta && scanMeta.daysSinceExecution !== undefined
        ? scanMeta.daysSinceExecution
        : desc && desc.daysSinceExecution !== undefined
        ? desc.daysSinceExecution
        : list[0] && list[0].daysSinceExecution !== undefined
        ? list[0].daysSinceExecution
        : null;
    const isStale = Boolean(
      (scanMeta && scanMeta.isStale) || (desc && desc.isStale) || list.some((r) => r.isStale)
    );
    const fullTableName =
      (desc && desc.key) || (list[0] && list[0].tableKey) || canonicalKey;
    const dataset = (desc && desc.dataset) || (list[0] && list[0].dataset) || '—';
    const table = (desc && desc.table) || (list[0] && list[0].table) || fullTableName;
    const scanId = (scanMeta && scanMeta.scanId) || (desc && desc.scanId) || (list[0] && list[0].scanId) || null;
    const labels = (scanMeta && scanMeta.labels) || (desc && desc.labels) || (list[0] && list[0].labels) || {};
    const ignoredDuplicates =
      (scanMeta && scanMeta.ignoredDuplicates) || (desc && desc.ignoredDuplicates) || [];

    const dimensionScores = dimensions
      .map((d) => {
        const own = list.filter((r) => dimensionOf(r) === d);
        if (own.length === 0) return null;
        const s = scoreFromRules(own);
        return {
          id: d.id,
          name: d.nome,
          scorePct: s.scorePct,
          rulesEvaluated: s.rulesExecuted,
          rulesPassed: s.rulesPassed,
          rulesFailed: s.rulesFailed,
          rulesNotExecuted: s.rulesNotExecuted,
          rulesSuspended: s.rulesSuspended,
        };
      })
      .filter(Boolean);

    return {
      canonicalKey,
      dataset,
      table,
      fullTableName,
      entryName: entryNameOf(canonicalKey),
      scanId,
      labels,
      totalRules: all.rulesTotal,
      passedRules: all.rulesPassed,
      failedRules: all.rulesFailed,
      notExecutedRules: all.rulesNotExecuted,
      suspendedRules: all.rulesSuspended,
      overallScore: all.scorePct,
      dimensionScores,
      lastExecutionTime,
      daysSinceExecution,
      isStale,
      ignoredDuplicates,
      status: statusFromScore(all),
    };
  });

  tableSummaries.sort((a, b) => {
    if (b.failedRules !== a.failedRules) return b.failedRules - a.failedRules;
    if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
    return String(a.fullTableName).localeCompare(String(b.fullTableName));
  });

  const unmappedView = unmapped
    .map((r) => toViewRule(r, null, entryNameOf(r.canonicalKey || r.tableKey)))
    .sort(compareViewRules);

  return {
    dimensionGroups,
    unmappedRules: unmappedView,
    tableSummaries,
  };
}

module.exports = { buildQualityView, toViewRule, compareViewRules };

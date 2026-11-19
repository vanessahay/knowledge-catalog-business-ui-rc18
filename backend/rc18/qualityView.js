'use strict';

/**
 * Visão "qualidade por tabela": todas as regras dos DataScans, agrupadas pela dimensão da
 * Resolução Conjunta nº 18/2025 (art. 2º, § 2º) a que cada regra foi atribuída.
 *
 * Função pura. Só aparecem as dimensões que têm pelo menos uma regra; regras cuja dimensão de
 * DataScan não corresponde a nenhuma dimensão da Resolução ficam em `unmappedRules` e fora dos
 * scores por dimensão (continuam contando no total de regras da tabela).
 */

const { DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { scoreFromRules, statusFromScore, round2 } = require('./dqScans');

function toViewRule(r, dimension) {
  const hasCounts = r.evaluatedCount !== null && r.passedCount !== null;
  return {
    ruleName: r.ruleName || `${r.ruleType}${r.column ? ` (${r.column})` : ''}`,
    description: r.ruleDescription || null,
    column: r.column || '—',
    table: r.table || r.tableKey || '—',
    dataset: r.dataset || '—',
    tableKey: r.tableKey || '—',
    scanId: r.scanId,
    executed: r.executed,
    passed: r.executed ? r.passed : null,
    resultKind: r.resultKind || null,
    evaluatedCount: r.evaluatedCount,
    passedCount: r.passedCount,
    failedCount: hasCounts ? Math.max(0, r.evaluatedCount - r.passedCount) : null,
    passPercentage: r.passRatio !== null ? round2(r.passRatio * 100) : null,
    assertionRowCount: r.assertionRowCount === undefined ? null : r.assertionRowCount,
    dimension: r.dqDimension || '—',
    dimensionId: dimension ? dimension.id : null,
    dimensionName: dimension ? dimension.nome : null,
    inciso: dimension ? dimension.inciso : null,
    ruleType: r.ruleType,
    failedRecordsQuery: r.failingRowsQuery || '',
    executionTime: r.executionTime,
  };
}

function buildQualityView(rules, dimensions = DIMENSIONS) {
  const index = buildDqDimensionIndex(dimensions);
  const byId = new Map(dimensions.map((d) => [d.id, d]));
  const dimensionOf = (r) => byId.get(r.dqDimension ? index.get(r.dqDimension) : undefined) || null;

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
      return {
        id: d.id,
        inciso: d.inciso,
        name: d.nome,
        group: `art. 2º, § 2º, ${d.inciso}`,
        // Dimensões de DataScan efetivamente usadas pelas regras deste grupo.
        dqDimensions: [...new Set(list.map((r) => r.dqDimension))].sort(),
        scorePct: s.scorePct,
        rulesEvaluated: s.rulesExecuted,
        rulesPassed: s.rulesPassed,
        rulesFailed: s.rulesFailed,
        rulesNotExecuted: s.rulesNotExecuted,
        rules: list.map((r) => toViewRule(r, d)),
      };
    });

  const byTable = new Map();
  for (const r of rules) {
    const key = r.tableKey || '—';
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(r);
  }

  const tableSummaries = [...byTable.entries()].map(([key, list]) => {
    const all = scoreFromRules(list);
    const times = list.map((r) => r.executionTime).filter(Boolean).sort();
    const dimensionScores = dimensions
      .map((d) => {
        const own = list.filter((r) => dimensionOf(r) === d);
        if (own.length === 0) return null;
        const s = scoreFromRules(own);
        return {
          id: d.id,
          inciso: d.inciso,
          name: d.nome,
          scorePct: s.scorePct,
          rulesEvaluated: s.rulesExecuted,
          rulesPassed: s.rulesPassed,
          rulesNotExecuted: s.rulesNotExecuted,
        };
      })
      .filter(Boolean);
    return {
      dataset: list[0].dataset || '—',
      table: list[0].table || key,
      fullTableName: key,
      totalRules: all.rulesTotal,
      passedRules: all.rulesPassed,
      failedRules: all.rulesFailed,
      notExecutedRules: all.rulesNotExecuted,
      overallScore: all.scorePct,
      dimensionScores,
      lastExecutionTime: times.length > 0 ? times[times.length - 1] : null,
      status: statusFromScore(all),
    };
  });

  return {
    dimensionGroups,
    unmappedRules: unmapped.map((r) => toViewRule(r, null)),
    tableSummaries,
    otherRulesCount: unmapped.length,
  };
}

module.exports = { buildQualityView, toViewRule };

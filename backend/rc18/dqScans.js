'use strict';

/**
 * Funções puras para interpretar recursos DataScan (Dataplex API v1) de qualidade de dados.
 *
 * Regras deste módulo:
 *  - Nenhum valor é inventado. O que a API não devolve fica `null`.
 *  - Regra configurada mas sem resultado de execução fica `executed: false` e não entra em score.
 *  - O score segue a definição do próprio Dataplex: regras aprovadas / regras executadas.
 *
 * Observação: `ListDataScans` devolve apenas a visão BASIC (sem spec e sem result). Os objetos
 * aceitos aqui devem vir de `GetDataScan(view=FULL)`.
 */

/**
 * Tipos de regra do Dataplex: [campo da API, rótulo, forma do resultado].
 *   'linhas'   -> regra por linha: a API devolve linhas avaliadas e linhas aprovadas;
 *   'agregada' -> condição sobre a tabela inteira: a API devolve só aprovada/reprovada;
 *   'assercao' -> consulta que lista o que está em desacordo: a API devolve a quantidade de
 *                 linhas retornadas (`assertionRowCount`); zero linhas = aprovada.
 */
const RULE_TYPES = [
  ['nonNullExpectation', 'Não nulo', 'linhas'],
  ['uniquenessExpectation', 'Unicidade', 'linhas'],
  ['rangeExpectation', 'Intervalo', 'linhas'],
  ['regexExpectation', 'Expressão regular', 'linhas'],
  ['setExpectation', 'Conjunto de valores', 'linhas'],
  ['statisticRangeExpectation', 'Estatística em intervalo', 'agregada'],
  ['rowConditionExpectation', 'Condição por linha (SQL)', 'linhas'],
  ['tableConditionExpectation', 'Condição agregada (SQL)', 'agregada'],
  ['sqlAssertion', 'Asserção SQL', 'assercao'],
  ['templateReference', 'Modelo de regra', 'assercao'],
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Converte Timestamp ({seconds,nanos}), string RFC 3339 ou Date em ISO 8601; `null` se ausente. */
function toIsoTime(ts) {
  if (ts === undefined || ts === null || ts === '') return null;
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts.toISOString();
  if (typeof ts === 'object' && ts.seconds !== undefined && ts.seconds !== null) {
    const ms = Number(ts.seconds.toString()) * 1000 + Math.floor(Number(ts.nanos || 0) / 1e6);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

/** Converte int64 (string, number ou Long) em number; `null` se ausente ou inválido. */
function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'object' ? Number(v.toString()) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseScanName(name) {
  const m = /projects\/([^/]+)\/locations\/([^/]+)\/dataScans\/([^/]+)/.exec(String(name || ''));
  return m
    ? { project: m[1], location: m[2], scanId: m[3] }
    : { project: null, location: null, scanId: name ? String(name) : null };
}

/** Extrai projeto/dataset/tabela de um recurso BigQuery; `null` para outros tipos de recurso. */
function parseTableRef(resource) {
  const m = /projects\/([^/]+)\/datasets\/([^/]+)\/tables\/([^/]+)/.exec(String(resource || ''));
  return m ? { project: m[1], dataset: m[2], table: m[3] } : null;
}

function isDataQualityScan(scan) {
  return !!scan && (scan.type === 'DATA_QUALITY' || scan.type === 1);
}

function describeRule(rule) {
  const r = rule || {};
  const typeEntry = RULE_TYPES.find(([key]) => r[key] !== undefined && r[key] !== null);
  const dqDimension = String(r.dimension || '').trim().toUpperCase();
  return {
    ruleName: r.name || null,
    ruleDescription: r.description || null,
    column: r.column || null,
    ruleType: typeEntry ? typeEntry[1] : 'Regra',
    resultKind: typeEntry ? typeEntry[2] : null,
    dqDimension: dqDimension || null,
  };
}

/**
 * Converte um DataScan (visão FULL) em uma lista de regras normalizadas.
 * Usa `dataQualityResult.rules` (última execução) quando existe; caso contrário usa
 * `dataQualitySpec.rules` marcando `executed: false`.
 */
function rulesFromScan(scan) {
  if (!scan) return [];
  const { location, scanId } = parseScanName(scan.name);
  const resource = scan.data?.resource || scan.data?.entity || null;
  const ref = parseTableRef(resource);
  const base = {
    scanId,
    scanDisplayName: scan.displayName || null,
    location,
    resource,
    project: ref ? ref.project : null,
    dataset: ref ? ref.dataset : null,
    table: ref ? ref.table : null,
    tableKey: ref ? `${ref.dataset}.${ref.table}` : resource,
  };

  const resultRules = scan.dataQualityResult?.rules;
  if (Array.isArray(resultRules) && resultRules.length > 0) {
    const executionTime = toIsoTime(scan.executionStatus?.latestJobEndTime);
    return resultRules.map((item) => {
      const passRatio =
        item.passRatio === undefined || item.passRatio === null ? null : Number(item.passRatio);
      const described = describeRule(item.rule);
      // Em proto3 `passed: false` é omitido da resposta: ausência significa reprovada.
      const passed = item.passed === true;
      let evaluatedCount = toNumberOrNull(item.evaluatedCount);
      let passedCount = toNumberOrNull(item.passedCount);
      let ratio = Number.isFinite(passRatio) ? passRatio : null;
      let assertionRowCount = toNumberOrNull(item.assertionRowCount);
      // Cada forma de regra só tem os contadores que lhe cabem. A resposta REST omite os demais;
      // a gRPC os devolve zerados — e um zero desses não é uma medição.
      if (described.resultKind === 'assercao') {
        evaluatedCount = null;
        passedCount = null;
        ratio = null;
        // Zero linhas em desacordo também é omitido na resposta REST: asserção aprovada = 0.
        if (assertionRowCount === null && passed) assertionRowCount = 0;
      } else if (described.resultKind === 'agregada') {
        passedCount = null;
        ratio = null;
        assertionRowCount = null;
      } else if (described.resultKind === 'linhas') {
        assertionRowCount = null;
      }
      return {
        ...base,
        ...described,
        executed: true,
        passed,
        evaluatedCount,
        passedCount,
        passRatio: ratio,
        assertionRowCount,
        failingRowsQuery: item.failingRowsQuery || null,
        executionTime,
      };
    });
  }

  const specRules = scan.dataQualitySpec?.rules;
  if (Array.isArray(specRules) && specRules.length > 0) {
    return specRules.map((rule) => ({
      ...base,
      ...describeRule(rule),
      executed: false,
      passed: null,
      evaluatedCount: null,
      passedCount: null,
      passRatio: null,
      assertionRowCount: null,
      failingRowsQuery: null,
      executionTime: null,
    }));
  }

  return [];
}

/**
 * Score no critério do Dataplex: 100 × regras aprovadas / regras executadas.
 * `scorePct` é `null` quando nenhuma regra foi executada (nunca assume 100).
 */
function scoreFromRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const executed = list.filter((r) => r.executed);
  const passed = executed.filter((r) => r.passed).length;
  return {
    scorePct: executed.length > 0 ? round2((100 * passed) / executed.length) : null,
    rulesTotal: list.length,
    rulesExecuted: executed.length,
    rulesPassed: passed,
    rulesFailed: executed.length - passed,
    rulesNotExecuted: list.length - executed.length,
  };
}

/** Situação factual de um conjunto de regras (sem limiares arbitrários). */
function statusFromScore(score) {
  if (score.rulesExecuted === 0) return 'Sem execução';
  return score.rulesFailed > 0 ? 'Com falhas' : 'Sem falhas';
}

/** Lista as tabelas distintas cobertas pelas regras (escopo do painel). */
function tablesFromRules(rules) {
  const map = new Map();
  for (const r of rules || []) {
    if (!r.dataset || !r.table) continue;
    const key = `${r.project}.${r.dataset}.${r.table}`;
    if (!map.has(key)) {
      map.set(key, {
        key: `${r.dataset}.${r.table}`,
        project: r.project,
        dataset: r.dataset,
        table: r.table,
        scanLocations: new Set(),
        scanIds: new Set(),
      });
    }
    const entry = map.get(key);
    if (r.location) entry.scanLocations.add(r.location);
    if (r.scanId) entry.scanIds.add(r.scanId);
  }
  return [...map.values()].map((t) => ({
    key: t.key,
    project: t.project,
    dataset: t.dataset,
    table: t.table,
    scanLocations: [...t.scanLocations],
    scanIds: [...t.scanIds],
  }));
}

module.exports = {
  round2,
  toIsoTime,
  toNumberOrNull,
  parseScanName,
  parseTableRef,
  isDataQualityScan,
  describeRule,
  rulesFromScan,
  scoreFromRules,
  statusFromScore,
  tablesFromRules,
};

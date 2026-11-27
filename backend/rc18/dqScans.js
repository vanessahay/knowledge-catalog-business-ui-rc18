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
 * Funções puras para interpretar recursos DataScan (Dataplex API v1) de qualidade de dados.
 *
 * Regras deste módulo:
 *  - Nenhum valor é inventado. O que a API não devolve fica `null`.
 *  - Regras `suspended: true` são normalizadas como inativas (`executed: false`, `passed: null`),
 *    ficam fora de `rulesTotal`/`rulesExecuted`/`rulesFailed`/`rulesNotExecuted` e entram em
 *    `rulesSuspended`.
 *  - Múltiplos DataScans para a mesma tabela (`canonicalKey`) são deduplicados deterministicamente
 *    antes do cálculo dos indicadores.
 *  - O score segue a definição do próprio Dataplex: regras aprovadas / regras ativas executadas.
 */

const STALE_SCAN_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tipos de regra do Dataplex: [campo da API, rótulo, forma do resultado].
 *   'linhas'   -> regra por linha: a API devolve linhas avaliadas e linhas aprovadas;
 *   'agregada' -> condição sobre a tabela inteira: a API devolve só aprovada/reprovada;
 *   'assercao' -> consulta que lista o que está em desacordo (`assertionRowCount`); 0 = aprovada;
 *   null       -> `templateReference`: a forma depende do modelo e é inferida conservadoramente.
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
  ['templateReference', 'Modelo de regra', null],
];

const ROW_LEVEL_TYPE_KEYS = new Set(
  RULE_TYPES.filter(([, , kind]) => kind === 'linhas').map(([key]) => key)
);

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Carimbo RFC 3339 do JSON REST; `null` se ausente ou inválido. */
function toIsoTime(ts) {
  if (typeof ts !== 'string' || ts === '') return null;
  return Number.isFinite(Date.parse(ts)) ? ts : null;
}

/** Converte int64 do JSON REST (string ou number) em number; `null` se ausente ou inválido. */
function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
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
  return !!scan && scan.type === 'DATA_QUALITY';
}

/** Chave canônica imune a colisões cross-project e segura para recursos não-BigQuery. */
function canonicalKeyForScan(scan) {
  const resource = scan?.data?.resource || scan?.data?.entity || null;
  const ref = parseTableRef(resource);
  if (ref) return `${ref.project}.${ref.dataset}.${ref.table}`;
  return String(resource || scan?.name || '');
}

/** Calcula carimbo ISO, dias desde a última execução (limitado em >= 0) e sinalização de defasagem. */
function executionFreshness(scan, nowMs = Date.now()) {
  const executionTime = toIsoTime(scan?.executionStatus?.latestJobEndTime);
  if (!executionTime) {
    return { executionTime: null, executionMs: null, daysSinceExecution: null, isStale: false };
  }
  const executionMs = Date.parse(executionTime);
  if (!Number.isFinite(executionMs)) {
    return { executionTime: null, executionMs: null, daysSinceExecution: null, isStale: false };
  }
  const diffMs = Math.max(0, nowMs - executionMs);
  const daysSinceExecution = Math.floor(diffMs / MS_PER_DAY);
  return {
    executionTime,
    executionMs,
    daysSinceExecution,
    isStale: daysSinceExecution > STALE_SCAN_DAYS,
  };
}

/**
 * Deduplica DataScans que apontam para a mesma tabela (`canonicalKey`).
 * Precedência determinística por `canonicalKey`:
 *   1. `latestJobEndTime` presente > ausente
 *   2. `dataQualitySpec.catalogPublishingEnabled === true` > falso/ausente
 *   3. `latestJobEndTime` mais recente
 *   4. ordem léxica do recurso completo `scan.name`
 */
function deduplicateScansByTable(scans = [], nowMs = Date.now()) {
  const groups = new Map();
  for (const scan of scans || []) {
    if (!scan) continue;
    const key = canonicalKeyForScan(scan);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(scan);
  }

  const compareScans = (a, b) => {
    const fa = executionFreshness(a, nowMs);
    const fb = executionFreshness(b, nowMs);
    const hasExecA = fa.executionMs !== null ? 1 : 0;
    const hasExecB = fb.executionMs !== null ? 1 : 0;
    if (hasExecA !== hasExecB) return hasExecB - hasExecA;

    const pubA = a?.dataQualitySpec?.catalogPublishingEnabled === true ? 1 : 0;
    const pubB = b?.dataQualitySpec?.catalogPublishingEnabled === true ? 1 : 0;
    if (pubA !== pubB) return pubB - pubA;

    if (fa.executionMs !== null && fb.executionMs !== null && fa.executionMs !== fb.executionMs) {
      return fb.executionMs - fa.executionMs;
    }

    return String(a?.name || '').localeCompare(String(b?.name || ''));
  };

  const activeScans = [];
  const ignoredDuplicates = [];
  const scanMetaByKey = new Map();

  for (const [canonicalKey, group] of groups.entries()) {
    const sorted = [...group].sort(compareScans);
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const freshness = executionFreshness(winner, nowMs);
    const { location, scanId } = parseScanName(winner.name);
    const resource = winner.data?.resource || winner.data?.entity || null;
    const ref = parseTableRef(resource);
    const loserSummaries = losers.map((s) => {
      const parsed = parseScanName(s.name);
      return {
        canonicalKey,
        tableKey: ref ? `${ref.dataset}.${ref.table}` : String(resource || s.name || ''),
        scanId: parsed.scanId,
        scanName: s.name || null,
        location: parsed.location,
        executionTime: toIsoTime(s.executionStatus?.latestJobEndTime),
        keptScanId: scanId,
      };
    });

    activeScans.push(winner);
    ignoredDuplicates.push(...loserSummaries);
    scanMetaByKey.set(canonicalKey, {
      canonicalKey,
      scanId,
      scanName: winner.name || null,
      scanDisplayName: winner.displayName || null,
      location,
      resource,
      project: ref ? ref.project : null,
      dataset: ref ? ref.dataset : null,
      table: ref ? ref.table : null,
      isBigQuery: Boolean(ref),
      labels: winner.labels && typeof winner.labels === 'object' ? { ...winner.labels } : {},
      catalogPublishingEnabled: winner.dataQualitySpec?.catalogPublishingEnabled === true,
      executionTime: freshness.executionTime,
      daysSinceExecution: freshness.daysSinceExecution,
      isStale: freshness.isStale,
      ignoredDuplicates: loserSummaries.map((d) => d.scanId).filter(Boolean),
    });
  }

  activeScans.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  return { activeScans, ignoredDuplicates, scanMetaByKey };
}

/** Serialização determinística de objetos para assinatura estrutural de regras sem `name`. */
function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function describeRule(rule) {
  const r = rule || {};
  const typeEntry = RULE_TYPES.find(([key]) => r[key] !== undefined && r[key] !== null);
  const typeKey = typeEntry ? typeEntry[0] : null;
  const dqDimension = String(r.dimension || '').trim().toUpperCase();
  const rawThreshold = toNumberOrNull(r.threshold);
  let threshold = null;
  if (rawThreshold !== null && rawThreshold > 0) {
    threshold = rawThreshold;
  } else if (typeKey && ROW_LEVEL_TYPE_KEYS.has(typeKey)) {
    // Na API Dataplex, threshold 0 ou omitido em regras por linha significa 1.0 (100%).
    threshold = 1.0;
  }
  return {
    ruleName: r.name || null,
    ruleDescription: r.description || null,
    column: r.column || null,
    typeKey,
    ruleType: typeEntry ? typeEntry[1] : 'Regra',
    resultKind: typeEntry ? typeEntry[2] : null,
    dqDimension: dqDimension || null,
    threshold,
    suspended: r.suspended === true,
  };
}

/** Assinatura para conciliar regras entre `dataQualitySpec` e `dataQualityResult`. */
function ruleFingerprint(rule) {
  const r = rule || {};
  if (r.name) return `name:${String(r.name)}`;
  const d = describeRule(r);
  const payload = d.typeKey ? stableStringify(r[d.typeKey]) : '';
  return `struct:${d.dqDimension || ''}|${d.column || ''}|${d.typeKey || ''}|${payload}`;
}

/**
 * Regra sem resultado no último job: suspensa ou ativa ainda não executada. Contadores e data ficam
 * `null` e a defasagem `false`: a regra não rodou, então não herda a data do job do scan.
 */
function inactiveRule(base, rule, suspended) {
  return {
    ...base,
    ...describeRule(rule),
    suspended,
    executed: false,
    passed: null,
    evaluatedCount: null,
    passedCount: null,
    passRatio: null,
    assertionRowCount: null,
    failingRowsQuery: null,
    executionTime: null,
    daysSinceExecution: null,
    isStale: false,
  };
}

/**
 * Converte um DataScan (visão FULL) em uma lista de regras normalizadas.
 * Concilia `dataQualitySpec.rules` com `dataQualityResult.rules`: regras suspensas e regras
 * adicionadas à spec depois do último job aparecem como não executadas.
 */
function rulesFromScan(scan, nowMs = Date.now()) {
  if (!scan) return [];
  const { location, scanId } = parseScanName(scan.name);
  const resource = scan.data?.resource || scan.data?.entity || null;
  const ref = parseTableRef(resource);
  const canonicalKey = canonicalKeyForScan(scan);
  const freshness = executionFreshness(scan, nowMs);
  const base = {
    scanId,
    scanName: scan.name || null,
    scanDisplayName: scan.displayName || null,
    location,
    resource,
    canonicalKey,
    project: ref ? ref.project : null,
    dataset: ref ? ref.dataset : null,
    table: ref ? ref.table : null,
    tableKey: ref ? `${ref.dataset}.${ref.table}` : String(resource || scan.name || ''),
    labels: scan.labels && typeof scan.labels === 'object' ? { ...scan.labels } : {},
    daysSinceExecution: freshness.daysSinceExecution,
    isStale: freshness.isStale,
  };

  const specRules = Array.isArray(scan.dataQualitySpec?.rules) ? scan.dataQualitySpec.rules : [];
  const resultRules = Array.isArray(scan.dataQualityResult?.rules) ? scan.dataQualityResult.rules : [];

  if (resultRules.length > 0) {
    // Conciliação entre spec e resultado por multiconjunto (fingerprint = `name` ou assinatura):
    //  - Regras ativas da spec consomem primeiro os resultados não suspensos do mesmo fingerprint,
    //    evitando que uma regra suspensa sem nome sequestre uma regra ativa homônima.
    //  - Se não restar nenhuma regra ativa daquele fingerprint na spec mas houver uma suspensa,
    //    a spec vence (regra foi suspensa depois do último job).
    //  - Regras da spec que sobram sem resultado foram adicionadas depois do último job.
    const activeSpecPool = new Map();
    const suspendedSpecPool = new Map();
    for (const sr of specRules) {
      if (!sr) continue;
      const fp = ruleFingerprint(sr);
      const pool = sr.suspended === true ? suspendedSpecPool : activeSpecPool;
      if (!pool.has(fp)) pool.set(fp, []);
      pool.get(fp).push(sr);
    }

    const out = resultRules.map((item) => {
      const described = describeRule(item.rule);
      const fp = ruleFingerprint(item.rule);
      const activeQueue = activeSpecPool.get(fp);
      const suspendedQueue = suspendedSpecPool.get(fp);
      let suspended = described.suspended;
      if (suspended) {
        if (suspendedQueue && suspendedQueue.length > 0) suspendedQueue.shift();
      } else if (activeQueue && activeQueue.length > 0) {
        activeQueue.shift();
      } else if (suspendedQueue && suspendedQueue.length > 0) {
        suspendedQueue.shift();
        suspended = true;
      }

      if (suspended) return inactiveRule(base, item.rule, true);

      const passRatio =
        item.passRatio === undefined || item.passRatio === null ? null : Number(item.passRatio);
      // Em proto3 `passed: false` é omitido da resposta: ausência significa reprovada.
      const passed = item.passed === true;
      let evaluatedCount = toNumberOrNull(item.evaluatedCount);
      let passedCount = toNumberOrNull(item.passedCount);
      let ratio = Number.isFinite(passRatio) ? passRatio : null;
      let assertionRowCount = toNumberOrNull(item.assertionRowCount);
      let resultKind = described.resultKind;

      if (described.typeKey === 'templateReference') {
        // Inferência conservadora: não presume 'agregada' quando contadores estão ausentes
        // (uma asserção aprovada em REST proto3 omite assertionRowCount = 0).
        if (evaluatedCount !== null) {
          resultKind = 'linhas';
          assertionRowCount = null;
        } else if (assertionRowCount !== null) {
          resultKind = 'assercao';
          evaluatedCount = null;
          passedCount = null;
          ratio = null;
        } else {
          resultKind = null;
          evaluatedCount = null;
          passedCount = null;
          ratio = null;
          assertionRowCount = null;
        }
      } else if (resultKind === 'assercao') {
        evaluatedCount = null;
        passedCount = null;
        ratio = null;
        if (assertionRowCount === null && passed) assertionRowCount = 0;
      } else if (resultKind === 'agregada') {
        passedCount = null;
        ratio = null;
        assertionRowCount = null;
      } else if (resultKind === 'linhas') {
        assertionRowCount = null;
      }

      // O JSON REST (proto3) omite contadores iguais a zero: em regra por linha com total presente,
      // contagem aprovada ausente significa 0 (todas as linhas reprovadas).
      if (resultKind === 'linhas' && evaluatedCount !== null) {
        if (passedCount === null) passedCount = 0;
        if (ratio === null && evaluatedCount > 0) ratio = passedCount / evaluatedCount;
      }

      return {
        ...base,
        ...described,
        resultKind,
        suspended: false,
        executed: true,
        passed,
        evaluatedCount,
        passedCount,
        passRatio: ratio,
        assertionRowCount,
        failingRowsQuery: item.failingRowsQuery || null,
        executionTime: freshness.executionTime,
      };
    });

    // Regras da spec sem resultado no último job: ativas (adicionadas depois) e suspensas.
    for (const queue of activeSpecPool.values()) {
      for (const sr of queue) out.push(inactiveRule(base, sr, false));
    }
    for (const queue of suspendedSpecPool.values()) {
      for (const sr of queue) out.push(inactiveRule(base, sr, true));
    }

    return out;
  }

  // Scan ainda não executado: todas as regras da spec aparecem sem execução (ou suspensas).
  return specRules.filter(Boolean).map((rule) => inactiveRule(base, rule, rule.suspended === true));
}

/**
 * Score no critério do Dataplex: 100 × regras aprovadas / regras ativas executadas.
 * Regras suspensas ficam fora de `rulesTotal`/`rulesExecuted`/`rulesFailed`/`rulesNotExecuted`
 * e são contabilizadas em `rulesSuspended`.
 */
function scoreFromRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const active = list.filter((r) => !r.suspended);
  const rulesSuspended = list.length - active.length;
  const executed = active.filter((r) => r.executed);
  const passed = executed.filter((r) => r.passed === true).length;
  return {
    scorePct: executed.length > 0 ? round2((100 * passed) / executed.length) : null,
    rulesTotal: active.length,
    rulesExecuted: executed.length,
    rulesPassed: passed,
    rulesFailed: executed.length - passed,
    rulesNotExecuted: active.length - executed.length,
    rulesSuspended,
  };
}

/** Situação factual de um conjunto de regras (sem limiares arbitrários). */
function statusFromScore(score) {
  if (score.rulesExecuted === 0) return 'Sem execução';
  return score.rulesFailed > 0 ? 'Com falhas' : 'Sem falhas';
}

/**
 * Deriva a lista de tabelas distintas diretamente dos DataScans ativos (incluindo scans com 0
 * regras ou só regras suspensas), garantindo reconciliação 1:1 com `scansDesatualizados`.
 */
function tablesFromScans(activeScans = [], scanMetaByKey = null, nowMs = Date.now()) {
  const map = new Map();
  for (const scan of activeScans || []) {
    if (!scan) continue;
    const canonicalKey = canonicalKeyForScan(scan);
    if (map.has(canonicalKey)) continue;
    const meta = scanMetaByKey && scanMetaByKey.get(canonicalKey);
    const { location, scanId } = parseScanName(scan.name);
    const resource = scan.data?.resource || scan.data?.entity || null;
    const ref = parseTableRef(resource);
    const freshness = meta
      ? { executionTime: meta.executionTime, daysSinceExecution: meta.daysSinceExecution, isStale: meta.isStale }
      : executionFreshness(scan, nowMs);
    map.set(canonicalKey, {
      canonicalKey,
      key: ref ? `${ref.dataset}.${ref.table}` : String(resource || scan.name || ''),
      project: ref ? ref.project : null,
      dataset: ref ? ref.dataset : null,
      table: ref ? ref.table : null,
      isBigQuery: Boolean(ref),
      resource,
      scanLocations: location ? [location] : [],
      scanId,
      scanName: scan.name || null,
      labels: scan.labels && typeof scan.labels === 'object' ? { ...scan.labels } : {},
      executionTime: freshness.executionTime,
      daysSinceExecution: freshness.daysSinceExecution,
      isStale: freshness.isStale,
      ignoredDuplicates: meta ? [...meta.ignoredDuplicates] : [],
    });
  }
  return [...map.values()];
}

/**
 * Desambigua `tableKey` / `key` após agregar todos os scans ativos: quando mais de um projeto
 * aparece no escopo, prefixa `${project}.` para que tabelas homônimas fiquem distinguíveis na UI.
 */
function disambiguateTableKeys(rules = [], tables = []) {
  const projects = new Set();
  for (const t of tables) if (t.project) projects.add(t.project);
  for (const r of rules) if (r.project) projects.add(r.project);
  if (projects.size <= 1) return { multiProject: false };

  for (const t of tables) {
    if (t.project && t.dataset && t.table) t.key = `${t.project}.${t.dataset}.${t.table}`;
  }
  for (const r of rules) {
    if (r.project && r.dataset && r.table) r.tableKey = `${r.project}.${r.dataset}.${r.table}`;
  }
  return { multiProject: true };
}

module.exports = {
  STALE_SCAN_DAYS,
  round2,
  toIsoTime,
  toNumberOrNull,
  parseScanName,
  parseTableRef,
  isDataQualityScan,
  canonicalKeyForScan,
  executionFreshness,
  deduplicateScansByTable,
  describeRule,
  ruleFingerprint,
  rulesFromScan,
  scoreFromRules,
  statusFromScore,
  tablesFromScans,
  disambiguateTableKeys,
};

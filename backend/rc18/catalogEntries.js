'use strict';

/**
 * Leitura das entradas do Knowledge Catalog (resposta de GetEntry). Funções puras.
 *
 * Os aspectos de sistema têm chave `<número do projeto dataplex-types>.global.<tipo>`. Os tipos
 * usados aqui existem em `projects/dataplex-types/locations/global/aspectTypes`:
 *   - contacts               -> identities[] { role, name, id }
 *   - overview               -> content, links[]
 *   - usage                  -> metrics[] { name, timeSeries[] { interval, value } }, refreshTime
 *   - data-quality-scorecard -> score, status, dimensions[]
 * Os vínculos com termos de glossário não são aspectos: vêm de `lookupEntryLinks`.
 * (O aspecto `refresh-cadence` não é lido: ele descreve garantias de produtos de dados, e o
 * escopo deste painel são tabelas.)
 *
 * Nada é presumido: aspecto ausente ou vazio vira contagem zero ou `null`.
 */

/** Desembrulha google.protobuf.Struct/Value (formato gRPC) em objetos JS simples. */
function normalizeStructValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeStructValue);
  if (typeof value !== 'object') return value;
  if ('kind' in value) {
    switch (value.kind) {
      case 'stringValue':
        return value.stringValue;
      case 'numberValue':
        return value.numberValue;
      case 'boolValue':
        return value.boolValue;
      case 'nullValue':
        return null;
      case 'listValue':
        return ((value.listValue && value.listValue.values) || []).map(normalizeStructValue);
      case 'structValue':
        return normalizeStructValue((value.structValue && value.structValue.fields) || {});
      default:
        return value;
    }
  }
  if (value.fields && typeof value.fields === 'object' && Object.keys(value).length === 1) {
    return normalizeStructValue(value.fields);
  }
  const out = {};
  for (const key of Object.keys(value)) out[key] = normalizeStructValue(value[key]);
  return out;
}

/**
 * Dados do aspecto global de tipo `typeId`, já como objeto JS simples.
 * Devolve `undefined` quando a entrada não tem o aspecto.
 */
function aspectData(entry, typeId) {
  const aspects = entry && entry.aspects;
  if (!aspects || typeof aspects !== 'object') return undefined;
  const key = Object.keys(aspects).find((k) => k.endsWith(`.global.${typeId}`));
  if (!key || !aspects[key]) return undefined;
  const data = normalizeStructValue(aspects[key].data);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function scorecardFromEntry(entry) {
  const data = aspectData(entry, 'data-quality-scorecard');
  if (!data || typeof data.score !== 'number') return null;
  return { score: data.score, status: typeof data.status === 'string' ? data.status : null };
}

/** Fatos de contexto de negócio registrados na entrada (contatos, documentação e uso). */
function catalogFactsFromEntry(entry) {
  const contacts = aspectData(entry, 'contacts');
  const identities = contacts && Array.isArray(contacts.identities) ? contacts.identities : [];
  const contactsCount = identities.filter((i) => i && (i.id || i.name)).length;

  const overview = aspectData(entry, 'overview');
  const hasOverview = !!(overview && typeof overview.content === 'string' && overview.content.trim());

  // `null` = o catálogo não informou a métrica (aspecto ausente ou vazio); 0 = informou zero.
  const usage = aspectData(entry, 'usage');
  let queries30d = null;
  if (usage && Array.isArray(usage.metrics)) {
    const metric = usage.metrics.find((m) => m && m.name === 'total_queries');
    const point =
      metric && Array.isArray(metric.timeSeries) ? metric.timeSeries.find((p) => p && p.interval === '30d') : null;
    const value = point ? Number(point.value) : NaN;
    if (Number.isFinite(value)) queries30d = value;
  }

  return {
    contactsCount,
    hasOverview,
    queries30d,
    usageRefreshTime: usage && typeof usage.refreshTime === 'string' ? usage.refreshTime : null,
  };
}

/**
 * Vínculos de definição (tipo `definition`) entre a entrada de uma tabela e termos de glossário,
 * a partir da resposta de `lookupEntryLinks`. Um vínculo liga a tabela — ou uma coluna, quando a
 * referência de origem traz `path: "Schema.<coluna>"` — a um termo.
 * `truncated` indica que a API tinha mais páginas além da que foi lida.
 */
function glossaryFactsFromLinks(response) {
  const links = (response && Array.isArray(response.entryLinks) ? response.entryLinks : []).filter((l) =>
    /\/entryLinkTypes\/definition$/.test(String((l && l.entryLinkType) || ''))
  );
  const terms = new Set();
  const columns = new Set();
  let tableLevel = false;
  for (const link of links) {
    const refs = Array.isArray(link.entryReferences) ? link.entryReferences : [];
    const target = refs.find((r) => r && r.type === 'TARGET');
    const source = refs.find((r) => r && r.type === 'SOURCE');
    const term = /\/terms\/([^/]+)$/.exec(String((target && target.name) || ''));
    if (term) terms.add(term[1]);
    const column = /^Schema\.(.+)$/.exec(String((source && source.path) || ''));
    if (column) columns.add(column[1]);
    else if (source) tableLevel = true;
  }
  return {
    termLinks: links.length,
    terms: [...terms].sort(),
    columns: [...columns].sort(),
    tableLevel,
    truncated: !!(response && response.nextPageToken),
  };
}

/** Item da visão de catálogo para uma entrada lida com sucesso. */
function catalogItemFromEntry(base, entry, { entryName, entryLocation }) {
  return {
    ...base,
    found: true,
    entryName,
    entryLocation,
    displayName: (entry && entry.entrySource && entry.entrySource.displayName) || base.key,
    aspectTypes: Object.keys((entry && entry.aspects) || {})
      .map((k) => k.split('.').pop())
      .sort(),
    scorecard: scorecardFromEntry(entry),
    facts: catalogFactsFromEntry(entry),
  };
}

module.exports = {
  normalizeStructValue,
  aspectData,
  scorecardFromEntry,
  catalogFactsFromEntry,
  glossaryFactsFromLinks,
  catalogItemFromEntry,
};

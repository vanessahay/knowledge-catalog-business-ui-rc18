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
 * Leitura das entradas do Knowledge Catalog (resposta REST de GetEntry). Funções puras.
 *
 * Os aspectos de sistema têm chave `<número do projeto dataplex-types>.global.<tipo>`:
 *   - contacts -> identities[] { role, name, id }
 *   - overview -> content, links[]
 *   - usage    -> metrics[] { name, timeSeries[] { interval, value } }
 * Os vínculos com termos de glossário vêm de `lookupEntryLinks`.
 *
 * Nada é presumido: aspecto ausente ou vazio vira contagem zero ou `null`.
 */

/**
 * Dados do aspecto global de tipo `typeId`, já como objeto JS simples.
 * Devolve `undefined` quando a entrada não tem o aspecto.
 */
function aspectData(entry, typeId) {
  const aspects = entry && entry.aspects;
  if (!aspects || typeof aspects !== 'object') return undefined;
  const key = Object.keys(aspects).find((k) => k.endsWith(`.global.${typeId}`));
  if (!key || !aspects[key]) return undefined;
  const data = aspects[key].data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
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

  return { contactsCount, hasOverview, queries30d };
}

/**
 * Vínculos de definição (tipo `definition`) entre a entrada de uma tabela e termos de glossário,
 * a partir da resposta de `lookupEntryLinks`.
 * `truncated` indica que a API tinha mais páginas além das lidas ou ocorreu erro parcial.
 */
function glossaryFactsFromLinks(response) {
  const links = (response && Array.isArray(response.entryLinks) ? response.entryLinks : []).filter((l) =>
    /\/entryLinkTypes\/definition$/.test(String((l && l.entryLinkType) || ''))
  );
  const terms = new Set();
  for (const link of links) {
    const refs = Array.isArray(link.entryReferences) ? link.entryReferences : [];
    const target = refs.find((r) => r && r.type === 'TARGET');
    const term = /\/terms\/([^/]+)$/.exec(String((target && target.name) || ''));
    if (term) terms.add(term[1]);
  }
  return {
    termLinks: links.length,
    terms: [...terms].sort(),
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
    facts: catalogFactsFromEntry(entry),
  };
}

module.exports = {
  aspectData,
  catalogFactsFromEntry,
  glossaryFactsFromLinks,
  catalogItemFromEntry,
};

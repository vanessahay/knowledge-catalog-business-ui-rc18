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
 * Coletores REST de evidência do painel RC 18 — chamadas diretas às APIs do Google Cloud.
 *
 * Regras deste módulo:
 *  - Usa chamadas REST via `axios` com `timeout: 20000` e `accessToken` já resolvido uma vez por
 *    requisição (sem vazamento de canais gRPC por requisição e sem corte de campos do SDK v4.1.0).
 *  - Nunca envia `Authorization: Bearer null`: token ausente gera diagnóstico explícito.
 *  - Nenhum erro é engolido: falhas viram itens de `diagnostics` com mensagem real da API.
 *  - Nada é inventado: o que a API não devolve fica ausente / `null`; o que não foi lido também.
 */

const { default: axios } = require('axios');
const { isDataQualityScan } = require('./dqScans');
const { catalogItemFromEntry, glossaryFactsFromLinks } = require('./catalogEntries');

const DEFINITION_LINK_TYPE = 'projects/dataplex-types/locations/global/entryLinkTypes/definition';

const MAX_SCANS = 50;
const MAX_PAGES = 20;
const MAX_LINK_PAGES = 5;
const CONCURRENCY = 6;
const HTTP_TIMEOUT_MS = 20000;

function diag(fonte, local, err) {
  const apiError = err && err.response && err.response.data && err.response.data.error;
  const source = apiError || err;
  // Em respostas REST do Google Cloud, `apiError.details` é um array de objetos: usa `message`.
  const message =
    source && typeof source.message === 'string' && source.message ? source.message : String(source || 'Erro desconhecido');
  const rawCode =
    apiError && apiError.code !== undefined
      ? apiError.code
      : err && err.response && err.response.status !== undefined
      ? err.response.status
      : err && err.code !== undefined
      ? err.code
      : null;
  return {
    fonte,
    local,
    mensagem: String(message).slice(0, 400),
    codigo: rawCode,
  };
}

function validToken(accessToken) {
  return typeof accessToken === 'string' && accessToken.trim() ? accessToken.trim() : null;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Lista os DataScans de qualidade de dados em visão BASIC via REST paginado.
 * Retorna todos os scans encontrados (até `MAX_PAGES = 20` páginas) para que `filtrosDisponiveis`
 * e filtros `dataset`/`label` sejam aplicados ANTES do corte `MAX_SCANS = 50`.
 * `listingRead` é falso sem token ou com falha já na 1ª página: nada pode ser afirmado sobre o escopo.
 */
async function listDataQualityScansBasic({ accessToken, projectId, location }) {
  const allLocations = !location || location === 'global' || location === 'all';
  const locSegment = allLocations ? '-' : encodeURIComponent(location);
  const localLabel = allLocations ? 'todas as localizações' : location;
  const diagnostics = [];
  const token = validToken(accessToken);
  if (!token) {
    diagnostics.push(diag('Dataplex DataScans (listagem)', localLabel, new Error('Token de acesso indisponível.')));
    return { scans: [], listTruncated: false, listingRead: false, diagnostics };
  }

  const scans = [];
  const unreachable = new Set();
  let pageToken = null;
  let listTruncated = false;
  let pagesRead = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    try {
      const params = { filter: 'type = "DATA_QUALITY"', pageSize: 100 };
      if (pageToken) params.pageToken = pageToken;
      const resp = await axios.get(
        `https://dataplex.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${locSegment}/dataScans`,
        { headers: authHeaders(token), params, timeout: HTTP_TIMEOUT_MS }
      );
      pagesRead += 1;
      const data = resp.data || {};
      const items = Array.isArray(data.dataScans) ? data.dataScans : [];
      for (const s of items) {
        if (isDataQualityScan(s)) scans.push(s);
      }
      if (Array.isArray(data.unreachable)) {
        for (const loc of data.unreachable) {
          if (loc) unreachable.add(String(loc));
        }
      }
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
      if (page === MAX_PAGES) listTruncated = true;
    } catch (err) {
      diagnostics.push(diag('Dataplex DataScans (listagem)', localLabel, err));
      if (page > 1) listTruncated = true;
      break;
    }
  }

  if (unreachable.size > 0) {
    diagnostics.push({
      fonte: 'Dataplex DataScans (localizações inacessíveis)',
      local: [...unreachable].sort().join(', '),
      mensagem: 'Algumas localizações não responderam durante a listagem agregada.',
      codigo: null,
    });
  }

  scans.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  return { scans, listTruncated, listingRead: pagesRead > 0, diagnostics };
}

/** Lê um único DataScan em visão FULL via REST (preservando threshold, suspended e templateReference). */
async function getDataScanFull({ accessToken, scanName }) {
  const token = validToken(accessToken);
  if (!token) {
    return {
      ok: false,
      scan: null,
      diagnostics: [diag('Dataplex DataScan (detalhe)', scanName, new Error('Token de acesso indisponível.'))],
    };
  }
  try {
    const resp = await axios.get(`https://dataplex.googleapis.com/v1/${scanName}`, {
      headers: authHeaders(token),
      params: { view: 'FULL' },
      timeout: HTTP_TIMEOUT_MS,
    });
    return { ok: true, scan: resp.data, diagnostics: [] };
  } catch (err) {
    return { ok: false, scan: null, diagnostics: [diag('Dataplex DataScan (detalhe)', scanName, err)] };
  }
}

function flattenFields(fields, prefix = '') {
  const out = [];
  for (const f of fields || []) {
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    out.push({ name, hasDescription: !!(f.description && String(f.description).trim()) });
    if (Array.isArray(f.fields) && f.fields.length > 0) out.push(...flattenFields(f.fields, name));
  }
  return out;
}

/** Lê os metadados (descrições, localização, última modificação) de uma tabela BigQuery via REST. */
async function collectSingleTableMetadata({ accessToken, projectId, table }) {
  const base = {
    canonicalKey: table.canonicalKey,
    key: table.key,
    project: table.project,
    dataset: table.dataset,
    table: table.table,
  };
  if (table.isBigQuery === false || !table.dataset || !table.table) {
    return {
      item: { ...base, ok: false, nonBigQuery: true, error: 'Recurso não é uma tabela BigQuery.' },
      diagnostics: [],
    };
  }
  const token = validToken(accessToken);
  if (!token) {
    const d = diag('BigQuery (metadados da tabela)', table.key, new Error('Token de acesso indisponível.'));
    return { item: { ...base, ok: false, error: d.mensagem }, diagnostics: [d] };
  }
  const targetProject = table.project || projectId;
  try {
    const resp = await axios.get(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(targetProject)}/datasets/${encodeURIComponent(table.dataset)}/tables/${encodeURIComponent(table.table)}`,
      {
        headers: authHeaders(token),
        params: { fields: 'location,description,lastModifiedTime,schema' },
        timeout: HTTP_TIMEOUT_MS,
      }
    );
    const meta = resp.data || {};
    const columns = flattenFields(meta.schema && meta.schema.fields);
    const lastModifiedMs = Number(meta.lastModifiedTime);
    return {
      item: {
        ...base,
        ok: true,
        location: meta.location ? String(meta.location).toLowerCase() : null,
        tableDescription: !!(meta.description && String(meta.description).trim()),
        totalColumns: columns.length,
        columnsWithDescription: columns.filter((c) => c.hasDescription).length,
        lastModifiedTime:
          Number.isFinite(lastModifiedMs) && lastModifiedMs > 0 ? new Date(lastModifiedMs).toISOString() : null,
      },
      diagnostics: [],
    };
  } catch (err) {
    const d = diag('BigQuery (metadados da tabela)', table.key, err);
    return { item: { ...base, ok: false, error: d.mensagem.slice(0, 300) }, diagnostics: [d] };
  }
}

/**
 * Consulta a Data Lineage API REST apenas para elos de origem (upstream) de uma tabela do escopo.
 * Usa `table.project || projectId` para suportar tabelas cross-project.
 */
async function collectSingleLineage({ accessToken, projectId, table, meta }) {
  const base = {
    canonicalKey: table.canonicalKey,
    key: table.key,
    project: table.project,
    dataset: table.dataset,
    table: table.table,
  };
  if (table.isBigQuery === false || !table.dataset || !table.table) {
    return {
      item: { ...base, ok: false, nonBigQuery: true, locationsTried: [], upstream: [], error: 'Recurso não é uma tabela BigQuery.' },
      diagnostics: [],
    };
  }
  // Sem a localização da tabela (metadados do BigQuery não lidos) não há como saber onde a
  // linhagem está registrada: o item fica "não lido" em vez de virar "sem origem".
  if (!meta || !meta.ok || !meta.location) {
    return {
      item: {
        ...base,
        ok: false,
        locationsTried: [],
        upstream: [],
        error: 'Localização da tabela indisponível (metadados do BigQuery não lidos).',
      },
      diagnostics: [],
    };
  }
  const token = validToken(accessToken);
  if (!token) {
    const d = diag('Data Lineage API', table.key, new Error('Token de acesso indisponível.'));
    return { item: { ...base, ok: false, locationsTried: [], upstream: [], error: d.mensagem }, diagnostics: [d] };
  }

  const targetProject = table.project || projectId;
  const fqn = `bigquery:${targetProject}.${table.dataset}.${table.table}`;
  const candidates = [...new Set([meta && meta.location, ...(table.scanLocations || []), 'us'].filter(Boolean))];
  const tried = [];

  try {
    for (const loc of candidates) {
      tried.push(loc);
      const resp = await axios.post(
        `https://datalineage.googleapis.com/v1/projects/${encodeURIComponent(targetProject)}/locations/${encodeURIComponent(loc)}:searchLinks`,
        { target: { fullyQualifiedName: fqn }, pageSize: 50 },
        {
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
        }
      );
      const links = Array.isArray(resp.data && resp.data.links) ? resp.data.links : [];
      if (links.length === 0) continue;
      const upstream = [...new Set(links.map((l) => l.source && l.source.fullyQualifiedName).filter(Boolean))];
      // Só a primeira página é lida: `nextPageToken` indica mais elos (contagem de origens parcial).
      const upstreamTruncated = Boolean(resp.data && resp.data.nextPageToken);
      return {
        item: { ...base, ok: true, location: loc, locationsTried: tried, upstream, upstreamTruncated },
        diagnostics: [],
      };
    }
    return {
      item: { ...base, ok: true, location: null, locationsTried: tried, upstream: [], upstreamTruncated: false },
      diagnostics: [],
    };
  } catch (err) {
    const d = diag('Data Lineage API', `${table.key} (${tried.join(', ')})`, err);
    return {
      item: { ...base, ok: false, locationsTried: tried, upstream: [], error: d.mensagem.slice(0, 300) },
      diagnostics: [d],
    };
  }
}

/**
 * Lê a entrada do Knowledge Catalog (`GetEntry?view=ALL`) e pagina `lookupEntryLinks` (até
 * `MAX_LINK_PAGES = 5` páginas = 50 vínculos) para uma tabela do escopo via REST.
 */
async function collectSingleCatalogEntry({ accessToken, projectId, table, meta }) {
  const targetProject = table.project || projectId;
  const base = {
    canonicalKey: table.canonicalKey,
    key: table.key,
    project: targetProject,
    dataset: table.dataset,
    table: table.table,
  };
  if (table.isBigQuery === false || !table.dataset || !table.table) {
    return {
      item: { ...base, found: null, entryName: null, error: 'Recurso não é uma tabela BigQuery.' },
      diagnostics: [],
    };
  }
  if (!meta || !meta.ok || !meta.location) {
    return {
      item: {
        ...base,
        found: null,
        entryName: null,
        error: 'Localização da tabela indisponível (metadados do BigQuery não lidos).',
      },
      diagnostics: [],
    };
  }
  const token = validToken(accessToken);
  if (!token) {
    const d = diag('Knowledge Catalog (GetEntry)', table.key, new Error('Token de acesso indisponível.'));
    return { item: { ...base, found: null, entryName: null, error: d.mensagem }, diagnostics: [d] };
  }

  const entryName = `projects/${targetProject}/locations/${meta.location}/entryGroups/@bigquery/entries/bigquery.googleapis.com/projects/${targetProject}/datasets/${table.dataset}/tables/${table.table}`;
  const diagnostics = [];
  let item;
  try {
    const resp = await axios.get(`https://dataplex.googleapis.com/v1/${entryName}`, {
      headers: authHeaders(token),
      params: { view: 'ALL' },
      timeout: HTTP_TIMEOUT_MS,
    });
    item = catalogItemFromEntry(base, resp.data, { entryName, entryLocation: meta.location });
  } catch (err) {
    const d = diag('Knowledge Catalog (GetEntry)', table.key, err);
    // Só um 404 comprova que a entrada não existe; 403, 5xx e timeout significam "não lida".
    const notFound = Boolean(err && err.response && err.response.status === 404);
    return {
      item: {
        ...base,
        found: notFound ? false : null,
        entryName: null,
        entryLocation: meta.location,
        error: d.mensagem.slice(0, 300),
      },
      diagnostics: [d],
    };
  }

  // Pagina vínculos com termos de glossário (até MAX_LINK_PAGES = 5).
  const allLinks = [];
  let pageToken = null;
  let hasNext = false;
  let readAnyPage = false;

  for (let page = 1; page <= MAX_LINK_PAGES; page += 1) {
    try {
      const params = { entry: item.entryName, entryLinkTypes: DEFINITION_LINK_TYPE, pageSize: 10 };
      if (pageToken) params.pageToken = pageToken;
      const resp = await axios.get(
        `https://dataplex.googleapis.com/v1/projects/${encodeURIComponent(targetProject)}/locations/${encodeURIComponent(item.entryLocation)}:lookupEntryLinks`,
        { headers: authHeaders(token), params, timeout: HTTP_TIMEOUT_MS }
      );
      readAnyPage = true;
      const data = resp.data || {};
      if (Array.isArray(data.entryLinks)) allLinks.push(...data.entryLinks);
      pageToken = data.nextPageToken || null;
      if (!pageToken) {
        hasNext = false;
        break;
      }
      if (page === MAX_LINK_PAGES) hasNext = true;
    } catch (err) {
      diagnostics.push(diag('Knowledge Catalog (lookupEntryLinks)', item.key, err));
      if (page > 1) hasNext = true;
      break;
    }
  }

  if (readAnyPage) {
    item.glossary = glossaryFactsFromLinks({ entryLinks: allLinks, nextPageToken: hasNext ? 'truncated' : null });
  }

  return { item, diagnostics };
}

module.exports = {
  MAX_SCANS,
  MAX_PAGES,
  MAX_LINK_PAGES,
  CONCURRENCY,
  HTTP_TIMEOUT_MS,
  diag,
  mapLimit,
  listDataQualityScansBasic,
  getDataScanFull,
  collectSingleTableMetadata,
  collectSingleLineage,
  collectSingleCatalogEntry,
};

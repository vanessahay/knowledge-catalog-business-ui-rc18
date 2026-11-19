'use strict';

/**
 * Coletores de evidência do painel RC 18 — chamadas às APIs do Google Cloud.
 *
 * Regras deste módulo:
 *  - Toda chamada usa exclusivamente a identidade recebida em `auth` (token do usuário ou conta
 *    de serviço, conforme o modo configurado). Não há troca de identidade em caso de erro.
 *  - Nenhum erro é engolido: falhas viram itens de `diagnostics` devolvidos ao chamador.
 *  - Nada é inventado: o que a API não devolve fica ausente.
 */

const { CatalogServiceClient, DataScanServiceClient } = require('@google-cloud/dataplex');
const { LineageClient } = require('@google-cloud/lineage');
const { BigQuery } = require('@google-cloud/bigquery');
const { default: axios } = require('axios');
const { isDataQualityScan } = require('./dqScans');
const {
  normalizeStructValue,
  scorecardFromEntry,
  catalogItemFromEntry,
  glossaryFactsFromLinks,
} = require('./catalogEntries');

const DEFINITION_LINK_TYPE = 'projects/dataplex-types/locations/global/entryLinkTypes/definition';

const MAX_SCANS = 50;
// Cada DataScan aponta para uma tabela: com o mesmo limite, a lista de tabelas nunca é cortada
// separadamente da lista de scans (o corte de scans é sinalizado em `truncated`).
const MAX_TABLES = MAX_SCANS;
const CONCURRENCY = 6;

function diag(fonte, local, err) {
  const message = err && (err.details || err.message) ? err.details || err.message : String(err);
  return { fonte, local, mensagem: String(message).slice(0, 400), codigo: err && err.code !== undefined ? err.code : null };
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

function clientOptions(auth) {
  return auth ? { auth } : {};
}

/**
 * Lista os DataScans e lê em visão FULL os de qualidade de dados.
 * (`ListDataScans` só devolve a visão BASIC, sem regras e sem resultado.)
 */
async function collectDataQualityScans({ auth, projectId, location }) {
  const client = new DataScanServiceClient(clientOptions(auth));
  const allLocations = !location || location === 'global' || location === 'all';
  const parent = `projects/${projectId}/locations/${allLocations ? '-' : location}`;
  const diagnostics = [];

  let listed = [];
  try {
    const [scans] = await client.listDataScans({ parent });
    listed = scans || [];
  } catch (err) {
    diagnostics.push(diag('Dataplex DataScans (listagem)', allLocations ? 'todas as localizações' : location, err));
  }

  const dataQuality = listed.filter(isDataQualityScan);
  const selected = dataQuality.slice(0, MAX_SCANS);
  const scans = [];
  await mapLimit(selected, CONCURRENCY, async (s) => {
    try {
      const [full] = await client.getDataScan({ name: s.name, view: 'FULL' });
      scans.push(full);
    } catch (err) {
      diagnostics.push(diag('Dataplex DataScan (detalhe)', s.name, err));
    }
  });
  scans.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    scans,
    totalListed: listed.length,
    totalDataQuality: dataQuality.length,
    truncated: dataQuality.length > selected.length,
    diagnostics,
  };
}

function flattenFields(fields, prefix = '') {
  const out = [];
  for (const f of fields || []) {
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    out.push({
      name,
      hasDescription: !!(f.description && String(f.description).trim()),
      policyTags: (f.policyTags && f.policyTags.names) || [],
    });
    if (Array.isArray(f.fields) && f.fields.length > 0) out.push(...flattenFields(f.fields, name));
  }
  return out;
}

/** Lê os metadados (descrições, Policy Tags, localização, última modificação) das tabelas do escopo. */
async function collectTableMetadata({ auth, projectId, tables }) {
  const bigquery = new BigQuery(auth ? { projectId, authClient: auth } : { projectId });
  const diagnostics = [];
  const selected = tables.slice(0, MAX_TABLES);

  const items = await mapLimit(selected, CONCURRENCY, async (t) => {
    const base = { key: t.key, project: t.project, dataset: t.dataset, table: t.table };
    try {
      const [meta] = await bigquery
        .dataset(t.dataset, { projectId: t.project || projectId })
        .table(t.table)
        .getMetadata();
      const columns = flattenFields(meta.schema && meta.schema.fields);
      const lastModifiedMs = Number(meta.lastModifiedTime);
      return {
        ...base,
        ok: true,
        location: meta.location ? String(meta.location).toLowerCase() : null,
        tableDescription: !!(meta.description && String(meta.description).trim()),
        totalColumns: columns.length,
        columnsWithDescription: columns.filter((c) => c.hasDescription).length,
        lastModifiedTime: Number.isFinite(lastModifiedMs) && lastModifiedMs > 0 ? new Date(lastModifiedMs).toISOString() : null,
        columns,
      };
    } catch (err) {
      diagnostics.push(diag('BigQuery (metadados da tabela)', t.key, err));
      return { ...base, ok: false, error: String(err.message || err).slice(0, 300) };
    }
  });

  return { items, truncated: tables.length > selected.length, diagnostics };
}

/**
 * Consulta a Data Lineage API para cada tabela do escopo: elos de origem, de destino e os
 * processos que geraram os elos de origem.
 */
async function collectLineage({ auth, projectId, tables, metadataByKey = {} }) {
  const client = new LineageClient(clientOptions(auth));
  const diagnostics = [];
  const selected = tables.slice(0, MAX_TABLES);

  const items = await mapLimit(selected, CONCURRENCY, async (t) => {
    const base = { key: t.key, dataset: t.dataset, table: t.table };
    const fqn = `bigquery:${t.project}.${t.dataset}.${t.table}`;
    const meta = metadataByKey[t.key];
    const candidates = [...new Set([meta && meta.location, ...(t.scanLocations || []), 'us'].filter(Boolean))];
    const tried = [];
    try {
      for (const loc of candidates) {
        tried.push(loc);
        const parent = `projects/${projectId}/locations/${loc}`;
        const [upLinks] = await client.searchLinks({ parent, target: { fullyQualifiedName: fqn } }, { autoPaginate: false });
        const [downLinks] = await client.searchLinks({ parent, source: { fullyQualifiedName: fqn } }, { autoPaginate: false });
        const up = upLinks || [];
        const down = downLinks || [];
        if (up.length === 0 && down.length === 0) continue;

        const processes = [];
        if (up.length > 0) {
          const [processLinks] = await client.batchSearchLinkProcesses(
            { parent, links: up.slice(0, 10).map((l) => l.name) },
            { autoPaginate: false }
          );
          const names = [...new Set((processLinks || []).map((p) => p.process).filter(Boolean))].slice(0, 3);
          for (const name of names) {
            const [proc] = await client.getProcess({ name });
            processes.push({
              name,
              displayName: proc.displayName || null,
              sourceType: proc.origin && proc.origin.sourceType ? String(proc.origin.sourceType) : null,
              originName: (proc.origin && proc.origin.name) || null,
            });
          }
        }
        return {
          ...base,
          ok: true,
          location: loc,
          locationsTried: tried,
          upstream: [...new Set(up.map((l) => l.source && l.source.fullyQualifiedName).filter(Boolean))],
          downstream: [...new Set(down.map((l) => l.target && l.target.fullyQualifiedName).filter(Boolean))],
          processes,
        };
      }
      return { ...base, ok: true, location: null, locationsTried: tried, upstream: [], downstream: [], processes: [] };
    } catch (err) {
      diagnostics.push(diag('Data Lineage API', `${t.key} (${tried.join(', ')})`, err));
      return { ...base, ok: false, locationsTried: tried, error: String(err.details || err.message || err).slice(0, 300) };
    }
  });

  return { items, truncated: tables.length > selected.length, diagnostics };
}

/**
 * Lê as entradas do Knowledge Catalog das tabelas do escopo (GetEntry, visão ALL: aspectos de
 * contatos, documentação, uso e scorecard), os vínculos de cada entrada com termos de glossário
 * (`lookupEntryLinks`, primeira página: até 10 vínculos por tabela) e chama `lookupContext`
 * (até 10 recursos por localização).
 */
async function collectCatalogContext({ auth, projectId, tables, metadataByKey = {}, getAccessToken }) {
  const client = new CatalogServiceClient(clientOptions(auth));
  const diagnostics = [];
  const selected = tables.slice(0, MAX_TABLES);

  const items = await mapLimit(selected, CONCURRENCY, async (t) => {
    const meta = metadataByKey[t.key];
    const base = {
      key: t.key,
      dataset: t.dataset,
      table: t.table,
      linkedResource: `//bigquery.googleapis.com/projects/${t.project}/datasets/${t.dataset}/tables/${t.table}`,
    };
    if (!meta || !meta.ok || !meta.location) {
      return { ...base, found: false, error: 'Localização da tabela indisponível (metadados do BigQuery não lidos).' };
    }
    const entryName = `projects/${t.project}/locations/${meta.location}/entryGroups/@bigquery/entries/bigquery.googleapis.com/projects/${t.project}/datasets/${t.dataset}/tables/${t.table}`;
    try {
      const [entry] = await client.getEntry({ name: entryName, view: 'ALL' });
      return catalogItemFromEntry(base, entry, { entryName, entryLocation: meta.location });
    } catch (err) {
      diagnostics.push(diag('Knowledge Catalog (GetEntry)', t.key, err));
      return { ...base, found: false, entryName, entryLocation: meta.location, error: String(err.details || err.message || err).slice(0, 300) };
    }
  });

  const byLocation = new Map();
  for (const item of items) {
    if (!item.found) continue;
    if (!byLocation.has(item.entryLocation)) byLocation.set(item.entryLocation, []);
    if (byLocation.get(item.entryLocation).length < 10) byLocation.get(item.entryLocation).push(item.entryName);
  }

  const contexts = [];
  if (byLocation.size > 0) {
    let token = null;
    try {
      token = await getAccessToken();
    } catch (err) {
      diagnostics.push(diag('Knowledge Catalog (lookupContext e lookupEntryLinks)', 'credencial', err));
    }
    if (token) {
      // Termos de glossário vinculados à tabela ou às suas colunas. Falha de leitura deixa
      // `glossary` ausente (a tabela fica fora do indicador) e vai para `diagnostics`.
      await mapLimit(items.filter((i) => i.found), CONCURRENCY, async (item) => {
        try {
          const resp = await axios.get(
            `https://dataplex.googleapis.com/v1/projects/${projectId}/locations/${item.entryLocation}:lookupEntryLinks`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { entry: item.entryName, entryLinkTypes: DEFINITION_LINK_TYPE, pageSize: 10 },
              timeout: 20000,
            }
          );
          item.glossary = glossaryFactsFromLinks(resp.data);
        } catch (err) {
          const apiError = err.response && err.response.data && err.response.data.error;
          diagnostics.push(diag('Knowledge Catalog (lookupEntryLinks)', item.key, apiError || err));
        }
      });

      for (const [loc, resources] of byLocation.entries()) {
        try {
          const resp = await axios.post(
            `https://dataplex.googleapis.com/v1/projects/${projectId}/locations/${loc}:lookupContext`,
            { resources },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
          );
          const context = resp.data && typeof resp.data.context === 'string' ? resp.data.context : null;
          if (context) contexts.push({ location: loc, resources: resources.length, context });
          else diagnostics.push({ fonte: 'Knowledge Catalog (lookupContext)', local: loc, mensagem: 'Resposta sem o campo "context".', codigo: null });
        } catch (err) {
          const apiError = err.response && err.response.data && err.response.data.error;
          diagnostics.push(diag('Knowledge Catalog (lookupContext)', loc, apiError || err));
        }
      }
    }
  }

  return { items, contexts, truncated: tables.length > selected.length, diagnostics };
}

/**
 * Conta os perfis de tabela do Sensitive Data Protection (somente contagem; sem interpretar achados).
 * Os perfis são regionais: com "todas as localizações" a consulta não é feita, para não exibir um
 * zero que valeria apenas para `locations/global`.
 */
async function countSensitiveDataProfiles({ projectId, location, getAccessToken }) {
  if (!location || location === 'global' || location === 'all') {
    return {
      consultado: false,
      local: null,
      quantidade: null,
      haMais: false,
      erro: 'os perfis são regionais: selecione uma região específica para contá-los',
    };
  }
  const loc = location;
  try {
    const token = await getAccessToken();
    const resp = await axios.get(
      `https://dlp.googleapis.com/v2/projects/${projectId}/locations/${loc}/tableDataProfiles`,
      { headers: { Authorization: `Bearer ${token}` }, params: { pageSize: 100 }, timeout: 15000 }
    );
    const profiles = (resp.data && resp.data.tableDataProfiles) || [];
    return { consultado: true, local: loc, quantidade: profiles.length, haMais: !!(resp.data && resp.data.nextPageToken), erro: null };
  } catch (err) {
    const apiError = err.response && err.response.data && err.response.data.error;
    return { consultado: false, local: loc, quantidade: null, haMais: false, erro: String((apiError && apiError.message) || err.message || err).slice(0, 300) };
  }
}

module.exports = {
  MAX_SCANS,
  MAX_TABLES,
  collectDataQualityScans,
  collectTableMetadata,
  collectLineage,
  collectCatalogContext,
  countSensitiveDataProfiles,
  normalizeStructValue,
  scorecardFromEntry,
};

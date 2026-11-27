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
 * Rota consolidada do painel RC 18 — Resolução Conjunta nº 18, de 28/11/2025.
 *
 * GET /api/v1/rc18/overview?location=global&dataset=...&label=...&demo=false&refresh=false
 *
 * Princípios:
 *  - Identidade única por modo: IS_SERVICE_ACCOUNT=true usa a conta de serviço do runtime;
 *    caso contrário usa SOMENTE o token OAuth do usuário. Token resolvido uma vez por requisição.
 *  - Dados sintéticos só aparecem com `?demo=true`.
 *  - Cache de 60s agrupado em um único objeto de sessão por (identidade, projeto, localização),
 *    descartado com `?refresh=true` quando tem mais de 15 s (antes disso o cache é devolvido),
 *    sem cachear erros transitórios.
 *  - Pipeline determinístico: listagem BASIC -> filtrosDisponiveis -> filtro dataset/label ->
 *    corte MAX_SCANS -> leitura FULL -> deduplicação por canonicalKey -> metadados/linhagem/catálogo.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const { GoogleAuth } = require('google-auth-library');

const { NORMA } = require('../rc18/dimensions');
const {
  parseTableRef,
  deduplicateScansByTable,
  rulesFromScan,
  tablesFromScans,
  disambiguateTableKeys,
} = require('../rc18/dqScans');
const { buildDimensionReport } = require('../rc18/dimensionReport');
const { buildQualityView } = require('../rc18/qualityView');
const collectors = require('../rc18/collectors');
const demoData = require('../rc18/demoData');

const SCOPE_CRITERION =
  'Tabelas com DataScan de qualidade de dados (Dataplex) no projeto e na localização selecionados (deduplicados por tabela)';
const PLACEHOLDER_PROJECTS = new Set(['', 'your-project-id', 'your-gcp-project-id', '****']);

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_SESSIONS = 100;

const LOCATION_RE = /^[a-z0-9-]{1,40}$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;
// Rótulos do Google Cloud aceitam letras minúsculas internacionais, dígitos, `_` e `-`.
const LABEL_RE = /^[\p{Ll}\p{Lo}\p{N}_-]{1,63}(:[\p{Ll}\p{Lo}\p{N}_-]{0,63})?$/u;
const REFRESH_MIN_INTERVAL_MS = 15 * 1000;

let devGoogleAuth = null;
function getDevGoogleAuth() {
  if (!devGoogleAuth) {
    devGoogleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }
  return devGoogleAuth;
}

/** Projeto alvo: variáveis de ambiente, depois configData.json, depois o projeto do runtime. */
async function resolveTargetProjectId(dataFilePath) {
  const fromEnv =
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    '';
  if (!PLACEHOLDER_PROJECTS.has(fromEnv.trim())) return fromEnv.trim();

  if (dataFilePath) {
    try {
      const raw = await fs.readFile(dataFilePath, 'utf8');
      const cfg = raw ? JSON.parse(raw) : {};
      if (Array.isArray(cfg.projects) && cfg.projects[0]) return String(cfg.projects[0]).trim();
    } catch (err) {
      console.warn(`[RC18] configData.json não pôde ser lido: ${err.message}`);
    }
  }

  try {
    return (await getDevGoogleAuth().getProjectId()) || null;
  } catch (err) {
    console.warn(`[RC18] Projeto do runtime não detectado: ${err.message}`);
    return null;
  }
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !value) return null;
  const token = value.trim();
  return token && token !== 'null' && token !== 'undefined' ? token : null;
}

function singleQueryParam(raw, fallback = '') {
  if (raw === undefined) return { ok: true, value: fallback };
  if (typeof raw !== 'string') return { ok: false, value: null };
  return { ok: true, value: raw.trim() };
}

function parseLabelFilter(raw) {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx === -1) return { key: raw, hasValue: false, value: null };
  return { key: raw.slice(0, idx), hasValue: true, value: raw.slice(idx + 1) };
}

function matchesLabelFilter(scanLabels, parsedLabel) {
  if (!parsedLabel) return true;
  if (!scanLabels || typeof scanLabels !== 'object') return false;
  if (!Object.hasOwn(scanLabels, parsedLabel.key)) return false;
  if (!parsedLabel.hasValue) return true;
  return String(scanLabels[parsedLabel.key] ?? '') === parsedLabel.value;
}

function availableFiltersFromScans(basicScans = []) {
  const datasets = new Set();
  const labels = new Set();
  for (const scan of basicScans) {
    const resource = scan?.data?.resource || scan?.data?.entity || null;
    const ref = parseTableRef(resource);
    if (ref && ref.dataset) datasets.add(ref.dataset);
    if (scan?.labels && typeof scan.labels === 'object') {
      for (const key of Object.keys(scan.labels)) {
        const val = String(scan.labels[key] ?? '');
        labels.add(val === '' ? `${key}:` : `${key}:${val}`);
      }
    }
  }
  return {
    datasets: [...datasets].sort(),
    labels: [...labels].sort(),
  };
}

/**
 * Sinais de governança por tabela. Campos não lidos ficam `null` (nunca viram lacuna);
 * `found` é `true` (entrada lida), `false` (404 definitivo: contatos e termos ficam 0, fato verificado)
 * ou `null` (não lida).
 * `lacunaGovernanca` usa exatamente o mesmo conjunto de tabelas da contagem do resumo.
 */
function buildCatalogByTable(tables, metadataByKey, lineageByKey, catalogByKey, governanceGapKeys = new Set()) {
  const out = {};
  for (const t of tables) {
    const ck = t.canonicalKey;
    const md = metadataByKey[ck] || null;
    const ln = lineageByKey[ck] || null;
    const cat = catalogByKey[ck] || null;
    const catFound = Boolean(cat && cat.found === true);
    const catAbsent = Boolean(cat && cat.found === false);
    const glossaryRead = catFound && Boolean(cat.glossary);
    out[ck] = {
      canonicalKey: ck,
      tableKey: t.key,
      entryName: catFound && cat.entryName ? cat.entryName : null,
      found: cat && (cat.found === true || cat.found === false) ? cat.found : null,
      contactsCount: catFound && cat.facts ? cat.facts.contactsCount : catAbsent ? 0 : null,
      hasOverview: catFound && cat.facts ? cat.facts.hasOverview : catAbsent ? false : null,
      queries30d: catFound && cat.facts ? cat.facts.queries30d : null,
      glossaryTermLinks: glossaryRead ? cat.glossary.termLinks : catAbsent ? 0 : null,
      glossaryTerms: glossaryRead ? cat.glossary.terms : catAbsent ? [] : null,
      glossaryLinksTruncated: glossaryRead ? cat.glossary.truncated : catAbsent ? false : null,
      hasUpstream: ln && ln.ok === true ? ln.upstream.length > 0 : null,
      upstreamCount: ln && ln.ok === true ? ln.upstream.length : null,
      upstreamTruncated: ln && ln.ok === true ? Boolean(ln.upstreamTruncated) : null,
      columnsWithDescription: md && md.ok === true ? md.columnsWithDescription : null,
      totalColumns: md && md.ok === true ? md.totalColumns : null,
      lacunaGovernanca: governanceGapKeys.has(ck),
    };
  }
  return out;
}

function createRc18Router({ getRequestAccessToken, dataFilePath }) {
  const router = express.Router();
  // Sessão única de cache por (identidade, projeto, localização): evita thrashing de entradas.
  const sessions = new Map();

  function getOrCreateSession(sessionKey, refresh) {
    const now = Date.now();
    for (const [k, v] of sessions) {
      if (v.expires <= now) sessions.delete(k);
    }
    // `refresh=true` só descarta a sessão se ela tiver mais de 15 s: evita que cliques repetidos
    // (ou vários usuários no modo conta de serviço, que compartilham a sessão) refaçam toda a coleta.
    if (refresh) {
      const current = sessions.get(sessionKey);
      if (current && now - current.createdAt >= REFRESH_MIN_INTERVAL_MS) sessions.delete(sessionKey);
    }
    const existing = sessions.get(sessionKey);
    if (existing) return existing;
    if (sessions.size >= CACHE_MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const created = {
      createdAt: now,
      expires: now + CACHE_TTL_MS,
      basicPromise: null,
      fullScans: new Map(),
      tableMeta: new Map(),
      lineage: new Map(),
      catalog: new Map(),
    };
    sessions.set(sessionKey, created);
    return created;
  }

  /** Uma única identidade por requisição; `null` quando não há credencial utilizável. */
  function resolveIdentity(req) {
    if (process.env.IS_SERVICE_ACCOUNT === 'true') {
      return {
        mode: 'service_account',
        key: 'service_account',
        getAccessToken: () => getRequestAccessToken(null),
      };
    }
    const token = bearerToken(req);
    if (token) {
      return {
        mode: 'user',
        key: crypto.createHash('sha256').update(token).digest('hex'),
        getAccessToken: async () => token,
      };
    }
    if (process.env.DISABLE_AUTH === 'true') {
      return {
        mode: 'adc_dev',
        key: 'adc_dev',
        getAccessToken: () => getDevGoogleAuth().getAccessToken(),
      };
    }
    return null;
  }

  async function buildContext(req, res) {
    const demoParam = singleQueryParam(req.query.demo, '');
    const refreshParam = singleQueryParam(req.query.refresh, '');
    const locationParam = singleQueryParam(req.query.location, 'global');
    const datasetParam = singleQueryParam(req.query.dataset, '');
    const labelParam = singleQueryParam(req.query.label, '');

    if (!demoParam.ok || !refreshParam.ok || !locationParam.ok || !LOCATION_RE.test(locationParam.value)) {
      res.status(400).json({ success: false, message: 'Parâmetro "location" inválido.' });
      return null;
    }
    if (!datasetParam.ok || (datasetParam.value && !DATASET_RE.test(datasetParam.value))) {
      res.status(400).json({ success: false, message: 'Parâmetro "dataset" inválido.' });
      return null;
    }
    if (!labelParam.ok || (labelParam.value && !LABEL_RE.test(labelParam.value))) {
      res.status(400).json({ success: false, message: 'Parâmetro "label" inválido.' });
      return null;
    }

    const demo = demoParam.value === 'true';
    const refresh = refreshParam.value === 'true';
    const location = locationParam.value;
    const dataset = datasetParam.value;
    const label = labelParam.value;

    let projectId = await resolveTargetProjectId(dataFilePath);
    if (!projectId) {
      if (!demo) {
        res.status(500).json({
          success: false,
          message: 'Projeto GCP não configurado: defina GOOGLE_CLOUD_PROJECT_ID no serviço.',
        });
        return null;
      }
      projectId = 'projeto-exemplo';
    }

    const identity = demo
      ? { mode: 'demo', key: 'demo', getAccessToken: async () => null }
      : resolveIdentity(req);
    if (!identity) {
      res.status(401).json({ success: false, message: 'Token de acesso ausente na requisição.' });
      return null;
    }

    return {
      demo,
      refresh,
      location,
      dataset,
      label,
      parsedLabel: parseLabelFilter(label),
      projectId,
      identity,
      sessionKey: [identity.key, projectId, location].join('|'),
    };
  }

  /**
   * GET /api/v1/rc18/overview — visão consolidada das 12 dimensões, fila de não conformidades,
   * tabelas do escopo e sinais de governança do Knowledge Catalog / Data Lineage.
   */
  router.get('/overview', async (req, res) => {
    try {
      const ctx = await buildContext(req, res);
      if (!ctx) return;

      const diagnostics = [];
      let allBasicScans = [];
      let listTruncated = false;
      // Listagem sem diagnóstico e sem corte: só então a lista de filtros disponíveis é completa.
      let listaCompleta = false;
      // Listagem lida (ao menos a 1ª página): sem ela, nada pode ser afirmado sobre o escopo.
      let listagemLida = false;
      let scanTruncated = false;
      let fullScans = [];
      let mdItems = [];
      let lnItems = [];
      let catItems = [];
      let tables = [];
      let activeScans = [];
      let ignoredDuplicates = [];
      let scanMetaByKey = new Map();
      let rules = [];

      const nowMs = ctx.demo ? demoData.DEMO_NOW_MS : Date.now();

      if (ctx.demo) {
        allBasicScans = demoData.demoScans(ctx.projectId);
        const filtrosDisponiveis = availableFiltersFromScans(allBasicScans);
        const filteredScans = allBasicScans.filter((s) => {
          const ref = parseTableRef(s?.data?.resource || s?.data?.entity);
          const dsOk = !ctx.dataset || (ref && ref.dataset === ctx.dataset);
          const lblOk = matchesLabelFilter(s?.labels, ctx.parsedLabel);
          return dsOk && lblOk;
        });

        ({ activeScans, ignoredDuplicates, scanMetaByKey } = deduplicateScansByTable(filteredScans, nowMs));
        rules = activeScans.flatMap((s) => rulesFromScan(s, nowMs));
        tables = tablesFromScans(activeScans, scanMetaByKey, nowMs);
        disambiguateTableKeys(rules, tables);

        const activeKeys = new Set(tables.map((t) => t.canonicalKey));
        mdItems = demoData.demoTableMetadata(ctx.projectId).filter((m) => activeKeys.has(m.canonicalKey));
        lnItems = demoData.demoLineage(ctx.projectId).filter((l) => activeKeys.has(l.canonicalKey));
        catItems = demoData.demoCatalog(ctx.projectId).filter((c) => activeKeys.has(c.canonicalKey));

        return sendOverview(res, ctx, {
          allBasicScans,
          filteredCount: filteredScans.length,
          scansRead: filteredScans.length,
          listTruncated: false,
          scanTruncated: false,
          filtrosDisponiveis,
          filtrosCompletos: true,
          listagemLida: true,
          activeScans,
          ignoredDuplicates,
          scanMetaByKey,
          rules,
          tables,
          mdItems,
          lnItems,
          catItems,
          diagnostics,
        });
      }

      // Modo real: resolve accessToken uma única vez por requisição.
      let accessToken = null;
      try {
        accessToken = await ctx.identity.getAccessToken();
      } catch (err) {
        diagnostics.push(collectors.diag('Autenticação Google Cloud', ctx.identity.mode, err));
      }

      const session = getOrCreateSession(ctx.sessionKey, ctx.refresh);

      // Etapa 1: listagem BASIC de todos os DataScans de qualidade (sem cachear erros transitórios).
      if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
        if (diagnostics.length === 0) {
          diagnostics.push(
            collectors.diag('Autenticação Google Cloud', ctx.identity.mode, new Error('Token de acesso vazio ou ausente.'))
          );
        }
      } else {
        if (!session.basicPromise) {
          const p = collectors.listDataQualityScansBasic({
            accessToken,
            projectId: ctx.projectId,
            location: ctx.location,
          });
          session.basicPromise = p;
          p.then(
            (r) => {
              if (r.diagnostics && r.diagnostics.length > 0) {
                if (session.basicPromise === p) session.basicPromise = null;
              }
            },
            () => {
              if (session.basicPromise === p) session.basicPromise = null;
            }
          );
        }
        const basicResult = await session.basicPromise;
        allBasicScans = basicResult.scans || [];
        listTruncated = Boolean(basicResult.listTruncated);
        listaCompleta = !listTruncated && !(basicResult.diagnostics && basicResult.diagnostics.length > 0);
        listagemLida = basicResult.listingRead !== false;
        diagnostics.push(...(basicResult.diagnostics || []));
      }

      // Etapa 2: filtrosDisponiveis calculado sobre TODOS os scans BASIC antes do filtro/corte.
      const filtrosDisponiveis = availableFiltersFromScans(allBasicScans);

      // Etapa 3: filtro dataset/label sobre os scans BASIC.
      const filteredBasic = allBasicScans.filter((s) => {
        const ref = parseTableRef(s?.data?.resource || s?.data?.entity);
        const dsOk = !ctx.dataset || (ref && ref.dataset === ctx.dataset);
        const lblOk = matchesLabelFilter(s?.labels, ctx.parsedLabel);
        return dsOk && lblOk;
      });
      filteredBasic.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

      // Etapa 4: corte MAX_SCANS = 50 após filtro e ordenação determinística.
      const selectedBasic = filteredBasic.slice(0, collectors.MAX_SCANS);
      scanTruncated = filteredBasic.length > selectedBasic.length;

      // Etapa 5: leitura FULL por scan (cacheada na sessão apenas em sucesso).
      const fullResults = await collectors.mapLimit(selectedBasic, collectors.CONCURRENCY, async (s) => {
        const cached = session.fullScans.get(s.name);
        if (cached) return cached;
        const p = collectors.getDataScanFull({ accessToken, scanName: s.name });
        session.fullScans.set(s.name, p);
        try {
          const r = await p;
          if (!r.ok || (r.diagnostics && r.diagnostics.length > 0)) {
            if (session.fullScans.get(s.name) === p) session.fullScans.delete(s.name);
          }
          return r;
        } catch (err) {
          if (session.fullScans.get(s.name) === p) session.fullScans.delete(s.name);
          throw err;
        }
      });

      for (const r of fullResults) {
        if (r && r.diagnostics) diagnostics.push(...r.diagnostics);
        if (r && r.ok && r.scan) fullScans.push(r.scan);
      }

      // Etapa 6: deduplicação determinística por canonicalKey e extração de regras/tabelas.
      ({ activeScans, ignoredDuplicates, scanMetaByKey } = deduplicateScansByTable(fullScans, nowMs));
      rules = activeScans.flatMap((s) => rulesFromScan(s, nowMs));
      tables = tablesFromScans(activeScans, scanMetaByKey, nowMs);
      disambiguateTableKeys(rules, tables);

      // Etapa 7: coleta de metadados BQ, linhagem (upstream) e catálogo para as tabelas ativas.
      const mdResults = await collectors.mapLimit(tables, collectors.CONCURRENCY, async (table) => {
        const ck = table.canonicalKey;
        const cached = session.tableMeta.get(ck);
        if (cached) {
          const r = await cached;
          return { item: { ...r.item, key: table.key }, diagnostics: r.diagnostics };
        }
        const p = collectors.collectSingleTableMetadata({ accessToken, projectId: ctx.projectId, table });
        session.tableMeta.set(ck, p);
        try {
          const r = await p;
          if (!r.item.ok && !r.item.nonBigQuery) {
            if (session.tableMeta.get(ck) === p) session.tableMeta.delete(ck);
          }
          return r;
        } catch (err) {
          if (session.tableMeta.get(ck) === p) session.tableMeta.delete(ck);
          throw err;
        }
      });

      const metadataByKey = {};
      for (const r of mdResults) {
        mdItems.push(r.item);
        metadataByKey[r.item.canonicalKey] = r.item;
        diagnostics.push(...r.diagnostics);
      }

      const [lnResults, catResults] = await Promise.all([
        collectors.mapLimit(tables, collectors.CONCURRENCY, async (table) => {
          const ck = table.canonicalKey;
          const cached = session.lineage.get(ck);
          if (cached) {
            const r = await cached;
            return { item: { ...r.item, key: table.key }, diagnostics: r.diagnostics };
          }
          const p = collectors.collectSingleLineage({
            accessToken,
            projectId: ctx.projectId,
            table,
            meta: metadataByKey[ck],
          });
          session.lineage.set(ck, p);
          try {
            const r = await p;
            if (!r.item.ok && !r.item.nonBigQuery) {
              if (session.lineage.get(ck) === p) session.lineage.delete(ck);
            }
            return r;
          } catch (err) {
            if (session.lineage.get(ck) === p) session.lineage.delete(ck);
            throw err;
          }
        }),
        collectors.mapLimit(tables, collectors.CONCURRENCY, async (table) => {
          const ck = table.canonicalKey;
          const cached = session.catalog.get(ck);
          if (cached) {
            const r = await cached;
            return { item: { ...r.item, key: table.key }, diagnostics: r.diagnostics };
          }
          const p = collectors.collectSingleCatalogEntry({
            accessToken,
            projectId: ctx.projectId,
            table,
            meta: metadataByKey[ck],
          });
          session.catalog.set(ck, p);
          try {
            const r = await p;
            if (!r.item.found || (r.diagnostics && r.diagnostics.length > 0)) {
              if (session.catalog.get(ck) === p) session.catalog.delete(ck);
            }
            return r;
          } catch (err) {
            if (session.catalog.get(ck) === p) session.catalog.delete(ck);
            throw err;
          }
        }),
      ]);

      for (const r of lnResults) {
        lnItems.push(r.item);
        diagnostics.push(...r.diagnostics);
      }
      for (const r of catResults) {
        catItems.push(r.item);
        diagnostics.push(...r.diagnostics);
      }

      return sendOverview(res, ctx, {
        allBasicScans,
        filteredCount: filteredBasic.length,
        scansRead: fullScans.length,
        listTruncated,
        scanTruncated,
        filtrosDisponiveis,
        filtrosCompletos: listaCompleta,
        listagemLida,
        activeScans,
        ignoredDuplicates,
        scanMetaByKey,
        rules,
        tables,
        mdItems,
        lnItems,
        catItems,
        diagnostics,
      });
    } catch (error) {
      console.error('[RC18] Erro inesperado em overview:', error);
      res.status(500).json({
        success: false,
        message: 'Erro inesperado em overview.',
        error: String(error.message || error),
      });
    }
  });

  function sendOverview(res, ctx, state) {
    const metadataByKey = Object.fromEntries(state.mdItems.map((m) => [m.canonicalKey || m.key, m]));
    const lineageByKey = Object.fromEntries(state.lnItems.map((l) => [l.canonicalKey || l.key, l]));
    const catalogByKey = Object.fromEntries(state.catItems.map((c) => [c.canonicalKey || c.key, c]));

    // Scans selecionados (após o corte) que não puderam ser lidos em detalhe.
    const scansNaoLidos = Math.max(0, Math.min(state.filteredCount, collectors.MAX_SCANS) - state.scansRead);
    // Escopo lido por inteiro: listagem lida e completa (sem falha nem corte), sem corte de scans e com
    // todos os selecionados lidos. Sem isso, nada pode ser afirmado como "sem falhas" ou "completo".
    const lidoPorInteiro =
      state.listagemLida !== false && state.filtrosCompletos !== false && !state.scanTruncated && scansNaoLidos === 0;

    const report = buildDimensionReport({
      rules: state.rules,
      activeScans: state.activeScans,
      scanMetaByKey: state.scanMetaByKey,
      tableMetadata: state.mdItems,
      lineage: state.lnItems,
      catalog: state.catItems,
      regrasLidas: lidoPorInteiro,
    });

    const quality = buildQualityView(state.rules, {
      activeScans: state.activeScans,
      tables: state.tables,
      catalogByKey,
      scanMetaByKey: state.scanMetaByKey,
    });

    const { governanceGapKeys, ...reportFields } = report;
    const catalogByTable = buildCatalogByTable(
      state.tables,
      metadataByKey,
      lineageByKey,
      catalogByKey,
      new Set(governanceGapKeys)
    );
    const dedupedDiagnostics = [
      ...new Map(state.diagnostics.map((d) => [`${d.fonte}|${d.local}|${d.mensagem}`, d])).values(),
    ];

    return res.json({
      success: true,
      demo: ctx.demo,
      projectId: ctx.projectId,
      location: ctx.location,
      filtrosAplicados: {
        dataset: ctx.dataset || null,
        label: ctx.label || null,
      },
      identityMode: ctx.identity.mode,
      timestamp: new Date().toISOString(),
      norma: NORMA,
      escopo: {
        criterio: SCOPE_CRITERION,
        tabelas: state.tables.map((t) => t.key),
        totalScansListados: state.allBasicScans.length,
        scansDeQualidade: state.filteredCount,
        scansLidos: state.scansRead,
        scansNaoLidos,
        listagemLida: state.listagemLida !== false,
        lidoPorInteiro,
        scansAtivos: state.activeScans.length,
        scansDuplicadosIgnorados: state.ignoredDuplicates,
        truncado: Boolean(state.listTruncated || state.scanTruncated),
        limiteScans: collectors.MAX_SCANS,
      },
      filtrosDisponiveis: state.filtrosDisponiveis,
      filtrosCompletos: Boolean(state.filtrosCompletos),
      ...reportFields,
      dimensionGroups: quality.dimensionGroups,
      unmappedRules: quality.unmappedRules,
      tableSummaries: quality.tableSummaries,
      catalogByTable,
      diagnostics: dedupedDiagnostics,
    });
  }

  return router;
}

module.exports = {
  createRc18Router,
  resolveTargetProjectId,
  parseLabelFilter,
  matchesLabelFilter,
  availableFiltersFromScans,
};

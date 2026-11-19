'use strict';

/**
 * Rotas do painel RC 18 — Resolução Conjunta nº 18, de 28/11/2025 (política de qualidade das
 * informações prestadas ao Banco Central do Brasil).
 *
 * Princípios:
 *  - Identidade única por modo: IS_SERVICE_ACCOUNT=true usa a conta de serviço do runtime;
 *    caso contrário usa SOMENTE o token OAuth do usuário. Não há troca de identidade em erro.
 *  - Dados sintéticos só aparecem com `?demo=true` (modo demonstração explícito).
 *  - Erros de API são devolvidos em `diagnostics`; nada é substituído por valores presumidos.
 *  - Escopo: tabelas com DataScan de qualidade de dados no projeto/localização selecionados.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const { GoogleAuth } = require('google-auth-library');

const { NORMA } = require('../rc18/dimensions');
const { rulesFromScan, tablesFromRules } = require('../rc18/dqScans');
const { buildDimensionReport } = require('../rc18/dimensionReport');
const { buildQualityView } = require('../rc18/qualityView');
const { buildLineageView } = require('../rc18/lineageView');
const { findingsFromTableMetadata, buildSensitiveDataReport } = require('../rc18/sensitiveData');
const collectors = require('../rc18/collectors');
const demoData = require('../rc18/demoData');

const SCOPE_CRITERION =
  'Tabelas com DataScan de qualidade de dados (Dataplex) no projeto e na localização selecionados';
const PLACEHOLDER_PROJECTS = new Set(['', 'your-project-id', 'your-gcp-project-id', '****']);

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

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
    return (await new GoogleAuth().getProjectId()) || null;
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

function createRc18Router({ getAuthClient, getRequestAccessToken, dataFilePath }) {
  const router = express.Router();
  const cache = new Map();

  function memo(key, fn) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires <= now) cache.delete(k);
    }
    const hit = cache.get(key);
    if (hit) return hit.promise;
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    const promise = Promise.resolve().then(fn);
    cache.set(key, { expires: now + CACHE_TTL_MS, promise });
    promise.catch(() => cache.delete(key));
    return promise;
  }

  /** Uma única identidade por requisição; `null` quando não há credencial utilizável. */
  function resolveIdentity(req) {
    if (process.env.IS_SERVICE_ACCOUNT === 'true') {
      return {
        mode: 'service_account',
        auth: getAuthClient(null),
        key: 'service_account',
        getAccessToken: () => getRequestAccessToken(null),
      };
    }
    const token = bearerToken(req);
    if (token) {
      return {
        mode: 'user',
        auth: getAuthClient(token),
        key: crypto.createHash('sha256').update(token).digest('hex'),
        getAccessToken: async () => token,
      };
    }
    // Somente desenvolvimento local com a verificação de token explicitamente desligada.
    if (process.env.DISABLE_AUTH === 'true') {
      return {
        mode: 'adc_dev',
        auth: null,
        key: 'adc_dev',
        getAccessToken: () =>
          new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getAccessToken(),
      };
    }
    return null;
  }

  async function buildContext(req, res) {
    const demo = String(req.query.demo || '') === 'true';
    const location = String(req.query.location || 'global');
    if (!/^[a-z0-9-]{1,40}$/.test(location)) {
      res.status(400).json({ success: false, message: 'Parâmetro "location" inválido.' });
      return null;
    }

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
      ? { mode: 'demo', auth: null, key: 'demo', getAccessToken: async () => null }
      : resolveIdentity(req);
    if (!identity) {
      res.status(401).json({ success: false, message: 'Token de acesso ausente na requisição.' });
      return null;
    }

    const rid = String(req.query.rid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    return {
      demo,
      location,
      projectId,
      identity,
      cacheKey: [identity.key, projectId, location, demo ? 'demo' : 'real', rid].join('|'),
    };
  }

  function stageScans(ctx) {
    return memo(`${ctx.cacheKey}|scans`, async () => {
      if (ctx.demo) {
        const scans = demoData.demoScans(ctx.projectId);
        const rules = scans.flatMap(rulesFromScan);
        return {
          rules,
          tables: tablesFromRules(rules),
          totalListed: scans.length,
          totalDataQuality: scans.length,
          scansRead: scans.length,
          truncated: false,
          diagnostics: [],
        };
      }
      const r = await collectors.collectDataQualityScans({
        auth: ctx.identity.auth,
        projectId: ctx.projectId,
        location: ctx.location,
      });
      const rules = r.scans.flatMap(rulesFromScan);
      return {
        rules,
        tables: tablesFromRules(rules),
        totalListed: r.totalListed,
        totalDataQuality: r.totalDataQuality,
        scansRead: r.scans.length,
        truncated: r.truncated,
        diagnostics: r.diagnostics,
      };
    });
  }

  function stageMetadata(ctx) {
    return memo(`${ctx.cacheKey}|metadata`, async () => {
      if (ctx.demo) return { items: demoData.demoTableMetadata(ctx.projectId), truncated: false, diagnostics: [] };
      const sc = await stageScans(ctx);
      return collectors.collectTableMetadata({ auth: ctx.identity.auth, projectId: ctx.projectId, tables: sc.tables });
    });
  }

  async function metadataByKey(ctx) {
    const md = await stageMetadata(ctx);
    return Object.fromEntries(md.items.map((m) => [m.key, m]));
  }

  function stageLineage(ctx) {
    return memo(`${ctx.cacheKey}|lineage`, async () => {
      if (ctx.demo) return { items: demoData.demoLineage(ctx.projectId), truncated: false, diagnostics: [] };
      const sc = await stageScans(ctx);
      return collectors.collectLineage({
        auth: ctx.identity.auth,
        projectId: ctx.projectId,
        tables: sc.tables,
        metadataByKey: await metadataByKey(ctx),
      });
    });
  }

  function stageCatalog(ctx) {
    return memo(`${ctx.cacheKey}|catalog`, async () => {
      // No modo demonstração não há chamada a lookupContext: só as entradas sintéticas.
      if (ctx.demo) return { items: demoData.demoCatalog(ctx.projectId), contexts: [], truncated: false, diagnostics: [] };
      const sc = await stageScans(ctx);
      return collectors.collectCatalogContext({
        auth: ctx.identity.auth,
        projectId: ctx.projectId,
        tables: sc.tables,
        metadataByKey: await metadataByKey(ctx),
        getAccessToken: ctx.identity.getAccessToken,
      });
    });
  }

  function baseResponse(ctx) {
    return {
      success: true,
      demo: ctx.demo,
      isDemoFallback: ctx.demo,
      projectId: ctx.projectId,
      location: ctx.location,
      identityMode: ctx.identity.mode,
      timestamp: new Date().toISOString(),
    };
  }

  function scopeOf(sc) {
    return {
      criterio: SCOPE_CRITERION,
      tabelas: sc.tables.map((t) => t.key),
      totalScansListados: sc.totalListed,
      scansDeQualidade: sc.totalDataQuality,
      scansLidos: sc.scansRead,
      truncado: sc.truncated,
      limiteScans: collectors.MAX_SCANS,
      limiteTabelas: collectors.MAX_TABLES,
    };
  }

  function handle(name, fn) {
    return async (req, res) => {
      try {
        const ctx = await buildContext(req, res);
        if (!ctx) return;
        await fn(ctx, req, res);
      } catch (error) {
        console.error(`[RC18] Erro inesperado em ${name}:`, error);
        res.status(500).json({ success: false, message: `Erro inesperado em ${name}.`, error: String(error.message || error) });
      }
    };
  }

  /**
   * GET /api/v1/rc18/dimensions — as 12 dimensões do art. 2º, § 2º, com o que foi de fato medido
   * (regras dos DataScans, metadados do BigQuery, Data Lineage API e aspectos do Knowledge Catalog).
   */
  router.get(
    '/dimensions',
    handle('dimensions', async (ctx, req, res) => {
      const [sc, md, ln, catalog] = await Promise.all([
        stageScans(ctx),
        stageMetadata(ctx),
        stageLineage(ctx),
        stageCatalog(ctx),
      ]);
      const report = buildDimensionReport({
        rules: sc.rules,
        tableMetadata: md.items,
        lineage: ln.items,
        catalog: catalog.items,
      });
      res.json({
        ...baseResponse(ctx),
        norma: NORMA,
        escopo: scopeOf(sc),
        ...report,
        diagnostics: [...sc.diagnostics, ...md.diagnostics, ...ln.diagnostics, ...catalog.diagnostics],
      });
    })
  );

  /**
   * GET /api/v1/rc18/data-quality-dimensions — regras de todos os DataScans, agrupadas pela
   * dimensão da Resolução a que foram atribuídas, e contexto do Knowledge Catalog por tabela.
   */
  router.get(
    '/data-quality-dimensions',
    handle('data-quality-dimensions', async (ctx, req, res) => {
      const [sc, catalog] = await Promise.all([stageScans(ctx), stageCatalog(ctx)]);
      const md = await stageMetadata(ctx);
      const view = buildQualityView(sc.rules);
      const base = baseResponse(ctx);

      const centralizedCatalogContext = catalog.items.map((item) => {
        const ts = view.tableSummaries.find((t) => t.fullTableName === item.key);
        return {
          entryId: item.entryName || item.key,
          displayName: item.displayName || item.key,
          linkedResource: item.linkedResource,
          entryGroup: '@bigquery',
          entryLocation: item.entryLocation || null,
          aspectTypes: item.aspectTypes || [],
          hasScorecardAspect: !!item.scorecard,
          scorecardScore: item.scorecard ? item.scorecard.score : null,
          contactsCount: item.facts ? item.facts.contactsCount : null,
          hasOverview: item.facts ? item.facts.hasOverview : null,
          queries30d: item.facts ? item.facts.queries30d : null,
          // `null` = vínculos não lidos; número = vínculos com termos de glossário (até 10 lidos).
          glossaryTermLinks: item.glossary ? item.glossary.termLinks : null,
          glossaryTerms: item.glossary ? item.glossary.terms : [],
          glossaryLinksTruncated: item.glossary ? item.glossary.truncated : false,
          governanceDomain: item.dataset,
          dataQualityScore: ts ? ts.overallScore : null,
          complianceStatus: ts ? ts.status : 'Sem execução',
          found: item.found,
          error: item.error || null,
          lastLookupTime: base.timestamp,
        };
      });

      res.json({
        ...base,
        escopo: scopeOf(sc),
        dimensionGroups: view.dimensionGroups,
        unmappedRules: view.unmappedRules,
        scannedSourceTables: sc.tables.map((t) => t.key),
        tableSummaries: view.tableSummaries,
        otherRulesCount: view.otherRulesCount,
        centralizedCatalogContext,
        lookupContextYaml: catalog.contexts.map((c) => c.context).join('\n---\n') || null,
        totalScansFound: sc.totalDataQuality,
        totalScansListed: sc.totalListed,
        totalRulesEvaluated: sc.rules.filter((r) => r.executed).length,
        totalRulesConfigured: sc.rules.length,
        diagnostics: [...sc.diagnostics, ...md.diagnostics, ...catalog.diagnostics],
      });
    })
  );

  /** GET /api/v1/rc18/lineage-traceability — rastreabilidade (art. 2º, § 2º, X) via Data Lineage API. */
  router.get(
    '/lineage-traceability',
    handle('lineage-traceability', async (ctx, req, res) => {
      const [sc, md, ln] = await Promise.all([stageScans(ctx), stageMetadata(ctx), stageLineage(ctx)]);
      const qualityByTable = Object.fromEntries(
        buildQualityView(sc.rules).tableSummaries.map((t) => [t.fullTableName, t.overallScore])
      );
      res.json({
        ...baseResponse(ctx),
        dispositivo: 'art. 2º, § 2º, X',
        escopo: scopeOf(sc),
        ...buildLineageView(ln.items, { qualityByTable }),
        diagnostics: [...sc.diagnostics, ...md.diagnostics, ...ln.diagnostics],
      });
    })
  );

  /**
   * GET /api/v1/rc18/dlp-sensitive-data — visão complementar (não é dimensão da Resolução):
   * Policy Tags do BigQuery e heurística por nome de coluna nas tabelas do escopo.
   */
  router.get(
    '/dlp-sensitive-data',
    handle('dlp-sensitive-data', async (ctx, req, res) => {
      const [sc, md] = await Promise.all([stageScans(ctx), stageMetadata(ctx)]);
      const findings = findingsFromTableMetadata(md.items);
      const report = buildSensitiveDataReport(findings, md.items.filter((m) => m.ok).length);
      const perfis = ctx.demo
        ? { consultado: false, local: null, quantidade: null, haMais: false, erro: 'Não consultado no modo demonstração.' }
        : await collectors.countSensitiveDataProfiles({
            projectId: ctx.projectId,
            location: ctx.location,
            getAccessToken: ctx.identity.getAccessToken,
          });
      res.json({
        ...baseResponse(ctx),
        metodo: 'policy_tags_e_heuristica_por_nome_de_coluna',
        aviso:
          'Visão complementar: não é uma das 12 dimensões da Resolução Conjunta nº 18/2025 e não é inspeção de conteúdo. Policy Tags são lidas dos metadados do BigQuery; as demais colunas são candidatas identificadas apenas pelo nome.',
        perfisSensitiveDataProtection: perfis,
        escopo: scopeOf(sc),
        ...report,
        diagnostics: [...sc.diagnostics, ...md.diagnostics],
      });
    })
  );

  return router;
}

module.exports = { createRc18Router, resolveTargetProjectId };

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { NORMA, DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { rulesFromScan, scoreFromRules, statusFromScore, tablesFromRules, toIsoTime, isDataQualityScan } = require('./dqScans');
const { buildDimensionReport } = require('./dimensionReport');
const { buildLineageView } = require('./lineageView');
const { classifyColumnName, findingsFromTableMetadata, buildSensitiveDataReport } = require('./sensitiveData');
const { scorecardFromEntry, catalogFactsFromEntry, catalogItemFromEntry } = require('./catalogEntries');
const demoData = require('./demoData');
const { buildQualityView, createRc18Router } = require('../routes/rc18Routes');

const PROJECT = 'projeto-exemplo';

test('catálogo: 12 dimensões, incisos I a XII, na ordem do art. 2º, § 2º', () => {
  assert.equal(DIMENSIONS.length, 12);
  assert.deepEqual(
    DIMENSIONS.map((d) => d.inciso),
    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  );
  assert.deepEqual(
    DIMENSIONS.map((d) => d.nome),
    ['Acessibilidade', 'Acurácia', 'Adaptabilidade', 'Clareza', 'Comparabilidade', 'Completude',
      'Confiabilidade', 'Consistência', 'Integridade', 'Rastreabilidade', 'Relevância', 'Tempestividade']
  );
  assert.equal(new Set(DIMENSIONS.map((d) => d.id)).size, 12);
  for (const d of DIMENSIONS) {
    assert.ok(d.definicao.length > 20, `definição de ${d.id}`);
    assert.ok(['automatica', 'parcial', 'declaratoria'].includes(d.coleta));
    assert.ok(d.lacuna, `lacuna de ${d.id}`);
  }
  assert.equal(NORMA.dispositivoDimensoes, 'art. 2º, § 2º, incisos I a XII');
});

test('catálogo: cada dimensão Dataplex pertence a uma única dimensão da Resolução', () => {
  const all = DIMENSIONS.flatMap((d) => d.dqDimensions);
  assert.equal(new Set(all).size, all.length);
  const index = buildDqDimensionIndex();
  assert.equal(index.get('VALIDITY'), 'acuracia');
  assert.equal(index.get('UNIQUENESS'), 'consistencia');
  assert.equal(index.get('FRESHNESS'), 'tempestividade');
  assert.equal(index.get('INTEGRIDADE'), 'integridade');
  // Nomes de dimensão personalizada: maiúsculas, até 30 caracteres (limite do Dataplex).
  for (const name of all) assert.match(name, /^[A-Z_]{1,30}$/);
});

test('DataScan na visão BASIC (sem spec e sem result) não gera regras', () => {
  const basic = { name: `projects/${PROJECT}/locations/us-central1/dataScans/s1`, type: 'DATA_QUALITY', data: { resource: '//bigquery.googleapis.com/projects/p/datasets/d/tables/t' } };
  assert.equal(isDataQualityScan(basic), true);
  assert.equal(isDataQualityScan({ type: 'DATA_PROFILE' }), false);
  assert.deepEqual(rulesFromScan(basic), []);
});

test('regras executadas: "passed" omitido significa reprovada; contagens vêm da API', () => {
  const scan = {
    name: `projects/${PROJECT}/locations/us-central1/dataScans/s1`,
    type: 'DATA_QUALITY',
    data: { resource: '//bigquery.googleapis.com/projects/p/datasets/d/tables/t' },
    executionStatus: { latestJobEndTime: { seconds: '1768464216', nanos: 0 } },
    dataQualityResult: {
      rules: [
        { rule: { column: 'a', dimension: 'VALIDITY', regexExpectation: {} }, passed: true, evaluatedCount: '100', passedCount: '100', passRatio: 1 },
        { rule: { column: 'b', dimension: 'VALIDITY', rangeExpectation: {} }, evaluatedCount: '100', passedCount: '90', passRatio: 0.9, failingRowsQuery: 'SELECT 1' },
        { rule: { dimension: 'VOLUME', tableConditionExpectation: {} }, passed: true },
      ],
    },
  };
  const rules = rulesFromScan(scan);
  assert.equal(rules.length, 3);
  assert.equal(rules[0].passed, true);
  assert.equal(rules[1].passed, false);
  assert.equal(rules[1].evaluatedCount, 100);
  assert.equal(rules[1].passedCount, 90);
  assert.equal(rules[1].failingRowsQuery, 'SELECT 1');
  // Regra agregada: executada, sem contagem de linhas — nada é presumido.
  assert.equal(rules[2].executed, true);
  assert.equal(rules[2].evaluatedCount, null);
  assert.equal(rules[2].passRatio, null);
  assert.equal(rules[0].executionTime, '2026-01-15T08:03:36.000Z');
  assert.equal(rules[0].tableKey, 'd.t');
  assert.equal(rules[0].location, 'us-central1');
});

test('regras apenas configuradas: sem execução, sem métricas e fora do score', () => {
  const scan = {
    name: `projects/${PROJECT}/locations/us-central1/dataScans/s2`,
    type: 'DATA_QUALITY',
    data: { resource: '//bigquery.googleapis.com/projects/p/datasets/d/tables/t2' },
    dataQualitySpec: { rules: [{ column: 'a', dimension: 'COMPLETENESS', nonNullExpectation: {} }] },
  };
  const rules = rulesFromScan(scan);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].executed, false);
  assert.equal(rules[0].passed, null);
  assert.equal(rules[0].evaluatedCount, null);
  const score = scoreFromRules(rules);
  assert.equal(score.scorePct, null);
  assert.equal(score.rulesNotExecuted, 1);
  assert.equal(statusFromScore(score), 'Sem execução');
});

test('score segue o critério do Dataplex (regras aprovadas / regras executadas)', () => {
  const mk = (n, passed) => Array.from({ length: n }, () => ({ executed: true, passed }));
  assert.equal(scoreFromRules([...mk(8, true), ...mk(5, false)]).scorePct, 61.54);
  assert.equal(scoreFromRules([...mk(21, true), ...mk(1, false)]).scorePct, 95.45);
  assert.equal(scoreFromRules([]).scorePct, null);
  assert.equal(statusFromScore(scoreFromRules(mk(3, true))), 'Sem falhas');
  assert.equal(statusFromScore(scoreFromRules([...mk(3, true), ...mk(1, false)])), 'Com falhas');
});

test('toIsoTime aceita Timestamp, string e ausência', () => {
  assert.equal(toIsoTime({ seconds: 0, nanos: 0 }), '1970-01-01T00:00:00.000Z');
  assert.equal(toIsoTime('2026-01-15T08:03:36Z'), '2026-01-15T08:03:36Z');
  assert.equal(toIsoTime(undefined), null);
});

test('relatório das 12 dimensões (dados de demonstração)', () => {
  const rules = demoData.demoScans(PROJECT).flatMap(rulesFromScan);
  const report = buildDimensionReport({
    rules,
    tableMetadata: demoData.demoTableMetadata(PROJECT),
    lineage: demoData.demoLineage(PROJECT),
    catalog: demoData.demoCatalog(PROJECT),
  });
  assert.equal(report.dimensoes.length, 12);
  const by = Object.fromEntries(report.dimensoes.map((d) => [d.id, d]));

  // Acurácia: VALIDITY (cpf ok, email falhou) + ACCURACY (valor ok); regras não executadas ficam fora.
  assert.equal(by.acuracia.estado, 'medido');
  assert.deepEqual(by.acuracia.indicadores[0], {
    id: 'regras_dq',
    rotulo: 'Regras de qualidade aprovadas (última execução dos DataScans)',
    valorPct: 66.67,
    numerador: 2,
    denominador: 3,
    unidade: 'regras',
  });
  assert.equal(by.acuracia.regras.naoExecutadas, 1);

  assert.equal(by.completude.indicadores[0].valorPct, 100);
  assert.equal(by.consistencia.indicadores[0].numerador, 2);
  assert.equal(by.consistencia.indicadores[0].denominador, 3);
  assert.equal(by.tempestividade.indicadores[0].denominador, 1);

  // Dimensão declaratória só é "medida" se houver regra marcada com a dimensão personalizada.
  assert.equal(by.integridade.estado, 'medido');
  for (const id of ['adaptabilidade', 'comparabilidade', 'confiabilidade']) {
    assert.equal(by[id].estado, 'nao_medido', id);
    assert.deepEqual(by[id].indicadores, []);
  }

  // Acessibilidade e relevância: indicadores parciais vindos dos aspectos do Knowledge Catalog.
  assert.deepEqual(by.acessibilidade.indicadores, [
    {
      id: 'tabelas_com_contatos',
      rotulo: 'Tabelas do escopo com contatos registrados no Knowledge Catalog (aspecto contacts)',
      valorPct: 50,
      numerador: 2,
      denominador: 4,
      unidade: 'tabelas',
    },
  ]);
  const uso = by.relevancia.indicadores.find((i) => i.id === 'tabelas_com_uso');
  assert.equal(uso.numerador, 2); // 412 e 96 consultas; 0 consultas e métrica ausente não contam
  assert.equal(uso.denominador, 4);
  assert.deepEqual(by.relevancia.evidencias, [
    { rotulo: 'Tabelas sem métrica de uso informada pelo catálogo', valor: '1 de 4' },
  ]);
  assert.ok(by.clareza.evidencias.some((e) => e.rotulo.includes('aspecto overview') && e.valor === '2 de 4'));
  assert.ok(by.tempestividade.evidencias[0].rotulo.includes('refresh-cadence'));
  assert.equal(by.tempestividade.evidencias[0].valor, '1 de 4');

  const clareza = by.clareza.indicadores.find((i) => i.id === 'colunas_descritas');
  assert.equal(clareza.numerador, 9);
  assert.equal(clareza.denominador, 15);
  assert.equal(clareza.valorPct, 60);

  const rastreio = by.rastreabilidade.indicadores.find((i) => i.id === 'tabelas_com_origem');
  assert.equal(rastreio.numerador, 3);
  assert.equal(rastreio.denominador, 4);

  assert.deepEqual(report.resumo, { medidas: 9, semDados: 0, naoMedidas: 3 });
  assert.deepEqual(report.regrasSemMapeamento, []);
});

test('sem entradas do catálogo lidas, acessibilidade e relevância ficam sem dados (não zeradas)', () => {
  const notFound = [{ key: 'd.t', dataset: 'd', table: 't', found: false, error: 'PERMISSION_DENIED' }];
  const report = buildDimensionReport({ catalog: notFound });
  const by = Object.fromEntries(report.dimensoes.map((d) => [d.id, d]));
  for (const id of ['acessibilidade', 'relevancia']) {
    assert.equal(by[id].estado, 'sem_dados', id);
    assert.deepEqual(by[id].indicadores, [], id);
  }
});

test('relatório sem evidências: nenhum número é presumido', () => {
  const report = buildDimensionReport({});
  for (const d of report.dimensoes) {
    assert.deepEqual(d.indicadores, [], d.id);
    assert.equal(d.estado, d.coleta === 'declaratoria' ? 'nao_medido' : 'sem_dados', d.id);
  }
  assert.equal(report.resumo.medidas, 0);
});

test('dimensão Dataplex desconhecida é reportada como sem mapeamento', () => {
  const report = buildDimensionReport({ rules: [{ dqDimension: 'MINHA_DIMENSAO', executed: true, passed: true }] });
  assert.deepEqual(report.regrasSemMapeamento, [{ dqDimension: 'MINHA_DIMENSAO', quantidade: 1 }]);
  assert.equal(report.resumo.medidas, 0);
});

test('visão de qualidade por tabela: scores nulos e situação factual', () => {
  const rules = demoData.demoScans(PROJECT).flatMap(rulesFromScan);
  const view = buildQualityView(rules);
  const credito = view.tableSummaries.find((t) => t.fullTableName === 'fin_demo_credito.operacoes_ativas');
  assert.equal(credito.status, 'Sem execução');
  assert.equal(credito.overallScore, null);
  assert.equal(credito.accuracyScore, null);
  const cartoes = view.tableSummaries.find((t) => t.fullTableName === 'fin_demo_cartoes.transacao_cartao');
  assert.equal(cartoes.status, 'Com falhas');
  assert.equal(cartoes.overallScore, 75);
  const notExecuted = view.dimensions.accuracy.rules.find((r) => r.executed === false);
  assert.equal(notExecuted.passed, null);
  assert.equal(notExecuted.passPercentage, null);
  assert.equal(tablesFromRules(rules).length, 4);
});

test('linhagem: sem origem registrada não é tratada como conforme', () => {
  const view = buildLineageView(demoData.demoLineage(PROJECT));
  assert.equal(view.summary.totalTablesAudited, 4);
  assert.equal(view.summary.fullyTraceableTablesCount, 3);
  assert.equal(view.summary.traceabilityCoveragePct, 75);
  const contas = view.pipelineDetails.find((p) => p.table === 'fin_demo_contas.saldos_extratos');
  assert.equal(contas.traceabilityStatus, 'Sem origem registrada');
  assert.equal(contas.hasUpstream, false);
  assert.equal(contas.lastRunTime, null);
  assert.equal(buildLineageView([]).summary.traceabilityCoveragePct, null);
  const failed = buildLineageView([{ key: 'd.t', dataset: 'd', table: 't', ok: false, error: 'PERMISSION_DENIED', locationsTried: ['us'] }]);
  assert.equal(failed.summary.totalTablesAudited, 0);
  assert.equal(failed.pipelineDetails[0].traceabilityStatus, 'Não consultado');
});

test('dados sensíveis: Policy Tag é fato; nome de coluna é heurística', () => {
  assert.equal(classifyColumnName('cpf_titular').infoType, 'CPF');
  assert.equal(classifyColumnName('quantidade'), null);
  const findings = findingsFromTableMetadata(demoData.demoTableMetadata(PROJECT));
  const cpf = findings.find((f) => f.column === 'cpf');
  assert.equal(cpf.policyTagApplied, true);
  assert.equal(cpf.estimatedOccurrences, null);
  const pix = findings.find((f) => f.column === 'chave_pix');
  assert.equal(pix.policyTagApplied, false);
  assert.equal(pix.likelihood, 'HEURISTICA_NOME_DE_COLUNA');
  const report = buildSensitiveDataReport(findings, 4);
  assert.equal(report.summary.totalTablesScanned, 4);
  assert.equal(report.summary.protectedWithPolicyTagsCount, 2);
  assert.equal(buildSensitiveDataReport([], 0).summary.overallProtectionCoveragePct, null);
  assert.equal(buildSensitiveDataReport([], 0).summary.complianceLevel, 'Nenhuma tabela inspecionada');
  // A visão descreve fatos (há ou não Policy Tag); não classifica risco nem adequação.
  for (const t of report.tableRiskProfiles) {
    assert.equal('riskLevel' in t, false);
    assert.ok(['Todas as colunas com Policy Tag', 'Há colunas sem Policy Tag'].includes(t.complianceStatus));
  }
});

test('scorecard do Knowledge Catalog: lê Struct gRPC e JSON simples', () => {
  const grpc = {
    aspects: {
      '655216118709.global.data-quality-scorecard': {
        data: { fields: { score: { kind: 'numberValue', numberValue: 95.5 }, status: { kind: 'stringValue', stringValue: 'PASS' } } },
      },
    },
  };
  assert.deepEqual(scorecardFromEntry(grpc), { score: 95.5, status: 'PASS' });
  const plain = { aspects: { 'x.global.data-quality-scorecard': { data: { score: 80, status: 'FAIL' } } } };
  assert.deepEqual(scorecardFromEntry(plain), { score: 80, status: 'FAIL' });
  assert.equal(scorecardFromEntry({ aspects: { 'x.global.schema': { data: {} } } }), null);
});

test('fatos da entrada do Knowledge Catalog: contatos, documentação, uso e cadência', () => {
  const str = (v) => ({ kind: 'stringValue', stringValue: v });
  const num = (v) => ({ kind: 'numberValue', numberValue: v });
  const list = (values) => ({ kind: 'listValue', listValue: { values } });
  const struct = (fields) => ({ kind: 'structValue', structValue: { fields } });
  // Formato gRPC (google.protobuf.Struct), como devolvido pelo SDK.
  const grpc = {
    entrySource: { displayName: 'tabela_a' },
    aspects: {
      '655216118709.global.contacts': {
        data: { fields: { identities: list([struct({ role: str('Owner'), name: str('Equipe'), id: str('equipe@exemplo.invalid') })]) } },
      },
      '655216118709.global.overview': { data: { fields: { content: str('<p>Documentação</p>') } } },
      '655216118709.global.usage': {
        data: {
          fields: {
            metrics: list([
              struct({
                name: str('total_queries'),
                timeSeries: list([struct({ interval: str('7d'), value: num(3) }), struct({ interval: str('30d'), value: num(12) })]),
              }),
              struct({ name: str('failures'), timeSeries: list([struct({ interval: str('30d'), value: num(99) })]) }),
            ]),
            refreshTime: str('2026-01-15T00:00:00Z'),
          },
        },
      },
      '655216118709.global.refresh-cadence': { data: { fields: { frequency: str('Daily') } } },
    },
  };
  assert.deepEqual(catalogFactsFromEntry(grpc), {
    contactsCount: 1,
    hasOverview: true,
    queries30d: 12,
    usageRefreshTime: '2026-01-15T00:00:00Z',
    refreshCadence: 'Daily',
  });

  // Formato JSON simples (REST). Aspecto de uso vazio = métrica não informada (null), não zero.
  const plain = {
    aspects: {
      'x.global.usage': { data: {} },
      'x.global.contacts': { data: { identities: [{ role: 'Owner' }] } }, // sem nome e sem id: não conta
      'x.global.overview': { data: { content: '   ' } },
    },
  };
  assert.deepEqual(catalogFactsFromEntry(plain), {
    contactsCount: 0,
    hasOverview: false,
    queries30d: null,
    usageRefreshTime: null,
    refreshCadence: null,
  });
  const zero = { aspects: { 'x.global.usage': { data: { metrics: [{ name: 'total_queries', timeSeries: [{ interval: '30d', value: 0 }] }] } } } };
  assert.equal(catalogFactsFromEntry(zero).queries30d, 0);
  assert.equal(catalogFactsFromEntry({}).queries30d, null);
  assert.equal(catalogFactsFromEntry(null).contactsCount, 0);

  const item = catalogItemFromEntry({ key: 'ds.tabela_a' }, grpc, { entryName: 'entries/x', entryLocation: 'us' });
  assert.equal(item.found, true);
  assert.equal(item.displayName, 'tabela_a');
  assert.deepEqual(item.aspectTypes, ['contacts', 'overview', 'refresh-cadence', 'usage']);
  assert.equal(item.scorecard, null);
});

/** Troca os campos que variam a cada chamada por um valor fixo, para comparar com os fixtures. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'timestamp' || k === 'lastLookupTime' ? demoData.DEMO_TIME : stable(v)])
    );
  }
  return value;
}

const ENDPOINTS = {
  dimensions: '/dimensions',
  dataQuality: '/data-quality-dimensions',
  lineage: '/lineage-traceability',
  sensitive: '/dlp-sensitive-data',
};

test('rotas: demonstração, projeto sem escopo e falha de API — sem dados presumidos', async () => {
  const express = require('express');
  const collectors = require('./collectors');
  const savedEnv = {
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
    IS_SERVICE_ACCOUNT: process.env.IS_SERVICE_ACCOUNT,
    DISABLE_AUTH: process.env.DISABLE_AUTH,
  };
  const savedCollectors = { ...collectors };
  process.env.GOOGLE_CLOUD_PROJECT_ID = PROJECT;
  delete process.env.IS_SERVICE_ACCOUNT;
  delete process.env.DISABLE_AUTH;

  // Nenhuma chamada real de nuvem neste teste: os coletores são trocados por respostas fixas.
  let cloudCalls = 0;
  let listing = { scans: [], totalListed: 0, totalDataQuality: 0, truncated: false, diagnostics: [] };
  collectors.collectDataQualityScans = async () => {
    cloudCalls += 1;
    return listing;
  };
  collectors.collectTableMetadata = async () => ({ items: [], truncated: false, diagnostics: [] });
  collectors.collectLineage = async () => ({ items: [], truncated: false, diagnostics: [] });
  collectors.collectCatalogContext = async () => ({ items: [], contexts: [], truncated: false, diagnostics: [] });
  collectors.countSensitiveDataProfiles = async () => ({
    consultado: true,
    local: 'global',
    quantidade: 0,
    haMais: false,
    erro: null,
  });

  const app = express();
  app.use(
    '/api/v1/rc18',
    createRc18Router({
      getAuthClient: (token) => ({ token }),
      getRequestAccessToken: async () => {
        throw new Error('modo usuário não deve pedir token da conta de serviço');
      },
      dataFilePath: null,
    })
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/rc18`;
  const get = async (pathAndQuery, token) => {
    const res = await fetch(`${base}${pathAndQuery}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    return { status: res.status, body: await res.json() };
  };
  const getAll = async (query, token) => {
    const out = {};
    for (const [name, route] of Object.entries(ENDPOINTS)) {
      const r = await get(`${route}?${query}`, token);
      assert.equal(r.status, 200, `${name} ${query}`);
      assert.equal(r.body.success, true, name);
      out[name] = r.body;
    }
    return out;
  };

  try {
    // 1) Modo demonstração: explícito, sem token e sem chamadas de nuvem.
    const demo = await getAll('demo=true&location=global&rid=t1');
    assert.equal(cloudCalls, 0);
    for (const [name, body] of Object.entries(demo)) {
      assert.equal(body.demo, true, name);
      assert.equal(body.identityMode, 'demo', name);
      assert.equal(body.projectId, PROJECT, name);
      assert.deepEqual(body.diagnostics, [], name);
    }
    assert.equal(demo.dimensions.dimensoes.length, 12);
    assert.deepEqual(demo.dimensions.resumo, { medidas: 9, semDados: 0, naoMedidas: 3 });
    assert.equal(demo.dimensions.escopo.tabelas.length, 4);
    assert.equal(demo.dataQuality.centralizedCatalogContext.length, 4);
    assert.equal(demo.dataQuality.centralizedCatalogContext[0].contactsCount, 2);
    assert.equal(demo.dataQuality.lookupContextYaml, null);
    assert.equal(demo.lineage.summary.traceabilityCoveragePct, 75);
    assert.equal(demo.sensitive.perfisSensitiveDataProtection.consultado, false);

    // 2) Sem modo demonstração e sem token: recusa (não responde com dados de exemplo).
    const semToken = await get('/dimensions?location=global');
    assert.equal(semToken.status, 401);
    assert.equal(semToken.body.success, false);
    assert.equal((await get('/dimensions?demo=true&location=..%2Fx')).status, 400);
    assert.equal(cloudCalls, 0);

    // 3) Projeto sem DataScans de qualidade: nada é medido e nenhum número aparece.
    const vazio = await getAll('location=global&rid=t2', 'token-de-teste');
    assert.equal(cloudCalls, 1, 'as quatro rotas de um mesmo carregamento (rid) compartilham a coleta');
    for (const [name, body] of Object.entries(vazio)) {
      assert.equal(body.demo, false, name);
      assert.equal(body.identityMode, 'user', name);
    }
    assert.deepEqual(vazio.dimensions.resumo, { medidas: 0, semDados: 8, naoMedidas: 4 });
    assert.ok(vazio.dimensions.dimensoes.every((d) => d.indicadores.length === 0));
    assert.deepEqual(vazio.dimensions.escopo.tabelas, []);
    assert.equal(vazio.dataQuality.dimensions.accuracy.scorePct, null);
    assert.deepEqual(vazio.dataQuality.tableSummaries, []);
    assert.equal(vazio.lineage.summary.traceabilityCoveragePct, null);
    assert.equal(vazio.sensitive.summary.overallProtectionCoveragePct, null);

    // 4) Falha na listagem: o erro vai para `diagnostics`; nada é substituído por exemplo.
    listing = {
      ...listing,
      diagnostics: [
        {
          fonte: 'Dataplex DataScans (listagem)',
          local: 'todas as localizações',
          mensagem: 'PERMISSION_DENIED: permissão dataplex.datascans.list negada (exemplo de teste)',
          codigo: 7,
        },
      ],
    };
    const falha = await getAll('location=global&rid=t3', 'token-de-teste');
    for (const [name, body] of Object.entries(falha)) {
      assert.equal(body.demo, false, name);
      assert.equal(body.diagnostics.length, 1, name);
      assert.equal(body.diagnostics[0].codigo, 7, name);
    }
    assert.equal(falha.dimensions.resumo.medidas, 0);

    // Os testes do frontend renderizam o painel com estas mesmas respostas.
    const payloads = stable({ demo, vazio, falha });
    const fixturePath = path.join(__dirname, '..', '..', 'src', 'component', 'RC18', '__fixtures__', 'rc18-respostas.json');
    if (process.env.UPDATE_RC18_FIXTURES === '1') {
      fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
      fs.writeFileSync(fixturePath, `${JSON.stringify(payloads, null, 2)}\n`);
    }
    assert.ok(fs.existsSync(fixturePath), 'fixture ausente: rode UPDATE_RC18_FIXTURES=1 npm test (em backend/)');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
      payloads,
      'fixtures do frontend desatualizados: rode UPDATE_RC18_FIXTURES=1 npm test (em backend/)'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(collectors, savedCollectors);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

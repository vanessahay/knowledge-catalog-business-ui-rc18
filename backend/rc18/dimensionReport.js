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
 * Monta o relatório das 12 dimensões (art. 2º, § 2º) e o resumo de não conformidades a partir
 * das evidências coletadas: regras dos DataScans ativos, metadados do BigQuery, Data Lineage API
 * e entradas do Knowledge Catalog.
 * Função pura: não chama APIs, não usa limiares arbitrários e não preenche lacunas com valores presumidos.
 *
 * `situacao` (estritamente factual):
 *   'com_falhas'  -> há ao menos 1 regra ativa executada e reprovada (prioridade sobre categoria);
 *   'sem_falhas'  -> regras ativas executadas com 0 reprovações (dimensões de dados ou governança só com regras);
 *   'completo'    -> cobertura de governança/glossário em 100%;
 *   'lacunas'     -> cobertura de governança/glossário abaixo de 100%;
 *   'leitura_parcial' -> nada falhou entre o que foi lido, mas parte do escopo (DataScans ou tabelas) não foi lida;
 *   'informativo' -> Relevância (uso em 30 dias é sinal informativo, nunca falha/lacuna obrigatória);
 *   'sem_dados'   -> existe coletor para a dimensão, mas nada foi encontrado no escopo;
 *   'nao_medido'  -> dimensão declaratória sem regras ativas executadas.
 */

const { DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { scoreFromRules, round2, canonicalKeyForScan } = require('./dqScans');

const COMO_MEDIDO_REGRAS_PERSONALIZADAS =
  'Percentual de regras aprovadas entre as regras de DataScan marcadas com a dimensão personalizada.';
const LIMITE_REGRAS_PERSONALIZADAS =
  'Reflete apenas as regras que a instituição marcou com esta dimensão personalizada; se elas bastam para evidenciar a dimensão é avaliação da instituição.';
const ESCOPO_NAO_LIDO =
  'Nem todos os DataScans do escopo puderam ser lidos (veja os diagnósticos); não é possível afirmar se há regras desta dimensão.';

const GOVERNANCE_INDICATOR_BY_DIM = Object.freeze({
  acessibilidade: 'tabelas_com_contatos',
  clareza: 'colunas_descritas',
  rastreabilidade: 'tabelas_com_origem',
  relevancia: 'tabelas_com_uso',
});

function sum(list, pick) {
  return list.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

/** Cobertura completa decidida pelos números exatos (o percentual arredondado pode exibir 100%). */
function isComplete(ind) {
  return ind.denominador > 0 && ind.numerador === ind.denominador;
}

/**
 * Situação de um indicador de cobertura: lacuna verificada prevalece; 100% entre as tabelas lidas com
 * parte do escopo não lida é 'leitura_parcial' (nunca 'completo').
 */
function coverageSituacao(ind) {
  if (!isComplete(ind)) return 'lacunas';
  return ind.naoVerificadas > 0 ? 'leitura_parcial' : 'completo';
}

function resolveSituacao(d, score, indicadores, regrasLidas) {
  // Prioridade absoluta: qualquer regra ativa reprovada marca a dimensão como 'com_falhas',
  // inclusive em dimensões de governança que tenham regras DQ personalizadas.
  if (score.rulesFailed > 0) return 'com_falhas';

  // Sem falha nem lacuna verificada, mas com parte do escopo não lida: nunca "sem falhas" ou "completo".
  const semFalhas = regrasLidas ? 'sem_falhas' : 'leitura_parcial';
  const cobertura = (ind) => {
    const situacao = coverageSituacao(ind);
    return situacao === 'completo' && !regrasLidas ? 'leitura_parcial' : situacao;
  };

  if (d.categoria === 'dados') {
    if (score.rulesExecuted > 0) return semFalhas;
    if (d.id === 'comparabilidade') {
      const glossaryInd = indicadores.find((i) => i.id === 'tabelas_com_termo_de_glossario');
      if (glossaryInd) return cobertura(glossaryInd);
    }
    return d.coleta === 'declaratoria' ? 'nao_medido' : 'sem_dados';
  }

  // categoria === 'governanca'
  const govIndicatorId = GOVERNANCE_INDICATOR_BY_DIM[d.id];
  const govInd = govIndicatorId ? indicadores.find((i) => i.id === govIndicatorId) : null;
  if (govInd) {
    if (d.id === 'relevancia') return 'informativo';
    return cobertura(govInd);
  }
  if (score.rulesExecuted > 0) return semFalhas;
  return d.coleta === 'declaratoria' ? 'nao_medido' : 'sem_dados';
}

function buildDimensionReport({
  rules = [],
  activeScans = [],
  scanMetaByKey = null,
  tableMetadata = [],
  lineage = [],
  catalog = [],
  dimensions = DIMENSIONS,
  regrasLidas = true,
} = {}) {
  const index = buildDqDimensionIndex(dimensions);
  const byDimension = new Map(dimensions.map((d) => [d.id, []]));
  const unmapped = new Map();
  const unmappedRulesList = [];

  for (const rule of rules) {
    const id = rule.dqDimension ? index.get(rule.dqDimension) : undefined;
    if (id) {
      byDimension.get(id).push(rule);
    } else {
      unmappedRulesList.push(rule);
      if (!rule.suspended) {
        const label = rule.dqDimension || '(sem dimensão)';
        unmapped.set(label, (unmapped.get(label) || 0) + 1);
      }
    }
  }

  const okMetadata = tableMetadata.filter((m) => m && m.ok);
  const okLineage = lineage.filter((l) => l && l.ok);
  // Entrada inexistente no catálogo (404) é fato verificado: a tabela entra nas contagens como sem
  // contatos, sem documentação, sem uso informado e sem termos de glossário.
  const catalogAbsent = catalog
    .filter((c) => c && c.found === false)
    .map((c) => ({
      ...c,
      facts: { contactsCount: 0, hasOverview: false, queries30d: null },
      glossary: { termLinks: 0, terms: [], truncated: false },
    }));
  const okCatalog = [...catalog.filter((c) => c && c.found === true && c.facts), ...catalogAbsent];
  const countCatalog = (pick) => okCatalog.filter((c) => pick(c.facts)).length;
  const okGlossary = okCatalog.filter((c) => c.glossary);

  // Tabelas do escopo e tabelas com cada sinal de governança lido: o que não foi lido nunca conta como
  // "em ordem" (`naoVerificadas` nos indicadores de cobertura e `governancaNaoVerificada` no resumo).
  const scopeKeys = new Set((activeScans || []).filter(Boolean).map((s) => canonicalKeyForScan(s)));
  const keyOf = (item) => item.canonicalKey || item.key;
  const contactsRead = new Set(okCatalog.map(keyOf));
  const originRead = new Set(okLineage.map(keyOf));
  const descriptionsRead = new Set(okMetadata.map(keyOf));
  const glossaryRead = new Set(okGlossary.map(keyOf));
  const naoLidas = (read) => [...scopeKeys].filter((k) => !read.has(k)).length;

  const dimensoes = dimensions.map((d) => {
    const regras = byDimension.get(d.id);
    const score = scoreFromRules(regras);
    const indicadores = [];
    const evidencias = [];

    if (score.rulesExecuted > 0) {
      indicadores.push({
        id: 'regras_dq',
        rotulo: 'Regras de qualidade aprovadas (última execução dos DataScans)',
        rotuloCurto: 'regras aprovadas',
        valorPct: score.scorePct,
        numerador: score.rulesPassed,
        denominador: score.rulesExecuted,
        unidade: 'regras',
      });
      const times = regras
        .filter((r) => !r.suspended && r.executed && r.executionTime)
        .map((r) => r.executionTime)
        .sort();
      if (times.length > 0) {
        evidencias.push({ rotulo: 'Regras: execução mais recente', valor: times[times.length - 1] });
        if (times[0] !== times[times.length - 1]) {
          evidencias.push({ rotulo: 'Regras: execução mais antiga', valor: times[0] });
        }
      }
    }

    if (d.id === 'comparabilidade' && okGlossary.length > 0) {
      const withTerms = okGlossary.filter((c) => c.glossary.termLinks > 0).length;
      indicadores.push({
        id: 'tabelas_com_termo_de_glossario',
        rotulo: 'Tabelas do escopo com termo de glossário vinculado (Knowledge Catalog)',
        rotuloCurto: 'tabelas com termo de glossário',
        valorPct: round2((100 * withTerms) / okGlossary.length),
        numerador: withTerms,
        denominador: okGlossary.length,
        unidade: 'tabelas',
        naoVerificadas: naoLidas(glossaryRead),
      });
      const terms = new Set(okGlossary.flatMap((c) => c.glossary.terms));
      // Lista de vínculos cortada em alguma tabela: o total de termos é um mínimo ("N+").
      const termosCortados = okGlossary.some((c) => c.glossary.truncated);
      evidencias.push({
        rotulo: 'Termos de glossário distintos vinculados',
        valor: `${terms.size}${termosCortados ? '+' : ''}`,
      });
    }

    if (d.id === 'acessibilidade' && okCatalog.length > 0) {
      const withContacts = countCatalog((f) => f.contactsCount > 0);
      indicadores.push({
        id: 'tabelas_com_contatos',
        rotulo: 'Tabelas do escopo com contatos registrados no Knowledge Catalog (aspecto contacts)',
        rotuloCurto: 'tabelas com contatos',
        valorPct: round2((100 * withContacts) / okCatalog.length),
        numerador: withContacts,
        denominador: okCatalog.length,
        unidade: 'tabelas',
        naoVerificadas: naoLidas(contactsRead),
      });
    }

    if (d.id === 'relevancia' && okCatalog.length > 0) {
      const withUsage = countCatalog((f) => typeof f.queries30d === 'number' && f.queries30d > 0);
      indicadores.push({
        id: 'tabelas_com_uso',
        rotulo: 'Tabelas do escopo com consultas registradas nos últimos 30 dias (aspecto usage do Knowledge Catalog)',
        rotuloCurto: 'tabelas com consultas em 30 dias',
        valorPct: round2((100 * withUsage) / okCatalog.length),
        numerador: withUsage,
        denominador: okCatalog.length,
        unidade: 'tabelas',
        naoVerificadas: naoLidas(contactsRead),
      });
      evidencias.push({
        rotulo: 'Tabelas sem métrica de uso informada pelo catálogo',
        valor: `${countCatalog((f) => f.queries30d === null)} de ${okCatalog.length}`,
      });
    }

    if (d.id === 'clareza' && okMetadata.length > 0) {
      const totalColumns = sum(okMetadata, (m) => m.totalColumns);
      const described = sum(okMetadata, (m) => m.columnsWithDescription);
      if (totalColumns > 0) {
        indicadores.push({
          id: 'colunas_descritas',
          rotulo: 'Colunas com descrição nas tabelas do escopo',
          rotuloCurto: 'colunas com descrição',
          valorPct: round2((100 * described) / totalColumns),
          numerador: described,
          denominador: totalColumns,
          unidade: 'colunas',
          naoVerificadas: naoLidas(descriptionsRead),
        });
      }
      evidencias.push({
        rotulo: 'Tabelas com descrição',
        valor: `${okMetadata.filter((m) => m.tableDescription).length} de ${okMetadata.length}`,
      });
    }
    if (d.id === 'clareza' && okCatalog.length > 0) {
      evidencias.push({
        rotulo: 'Tabelas com documentação no Knowledge Catalog (aspecto overview)',
        valor: `${countCatalog((f) => f.hasOverview)} de ${okCatalog.length}`,
      });
    }

    if (d.id === 'rastreabilidade' && okLineage.length > 0) {
      const withUpstream = okLineage.filter((l) => l.upstream.length > 0).length;
      indicadores.push({
        id: 'tabelas_com_origem',
        rotulo: 'Tabelas do escopo com origem registrada na Data Lineage API',
        rotuloCurto: 'tabelas com origem registrada',
        valorPct: round2((100 * withUpstream) / okLineage.length),
        numerador: withUpstream,
        denominador: okLineage.length,
        unidade: 'tabelas',
        naoVerificadas: naoLidas(originRead),
      });
    }

    if (d.id === 'tempestividade') {
      for (const m of okMetadata) {
        if (m.lastModifiedTime) {
          evidencias.push({ rotulo: `Última modificação — ${m.key}`, valor: m.lastModifiedTime });
        }
      }
    }

    let estado = 'nao_medido';
    if (indicadores.length > 0) estado = 'medido';
    else if (d.coleta !== 'declaratoria') estado = 'sem_dados';

    const situacao = resolveSituacao(d, score, indicadores, regrasLidas);
    const porRegrasPersonalizadas = d.coleta === 'declaratoria' && indicadores.length > 0;

    // Há regras marcadas com a dimensão, mas nenhuma executada (sem execução ou suspensas):
    // o texto padrão "Não há regras marcadas" seria falso nesse caso.
    const regrasInativas = score.rulesNotExecuted + score.rulesSuspended;
    let lacuna = porRegrasPersonalizadas ? LIMITE_REGRAS_PERSONALIZADAS : d.lacuna;
    if (indicadores.length === 0 && regrasInativas > 0) {
      lacuna = `Há ${regrasInativas} regra(s) marcada(s) com esta dimensão no escopo, mas nenhuma foi executada na última execução dos DataScans (${score.rulesNotExecuted} sem execução, ${score.rulesSuspended} suspensa(s)).`;
    }
    // DataScans do escopo não lidos por inteiro (listagem ou leitura detalhada com falha): não é possível
    // afirmar que não há regras de uma dimensão medida por regras.
    if (!regrasLidas && indicadores.length === 0 && regrasInativas === 0 && d.coleta !== 'parcial') {
      lacuna = ESCOPO_NAO_LIDO;
    }

    return {
      id: d.id,
      inciso: d.inciso,
      nome: d.nome,
      categoria: d.categoria,
      definicao: d.definicao,
      coleta: d.coleta,
      estado,
      situacao,
      indicadores,
      regras: {
        total: score.rulesTotal,
        executadas: score.rulesExecuted,
        aprovadas: score.rulesPassed,
        reprovadas: score.rulesFailed,
        naoExecutadas: score.rulesNotExecuted,
        suspensas: score.rulesSuspended,
      },
      dqDimensions: d.dqDimensions,
      fontes: d.fontes,
      comoEMedido: porRegrasPersonalizadas ? COMO_MEDIDO_REGRAS_PERSONALIZADAS : d.comoEMedido,
      lacuna,
      porRegrasPersonalizadas,
      medicao: d.medicao || [],
      evidencias,
    };
  });

  // Resumo executivo de não conformidades reconciliado 1:1 com a Aba 2 (inclui unmappedRules).
  const allScore = scoreFromRules(rules);
  const unmappedScore = scoreFromRules(unmappedRulesList);
  const failedTables = new Set();
  for (const r of rules) {
    if (!r.suspended && r.executed && r.passed === false) {
      failedTables.add(r.canonicalKey || r.tableKey);
    }
  }

  // Scans desatualizados contados por scan único em `activeScans` (cobre scans com 0 regras ativas).
  const staleScans = new Set();
  for (const scan of activeScans || []) {
    if (!scan) continue;
    const key = canonicalKeyForScan(scan);
    const meta = scanMetaByKey && scanMetaByKey.get(key);
    if (meta && meta.isStale) staleScans.add(meta.scanName || meta.scanId || key);
  }

  // Lacunas de governança: contagem de tabelas distintas (por canonicalKey) com ao menos 1 lacuna
  // verificada em contatos, origem de linhagem ou descrição de colunas (exclui Relevância).
  const tablesWithGovernanceGap = new Set();
  for (const c of okCatalog) {
    if (c.facts.contactsCount === 0) tablesWithGovernanceGap.add(c.canonicalKey || c.key);
  }
  for (const l of okLineage) {
    if (!Array.isArray(l.upstream) || l.upstream.length === 0) {
      tablesWithGovernanceGap.add(l.canonicalKey || l.key);
    }
  }
  for (const m of okMetadata) {
    if (m.totalColumns > 0 && m.columnsWithDescription < m.totalColumns) {
      tablesWithGovernanceGap.add(m.canonicalKey || m.key);
    }
  }

  // Tabelas do escopo sem lacuna verificada em que algum sinal (contatos, origem ou descrições) não pôde
  // ser lido: o KPI não pode afirmar que estão em ordem.
  let governancaNaoVerificada = 0;
  for (const key of scopeKeys) {
    if (tablesWithGovernanceGap.has(key)) continue;
    if (!contactsRead.has(key) || !originRead.has(key) || !descriptionsRead.has(key)) governancaNaoVerificada += 1;
  }

  return {
    dimensoes,
    resumoNaoConformidades: {
      totalRegrasReprovadas: allScore.rulesFailed,
      regrasSemMapeamentoReprovadas: unmappedScore.rulesFailed,
      tabelasComFalhas: failedTables.size,
      scansDesatualizados: staleScans.size,
      regrasSemExecucao: allScore.rulesNotExecuted,
      regrasSuspensas: allScore.rulesSuspended,
      lacunasGovernanca: tablesWithGovernanceGap.size,
      governancaNaoVerificada,
    },
    regrasSemMapeamento: [...unmapped.entries()].map(([dqDimension, quantidade]) => ({
      dqDimension,
      quantidade,
    })),
    // Uso interno da rota (marcador `lacunaGovernanca` por tabela); não é enviado na resposta.
    governanceGapKeys: [...tablesWithGovernanceGap].sort(),
  };
}

module.exports = { buildDimensionReport };

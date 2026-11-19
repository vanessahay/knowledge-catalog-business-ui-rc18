'use strict';

/**
 * Monta o relatório das 12 dimensões (art. 2º, § 2º) a partir das evidências coletadas:
 * regras dos DataScans, metadados do BigQuery, Data Lineage API e entradas do Knowledge Catalog.
 * Função pura: não chama APIs e não preenche lacunas com valores presumidos.
 *
 * estado de cada dimensão:
 *   'medido'     -> há pelo menos um indicador calculado a partir de dados coletados;
 *   'sem_dados'  -> existe coletor para a dimensão, mas nada foi encontrado no escopo;
 *   'nao_medido' -> não há coletor nesta versão e não há regras marcadas com a dimensão.
 */

const { DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { scoreFromRules, round2 } = require('./dqScans');

function sum(list, pick) {
  return list.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

function buildDimensionReport({ rules = [], tableMetadata = [], lineage = [], catalog = [], dimensions = DIMENSIONS } = {}) {
  const index = buildDqDimensionIndex(dimensions);
  const byDimension = new Map(dimensions.map((d) => [d.id, []]));
  const unmapped = new Map();

  for (const rule of rules) {
    const id = rule.dqDimension ? index.get(rule.dqDimension) : undefined;
    if (id) {
      byDimension.get(id).push(rule);
    } else {
      const label = rule.dqDimension || '(sem dimensão)';
      unmapped.set(label, (unmapped.get(label) || 0) + 1);
    }
  }

  const okMetadata = tableMetadata.filter((m) => m.ok);
  const okLineage = lineage.filter((l) => l.ok);
  // Entradas do Knowledge Catalog lidas com sucesso (GetEntry) para as tabelas do escopo.
  const okCatalog = catalog.filter((c) => c.found && c.facts);
  const countCatalog = (pick) => okCatalog.filter((c) => pick(c.facts)).length;

  const dimensoes = dimensions.map((d) => {
    const regras = byDimension.get(d.id);
    const score = scoreFromRules(regras);
    const indicadores = [];
    const evidencias = [];

    if (score.rulesExecuted > 0) {
      indicadores.push({
        id: 'regras_dq',
        rotulo: 'Regras de qualidade aprovadas (última execução dos DataScans)',
        valorPct: score.scorePct,
        numerador: score.rulesPassed,
        denominador: score.rulesExecuted,
        unidade: 'regras',
      });
    }

    if (d.id === 'acessibilidade' && okCatalog.length > 0) {
      const withContacts = countCatalog((f) => f.contactsCount > 0);
      indicadores.push({
        id: 'tabelas_com_contatos',
        rotulo: 'Tabelas do escopo com contatos registrados no Knowledge Catalog (aspecto contacts)',
        valorPct: round2((100 * withContacts) / okCatalog.length),
        numerador: withContacts,
        denominador: okCatalog.length,
        unidade: 'tabelas',
      });
    }

    if (d.id === 'relevancia' && okCatalog.length > 0) {
      const withUsage = countCatalog((f) => typeof f.queries30d === 'number' && f.queries30d > 0);
      indicadores.push({
        id: 'tabelas_com_uso',
        rotulo: 'Tabelas do escopo com consultas registradas nos últimos 30 dias (aspecto usage do Knowledge Catalog)',
        valorPct: round2((100 * withUsage) / okCatalog.length),
        numerador: withUsage,
        denominador: okCatalog.length,
        unidade: 'tabelas',
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
          valorPct: round2((100 * described) / totalColumns),
          numerador: described,
          denominador: totalColumns,
          unidade: 'colunas',
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
        valorPct: round2((100 * withUpstream) / okLineage.length),
        numerador: withUpstream,
        denominador: okLineage.length,
        unidade: 'tabelas',
      });
    }

    if (d.id === 'tempestividade') {
      if (okCatalog.length > 0) {
        evidencias.push({
          rotulo: 'Tabelas com cadência de atualização declarada no Knowledge Catalog (aspecto refresh-cadence)',
          valor: `${countCatalog((f) => !!f.refreshCadence)} de ${okCatalog.length}`,
        });
      }
      for (const m of okMetadata) {
        if (m.lastModifiedTime) {
          evidencias.push({ rotulo: `Última modificação — ${m.key}`, valor: m.lastModifiedTime });
        }
      }
    }

    let estado = 'nao_medido';
    if (indicadores.length > 0) estado = 'medido';
    else if (d.coleta !== 'declaratoria') estado = 'sem_dados';

    return {
      id: d.id,
      inciso: d.inciso,
      nome: d.nome,
      definicao: d.definicao,
      coleta: d.coleta,
      estado,
      indicadores,
      regras: {
        total: score.rulesTotal,
        executadas: score.rulesExecuted,
        aprovadas: score.rulesPassed,
        reprovadas: score.rulesFailed,
        naoExecutadas: score.rulesNotExecuted,
      },
      dqDimensions: d.dqDimensions,
      fontes: d.fontes,
      comoEMedido: d.comoEMedido,
      lacuna: d.lacuna,
      evidencias,
    };
  });

  return {
    dimensoes,
    resumo: {
      medidas: dimensoes.filter((d) => d.estado === 'medido').length,
      semDados: dimensoes.filter((d) => d.estado === 'sem_dados').length,
      naoMedidas: dimensoes.filter((d) => d.estado === 'nao_medido').length,
    },
    regrasSemMapeamento: [...unmapped.entries()].map(([dqDimension, quantidade]) => ({
      dqDimension,
      quantidade,
    })),
  };
}

module.exports = { buildDimensionReport };

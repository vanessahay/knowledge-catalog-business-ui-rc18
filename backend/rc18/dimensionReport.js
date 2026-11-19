'use strict';

/**
 * Monta o relatório das 12 dimensões (art. 2º, § 2º) a partir das evidências coletadas:
 * regras dos DataScans, metadados do BigQuery, Data Lineage API e entradas do Knowledge Catalog
 * (aspectos e vínculos com termos de glossário).
 * Função pura: não chama APIs e não preenche lacunas com valores presumidos.
 *
 * estado de cada dimensão:
 *   'medido'     -> há pelo menos um indicador calculado a partir de dados coletados;
 *   'sem_dados'  -> existe coletor para a dimensão, mas nada foi encontrado no escopo;
 *   'nao_medido' -> a dimensão não tem coletor próprio e não há regras marcadas com ela.
 */

const { DIMENSIONS, buildDqDimensionIndex } = require('./dimensions');
const { scoreFromRules, round2 } = require('./dqScans');

const COMO_MEDIDO_REGRAS_PERSONALIZADAS =
  'Percentual de regras aprovadas entre as regras de DataScan marcadas com a dimensão personalizada.';
const LIMITE_REGRAS_PERSONALIZADAS =
  'Reflete apenas as regras que a instituição marcou com esta dimensão personalizada; se elas bastam para evidenciar a dimensão é avaliação da instituição.';

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
  // Entradas cujos vínculos com termos de glossário foram lidos (lookupEntryLinks).
  const okGlossary = okCatalog.filter((c) => c.glossary);

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
      // O indicador junta a última execução de cada DataScan: as datas podem ser distantes.
      const times = regras.filter((r) => r.executed && r.executionTime).map((r) => r.executionTime).sort();
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
        valorPct: round2((100 * withTerms) / okGlossary.length),
        numerador: withTerms,
        denominador: okGlossary.length,
        unidade: 'tabelas',
      });
      const terms = new Set(okGlossary.flatMap((c) => c.glossary.terms));
      evidencias.push({ rotulo: 'Termos de glossário distintos vinculados', valor: String(terms.size) });
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
      for (const m of okMetadata) {
        if (m.lastModifiedTime) {
          evidencias.push({ rotulo: `Última modificação — ${m.key}`, valor: m.lastModifiedTime });
        }
      }
    }

    let estado = 'nao_medido';
    if (indicadores.length > 0) estado = 'medido';
    else if (d.coleta !== 'declaratoria') estado = 'sem_dados';

    // Dimensão sem coletor próprio, medida só pelas regras que a instituição marcou com a
    // dimensão personalizada: o limite a informar é o do próprio indicador.
    const porRegrasPersonalizadas = d.coleta === 'declaratoria' && indicadores.length > 0;

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
      comoEMedido: porRegrasPersonalizadas ? COMO_MEDIDO_REGRAS_PERSONALIZADAS : d.comoEMedido,
      lacuna: porRegrasPersonalizadas ? LIMITE_REGRAS_PERSONALIZADAS : d.lacuna,
      porRegrasPersonalizadas,
      // Recursos do Google Cloud com que a instituição produz a evidência desta dimensão.
      medicao: d.medicao || [],
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

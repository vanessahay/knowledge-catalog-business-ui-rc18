'use strict';

/**
 * Converte o resultado da coleta de linhagem (por tabela do escopo) no formato consumido pela
 * visão de rastreabilidade. Função pura.
 *
 * Só representa o que a Data Lineage API devolveu: não classifica destinos como "regulatórios",
 * não presume agendamentos e não declara conformidade.
 */

const { round2 } = require('./dqScans');

function shortFqn(fqn) {
  return String(fqn || '').replace(/^bigquery:/, '');
}

function systemOf(fqn) {
  const s = String(fqn || '');
  return s.includes(':') ? s.split(':')[0] : 'não informado';
}

function processIdOf(name) {
  return String(name || '').split('/').pop() || null;
}

function buildLineageView(perTable = [], { qualityByTable = {} } = {}) {
  const nodes = new Map();
  const edges = [];
  const pipelineDetails = [];
  const distinctSources = new Set();
  const distinctTargets = new Set();
  const distinctProcesses = new Set();

  const addNode = (node) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  for (const t of perTable) {
    const tableNodeId = `tbl:${t.key}`;
    const score = qualityByTable[t.key];
    addNode({
      id: tableNodeId,
      label: t.key,
      type: 'table',
      dataset: t.dataset,
      table: t.table,
      rows: null,
      qualityScore: score === undefined ? null : score,
    });

    const upstream = t.ok ? t.upstream : [];
    const downstream = t.ok ? t.downstream : [];
    const processes = t.ok ? t.processes : [];

    for (const fqn of upstream) {
      distinctSources.add(fqn);
      const id = `src:${fqn}`;
      addNode({ id, label: shortFqn(fqn), type: 'source', layer: 'Origem registrada', system: systemOf(fqn) });
      edges.push({ source: id, target: tableNodeId, label: 'origem' });
    }
    for (const fqn of downstream) {
      distinctTargets.add(fqn);
      const id = `tgt:${fqn}`;
      addNode({
        id,
        label: shortFqn(fqn),
        type: 'target',
        regulatoryEntity: `Ativo a jusante (${systemOf(fqn)})`,
        deadline: null,
        frequency: null,
      });
      edges.push({ source: tableNodeId, target: id, label: 'destino' });
    }
    for (const p of processes) {
      distinctProcesses.add(p.name);
      addNode({
        id: `proc:${p.name}`,
        label: p.displayName || processIdOf(p.name),
        type: 'process',
        engine: p.sourceType || null,
        schedule: null,
        script: p.originName || null,
        processId: processIdOf(p.name),
      });
    }

    let note;
    if (!t.ok) note = `Não foi possível consultar a linhagem: ${t.error}`;
    else if (upstream.length === 0 && downstream.length === 0)
      note = `Nenhum elo registrado nas localizações consultadas (${(t.locationsTried || []).join(', ') || 'nenhuma'}).`;
    else note = `Elos obtidos da Data Lineage API em ${t.location}.`;

    pipelineDetails.push({
      table: t.key,
      sourceSystem: upstream.length > 0 ? shortFqn(upstream[0]) : 'Sem origem registrada',
      ingestionType: upstream.length > 1 ? `e mais ${upstream.length - 1} origem(ns)` : '',
      transformationEngine: processes.length > 0 ? processes[0].sourceType || 'não informado' : 'não identificado',
      pipelineName: processes.length > 0 ? processes[0].displayName || processIdOf(processes[0].name) : null,
      lastRunTime: null,
      regulatoryTargets: downstream.slice(0, 5).map(shortFqn),
      traceabilityStatus: !t.ok
        ? 'Não consultado'
        : upstream.length > 0
        ? 'Origem registrada'
        : 'Sem origem registrada',
      hasUpstream: t.ok && upstream.length > 0,
      columnLineageCount: upstream.length + downstream.length,
      complianceNote: note,
    });
  }

  const consulted = perTable.filter((t) => t.ok);
  const withUpstream = consulted.filter((t) => t.upstream.length > 0).length;
  const onlyDownstream = consulted.filter((t) => t.upstream.length === 0 && t.downstream.length > 0).length;

  return {
    summary: {
      totalTablesAudited: consulted.length,
      fullyTraceableTablesCount: withUpstream,
      partialTraceableTablesCount: onlyDownstream,
      traceabilityCoveragePct: consulted.length > 0 ? round2((100 * withUpstream) / consulted.length) : null,
      totalTransformationPipelines: distinctProcesses.size,
      regulatoryReportsMapped: distinctTargets.size,
      activeSourcesCount: distinctSources.size,
      complianceLevel:
        consulted.length > 0
          ? `${withUpstream} de ${consulted.length} tabelas do escopo com origem registrada na Data Lineage API`
          : 'Nenhuma tabela do escopo consultada',
    },
    nodes: [...nodes.values()],
    edges,
    pipelineDetails,
  };
}

module.exports = { buildLineageView };

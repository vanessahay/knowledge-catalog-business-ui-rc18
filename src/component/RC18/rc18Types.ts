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

/**
 * Tipos e formatadores compartilhados pelo painel RC 18
 * (Resolução Conjunta nº 18, de 28/11/2025).
 */

export interface Rc18Indicator {
  id: string;
  /** Descrição completa do que é medido (mostrada na gaveta de detalhes). */
  rotulo: string;
  /** Legenda curta para a face do cartão: "<numerador> de <denominador> <rotuloCurto>". */
  rotuloCurto?: string;
  valorPct: number | null;
  numerador: number;
  denominador: number;
  unidade: string;
  /** Tabelas do escopo em que o sinal não pôde ser lido (fora do numerador e do denominador). */
  naoVerificadas?: number;
}

export interface Rc18Evidence {
  rotulo: string;
  valor: string;
}

/** Recurso do Google Cloud com que a instituição produz a evidência de uma dimensão. */
export interface Rc18Medicao {
  recurso: string;
  acao: string;
}

export type Rc18Estado = 'medido' | 'sem_dados' | 'nao_medido';
export type Rc18Coleta = 'automatica' | 'parcial' | 'declaratoria';
export type Rc18Categoria = 'dados' | 'governanca';
export type Rc18Situacao =
  | 'com_falhas'
  | 'sem_falhas'
  | 'completo'
  | 'lacunas'
  | 'leitura_parcial'
  | 'informativo'
  | 'sem_dados'
  | 'nao_medido';

export interface Rc18Dimension {
  id: string;
  inciso: string;
  nome: string;
  categoria: Rc18Categoria;
  definicao: string;
  coleta: Rc18Coleta;
  estado: Rc18Estado;
  situacao: Rc18Situacao;
  indicadores: Rc18Indicator[];
  regras: {
    total: number;
    executadas: number;
    aprovadas: number;
    reprovadas: number;
    naoExecutadas: number;
    suspensas: number;
  };
  dqDimensions: string[];
  fontes: string[];
  comoEMedido: string | null;
  lacuna: string;
  porRegrasPersonalizadas?: boolean;
  medicao?: Rc18Medicao[];
  evidencias: Rc18Evidence[];
}

export type Rc18ResultKind = 'linhas' | 'agregada' | 'assercao' | null;

export interface Rc18Rule {
  ruleName: string;
  description: string | null;
  column: string;
  table: string;
  dataset?: string;
  tableKey: string;
  canonicalKey: string;
  entryName: string | null;
  scanId?: string | null;
  executed: boolean;
  passed: boolean | null;
  suspended: boolean;
  threshold: number | null;
  resultKind: Rc18ResultKind;
  evaluatedCount: number | null;
  passedCount: number | null;
  failedCount: number | null;
  passPercentage: number | null;
  assertionRowCount: number | null;
  dimension: string;
  dimensionId: string | null;
  dimensionName: string | null;
  ruleType?: string;
  failedRecordsQuery: string;
  executionTime?: string | null;
  daysSinceExecution?: number | null;
  isStale?: boolean;
}

export interface Rc18DimensionGroup {
  id: string;
  name: string;
  dqDimensions: string[];
  scorePct: number | null;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesFailed: number;
  rulesNotExecuted: number;
  rulesSuspended: number;
  rules: Rc18Rule[];
}

export interface Rc18TableDimensionScore {
  id: string;
  name: string;
  scorePct: number | null;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesFailed: number;
  rulesNotExecuted: number;
  rulesSuspended: number;
}

export interface Rc18TableSummary {
  canonicalKey: string;
  dataset: string;
  table: string;
  fullTableName: string;
  entryName: string | null;
  scanId: string | null;
  labels: Record<string, string>;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  notExecutedRules: number;
  suspendedRules: number;
  overallScore: number | null;
  dimensionScores: Rc18TableDimensionScore[];
  lastExecutionTime: string | null;
  daysSinceExecution: number | null;
  isStale: boolean;
  ignoredDuplicates: string[];
  status: 'Sem falhas' | 'Com falhas' | 'Sem execução';
}

export interface Rc18CatalogSummary {
  canonicalKey: string;
  tableKey: string;
  entryName: string | null;
  found: boolean | null;
  contactsCount: number | null;
  hasOverview: boolean | null;
  queries30d: number | null;
  glossaryTermLinks: number | null;
  glossaryTerms: string[] | null;
  glossaryLinksTruncated: boolean | null;
  hasUpstream: boolean | null;
  upstreamCount: number | null;
  /** `true` quando a Data Lineage API tinha mais elos além da primeira página (contagem parcial). */
  upstreamTruncated: boolean | null;
  columnsWithDescription: number | null;
  totalColumns: number | null;
  /** Mesma regra da contagem "Lacunas de governança" (contato, origem ou colunas sem descrição verificados). */
  lacunaGovernanca: boolean;
}

export interface Rc18Diagnostic {
  fonte: string;
  local: string;
  mensagem: string;
  codigo?: number | string | null;
}

export interface Rc18IgnoredDuplicate {
  canonicalKey: string;
  tableKey: string;
  scanId: string | null;
  scanName: string | null;
  location: string | null;
  executionTime: string | null;
  keptScanId: string | null;
}

export interface Rc18Scope {
  criterio: string;
  tabelas: string[];
  totalScansListados: number;
  scansDeQualidade: number;
  scansLidos: number;
  /** Scans selecionados (após o corte) que não puderam ser lidos em detalhe. */
  scansNaoLidos: number;
  /** `false` quando a listagem de DataScans não pôde ser lida (sem token ou falha na 1ª página). */
  listagemLida: boolean;
  /** Listagem lida e completa, sem corte e com todos os scans selecionados lidos em detalhe. */
  lidoPorInteiro: boolean;
  scansAtivos: number;
  scansDuplicadosIgnorados: Rc18IgnoredDuplicate[];
  truncado: boolean;
  limiteScans?: number;
}

export interface Rc18AvailableFilters {
  datasets: string[];
  labels: string[];
}

export interface Rc18NonConformitySummary {
  totalRegrasReprovadas: number;
  regrasSemMapeamentoReprovadas: number;
  tabelasComFalhas: number;
  scansDesatualizados: number;
  regrasSemExecucao: number;
  regrasSuspensas: number;
  lacunasGovernanca: number;
  /** Tabelas sem lacuna verificada em que algum sinal de governança não pôde ser lido. */
  governancaNaoVerificada: number;
}

export interface Rc18Norma {
  nome: string;
  emissores: string;
  ementa: string;
  dispositivoDimensoes: string;
  vigencia: string;
  prazoAdequacao: string;
  url: string;
  aviso: string;
}

export interface Rc18OverviewResponse {
  success: boolean;
  demo: boolean;
  projectId: string;
  location: string;
  filtrosAplicados: {
    dataset: string | null;
    label: string | null;
  };
  identityMode?: string;
  timestamp: string;
  norma: Rc18Norma;
  escopo: Rc18Scope;
  filtrosDisponiveis: Rc18AvailableFilters;
  /** `false` quando a listagem de DataScans falhou ou veio parcial: a lista de filtros pode estar incompleta. */
  filtrosCompletos: boolean;
  resumoNaoConformidades: Rc18NonConformitySummary;
  regrasSemMapeamento: { dqDimension: string; quantidade: number }[];
  dimensoes: Rc18Dimension[];
  dimensionGroups: Rc18DimensionGroup[];
  unmappedRules: Rc18Rule[];
  tableSummaries: Rc18TableSummary[];
  catalogByTable: Record<string, Rc18CatalogSummary>;
  diagnostics: Rc18Diagnostic[];
}

/** Paleta factual aderente ao KC Business UI (sem limiares arbitrários). */
export const SITUACAO_STYLE: Record<
  Rc18Situacao,
  { label: string; color: string; bg: string; dotShadow: string }
> = {
  com_falhas: {
    label: 'Com falhas',
    color: '#C5221F',
    bg: '#FCE8E6',
    dotShadow: '0px 0px 0px 2px #FCE8E6',
  },
  sem_falhas: {
    label: 'Sem falhas',
    color: '#128937',
    bg: '#E6F4EA',
    dotShadow: '0px 0px 0px 2px #E6F4EA',
  },
  completo: {
    label: 'Completo',
    color: '#128937',
    bg: '#E6F4EA',
    dotShadow: '0px 0px 0px 2px #E6F4EA',
  },
  lacunas: {
    label: 'Com lacunas',
    color: '#B06000',
    bg: '#FEF7E0',
    dotShadow: '0px 0px 0px 2px #FEF7E0',
  },
  leitura_parcial: {
    label: 'Leitura parcial',
    color: '#575757',
    bg: '#F1F3F4',
    dotShadow: '0px 0px 0px 2px #F1F3F4',
  },
  informativo: {
    label: 'Informativo',
    color: '#0B57D0',
    bg: '#E8F0FE',
    dotShadow: '0px 0px 0px 2px #E8F0FE',
  },
  sem_dados: {
    label: 'Sem dados',
    color: '#B06000',
    bg: '#FEF7E0',
    dotShadow: '0px 0px 0px 2px #FEF7E0',
  },
  nao_medido: {
    label: 'Não medido',
    color: '#575757',
    bg: '#F1F3F4',
    dotShadow: '0px 0px 0px 2px #F1F3F4',
  },
};

/** Percentual com até 2 casas; "—" quando não há valor (nunca assume 100%). */
export const formatPct = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Percentual de um indicador: "< 100%" quando o arredondamento esconderia uma lacuna real. */
export const formatIndicatorPct = (ind: Pick<Rc18Indicator, 'valorPct' | 'numerador' | 'denominador'>): string => {
  const formatted = formatPct(ind.valorPct);
  return formatted === '100%' && ind.numerador < ind.denominador ? '< 100%' : formatted;
};

/** Formata limiar (0..1) em percentual legível; "—" quando ausente. */
export const formatThreshold = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? '—'
    : `${(Math.round(value * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Contagem formatada; "—" quando a API não informou o valor. */
export const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value) ? '—' : value.toLocaleString('pt-BR');

/** Regras de uma tabela: aprovadas sobre executadas (mesma base do percentual), sem execução e suspensas. */
export const tableRulesText = (
  ts: Pick<Rc18TableSummary, 'passedRules' | 'totalRules' | 'notExecutedRules' | 'suspendedRules' | 'overallScore'>
): string => {
  const executed = ts.totalRules - ts.notExecutedRules;
  const parts = [
    executed > 0 ? `${ts.passedRules} / ${executed} aprovadas (${formatPct(ts.overallScore)})` : 'Nenhuma regra executada',
  ];
  if (ts.notExecutedRules > 0) parts.push(`${ts.notExecutedRules} sem execução`);
  if (ts.suspendedRules > 0) parts.push(`${ts.suspendedRules} suspensa(s)`);
  return parts.join(' · ');
};

type EscopoLeitura = Pick<Rc18Scope, 'listagemLida' | 'lidoPorInteiro' | 'scansDeQualidade' | 'scansLidos'>;

/** Nada do escopo foi lido: a listagem falhou ou havia DataScans e nenhum pôde ser lido em detalhe. */
export const scansSemLeitura = (escopo: EscopoLeitura): boolean =>
  escopo.listagemLida === false || (escopo.scansDeQualidade > 0 && escopo.scansLidos === 0);

/** Texto do escopo vazio: distingue listagem não lida, DataScans não lidos e "nenhum DataScan". */
export const escopoVazioTexto = (escopo: EscopoLeitura): string => {
  if (escopo.listagemLida === false) return 'A listagem de DataScans não pôde ser lida. Veja os diagnósticos.';
  if (scansSemLeitura(escopo)) {
    return `${escopo.scansDeQualidade} DataScan(s) de qualidade encontrado(s) no filtro atual, mas nenhum pôde ser lido. Veja os diagnósticos.`;
  }
  if (escopo.lidoPorInteiro === false && escopo.scansDeQualidade === 0) {
    return 'Nenhum DataScan encontrado na parte da listagem que pôde ser lida (listagem incompleta).';
  }
  return 'Nenhum DataScan de qualidade de dados encontrado para o filtro atual.';
};

/** Carimbo ISO completo (com hora) em DD/MM/AAAA HH:MM UTC; outros textos ficam como estão. */
export const formatEvidenceValue = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]} UTC` : value;
};

/** Resultado factual de uma regra em texto curto. */
export const ruleResultText = (rule: Rc18Rule): string => {
  if (rule.suspended) return 'Suspensa';
  if (rule.executed === false || rule.passed === null) return '—';
  if (rule.resultKind === 'assercao') {
    if (rule.assertionRowCount === null) return rule.passed ? 'Nenhuma linha em desacordo' : 'Reprovada';
    if (rule.assertionRowCount === 0) return 'Nenhuma linha em desacordo';
    return `${formatCount(rule.assertionRowCount)} ${rule.assertionRowCount === 1 ? 'linha' : 'linhas'} em desacordo`;
  }
  if (rule.resultKind === 'agregada') return rule.passed ? 'Condição atendida' : 'Condição não atendida';
  if (rule.resultKind === null) return rule.passed ? 'Aprovada' : 'Reprovada';
  if (rule.evaluatedCount === null || rule.passedCount === null) return '—';
  const rawPct = formatPct(rule.passPercentage);
  const pctLabel = rule.passedCount < rule.evaluatedCount && rawPct === '100%' ? '< 100%' : rawPct;
  return `${formatCount(rule.passedCount)} de ${formatCount(rule.evaluatedCount)} linhas (${pctLabel})`;
};

/** Data ISO (AAAA-MM-DD) em DD/MM/AAAA. */
export const formatIsoDate = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

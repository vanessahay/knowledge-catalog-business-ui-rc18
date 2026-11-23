/**
 * Tipos e formatadores compartilhados pelo painel RC 18
 * (Resolução Conjunta nº 18, de 28/11/2025 — art. 2º, § 2º).
 */

export interface Rc18Indicator {
  id: string;
  /** Descrição completa do que é medido (mostrada em "Ver detalhes"). */
  rotulo: string;
  /** Legenda curta para a face do cartão: "<numerador> de <denominador> <rotuloCurto>". */
  rotuloCurto?: string;
  valorPct: number | null;
  numerador: number;
  denominador: number;
  unidade: string;
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

export interface Rc18Dimension {
  id: string;
  inciso: string;
  nome: string;
  definicao: string;
  coleta: Rc18Coleta;
  estado: Rc18Estado;
  indicadores: Rc18Indicator[];
  regras: {
    total: number;
    executadas: number;
    aprovadas: number;
    reprovadas: number;
    naoExecutadas: number;
  };
  dqDimensions: string[];
  fontes: string[];
  comoEMedido: string | null;
  lacuna: string;
  /** Dimensão sem coletor próprio, medida só por regras marcadas com a dimensão personalizada. */
  porRegrasPersonalizadas?: boolean;
  medicao?: Rc18Medicao[];
  evidencias: Rc18Evidence[];
}

/**
 * Forma do resultado de uma regra de DataScan:
 *   'linhas'   -> a API devolve linhas avaliadas e aprovadas;
 *   'agregada' -> condição sobre a tabela inteira (só aprovada/reprovada);
 *   'assercao' -> consulta que lista o que está em desacordo (quantidade de linhas retornadas).
 */
export type Rc18ResultKind = 'linhas' | 'agregada' | 'assercao' | null;

export interface Rc18Rule {
  ruleName: string;
  description: string | null;
  column: string;
  table: string;
  dataset?: string;
  tableKey: string;
  scanId?: string | null;
  executed?: boolean;
  passed: boolean | null;
  resultKind: Rc18ResultKind;
  evaluatedCount: number | null;
  passedCount: number | null;
  failedCount: number | null;
  passPercentage: number | null;
  assertionRowCount: number | null;
  /** Dimensão do DataScan (como configurada na regra). */
  dimension: string;
  /** Dimensão da Resolução a que a regra foi atribuída; `null` quando não há correspondência. */
  dimensionId: string | null;
  dimensionName: string | null;
  inciso: string | null;
  ruleType?: string;
  executionTime?: string | null;
}

export interface Rc18DimensionGroup {
  id: string;
  inciso: string;
  name: string;
  group: string;
  dqDimensions: string[];
  scorePct: number | null;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesFailed: number;
  rulesNotExecuted: number;
  rules: Rc18Rule[];
}

export interface Rc18TableDimensionScore {
  id: string;
  inciso: string;
  name: string;
  scorePct: number | null;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesNotExecuted: number;
}

export interface Rc18TableSummary {
  dataset: string;
  table: string;
  fullTableName: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  notExecutedRules?: number;
  overallScore: number | null;
  dimensionScores: Rc18TableDimensionScore[];
  lastExecutionTime?: string | null;
  status: 'Sem falhas' | 'Com falhas' | 'Sem execução';
}

export interface Rc18Diagnostic {
  fonte: string;
  local: string;
  mensagem: string;
  codigo?: number | string | null;
}

export interface Rc18Scope {
  criterio: string;
  tabelas: string[];
  totalScansListados: number;
  scansDeQualidade: number;
  scansLidos: number;
  truncado: boolean;
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

export interface Rc18DimensionsReport {
  success: boolean;
  demo: boolean;
  projectId: string;
  location: string;
  identityMode?: string;
  timestamp: string;
  norma: Rc18Norma;
  escopo: Rc18Scope;
  dimensoes: Rc18Dimension[];
  resumo: { medidas: number; semDados: number; naoMedidas: number };
  regrasSemMapeamento: { dqDimension: string; quantidade: number }[];
  diagnostics: Rc18Diagnostic[];
}

/** Percentual com até 2 casas; "—" quando não há valor (nunca assume 100%). */
export const formatPct = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Contagem formatada; "—" quando a API não informou o valor. */
export const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value) ? '—' : value.toLocaleString('pt-BR');

/** Carimbo ISO completo (com hora) em DD/MM/AAAA HH:MM UTC; outros textos ficam como estão. */
export const formatEvidenceValue = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]} UTC` : value;
};

/**
 * Resultado de uma regra, em texto, só com o que a API devolve para a forma da regra.
 * Regra sem execução (ou de forma desconhecida e sem contagem) fica "—".
 */
export const ruleResultText = (rule: Rc18Rule): string => {
  if (rule.executed === false || rule.passed === null) return '—';
  if (rule.resultKind === 'assercao') {
    if (rule.assertionRowCount === null) return '—';
    if (rule.assertionRowCount === 0) return 'Nenhuma linha em desacordo';
    return `${formatCount(rule.assertionRowCount)} ${rule.assertionRowCount === 1 ? 'linha' : 'linhas'} em desacordo`;
  }
  if (rule.resultKind === 'agregada') return rule.passed ? 'Condição atendida' : 'Condição não atendida';
  if (rule.evaluatedCount === null || rule.passedCount === null) return '—';
  return `${formatCount(rule.passedCount)} de ${formatCount(rule.evaluatedCount)} linhas (${formatPct(rule.passPercentage)})`;
};

/** Data ISO (AAAA-MM-DD) em DD/MM/AAAA. */
export const formatIsoDate = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

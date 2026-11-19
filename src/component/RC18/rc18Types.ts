/**
 * Tipos e formatadores compartilhados pelo painel RC 18
 * (Resolução Conjunta nº 18, de 28/11/2025 — art. 2º, § 2º).
 */

export interface Rc18Indicator {
  id: string;
  rotulo: string;
  valorPct: number | null;
  numerador: number;
  denominador: number;
  unidade: string;
}

export interface Rc18Evidence {
  rotulo: string;
  valor: string;
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
  evidencias: Rc18Evidence[];
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

/** Data ISO (AAAA-MM-DD) em DD/MM/AAAA. */
export const formatIsoDate = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

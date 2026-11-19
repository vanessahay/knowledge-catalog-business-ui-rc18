import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RC18DimensionsOverview from './RC18DimensionsOverview';
import { type Rc18Dimension, type Rc18DimensionsReport, formatCount, formatEvidenceValue, formatPct } from './rc18Types';

const NOMES = [
  ['acessibilidade', 'I', 'Acessibilidade'],
  ['acuracia', 'II', 'Acurácia'],
  ['adaptabilidade', 'III', 'Adaptabilidade'],
  ['clareza', 'IV', 'Clareza'],
  ['comparabilidade', 'V', 'Comparabilidade'],
  ['completude', 'VI', 'Completude'],
  ['confiabilidade', 'VII', 'Confiabilidade'],
  ['consistencia', 'VIII', 'Consistência'],
  ['integridade', 'IX', 'Integridade'],
  ['rastreabilidade', 'X', 'Rastreabilidade'],
  ['relevancia', 'XI', 'Relevância'],
  ['tempestividade', 'XII', 'Tempestividade'],
] as const;

const baseDimension = (id: string, inciso: string, nome: string): Rc18Dimension => ({
  id,
  inciso,
  nome,
  definicao: `definição de ${nome}`,
  coleta: 'declaratoria',
  estado: 'nao_medido',
  indicadores: [],
  regras: { total: 0, executadas: 0, aprovadas: 0, reprovadas: 0, naoExecutadas: 0 },
  dqDimensions: [id.toUpperCase()],
  fontes: [],
  comoEMedido: null,
  lacuna: `Sem coleta automática para ${nome}.`,
  evidencias: [],
});

const buildReport = (overrides: Partial<Record<string, Partial<Rc18Dimension>>> = {}): Rc18DimensionsReport => {
  const dimensoes = NOMES.map(([id, inciso, nome]) => ({ ...baseDimension(id, inciso, nome), ...(overrides[id] ?? {}) }));
  return {
    success: true,
    demo: false,
    projectId: 'projeto-exemplo',
    location: 'global',
    identityMode: 'user',
    timestamp: '2026-01-15T08:03:36.000Z',
    norma: {
      nome: 'Resolução Conjunta nº 18, de 28 de novembro de 2025',
      emissores: 'Banco Central do Brasil e Conselho Monetário Nacional',
      ementa: 'ementa',
      dispositivoDimensoes: 'art. 2º, § 2º, incisos I a XII',
      vigencia: '2026-01-01',
      prazoAdequacao: '2026-12-31',
      url: 'https://www.bcb.gov.br/',
      aviso: 'O painel não atesta conformidade regulatória.',
    },
    escopo: {
      criterio: 'Tabelas com DataScan de qualidade de dados',
      tabelas: ['ds.tabela_a', 'ds.tabela_b'],
      totalScansListados: 10,
      scansDeQualidade: 2,
      scansLidos: 2,
      truncado: false,
    },
    dimensoes,
    resumo: {
      medidas: dimensoes.filter((d) => d.estado === 'medido').length,
      semDados: dimensoes.filter((d) => d.estado === 'sem_dados').length,
      naoMedidas: dimensoes.filter((d) => d.estado === 'nao_medido').length,
    },
    regrasSemMapeamento: [],
    diagnostics: [],
  };
};

describe('RC18DimensionsOverview', () => {
  it('mostra as 12 dimensões com o inciso correspondente', () => {
    render(<RC18DimensionsOverview report={buildReport()} />);
    for (const [id, inciso, nome] of NOMES) {
      const card = screen.getByTestId(`rc18-dimensao-${id}`);
      expect(within(card).getByRole('heading', { name: nome })).toBeInTheDocument();
      expect(within(card).getByText(`Inciso ${inciso}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
  });

  it('dimensão sem coleta não exibe percentual algum', () => {
    render(<RC18DimensionsOverview report={buildReport()} />);
    const card = screen.getByTestId('rc18-dimensao-confiabilidade');
    expect(within(card).getByText('Não medido automaticamente')).toBeInTheDocument();
    expect(within(card).getByText('Sem coleta automática para Confiabilidade.')).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
  });

  it('dimensão medida exibe o indicador com numerador e denominador', () => {
    const report = buildReport({
      acuracia: {
        coleta: 'automatica',
        estado: 'medido',
        indicadores: [
          { id: 'regras_dq', rotulo: 'Regras aprovadas', valorPct: 92.65, numerador: 63, denominador: 68, unidade: 'regras' },
        ],
        regras: { total: 70, executadas: 68, aprovadas: 63, reprovadas: 5, naoExecutadas: 2 },
      },
    });
    render(<RC18DimensionsOverview report={report} />);
    const card = screen.getByTestId('rc18-dimensao-acuracia');
    expect(within(card).getByText('92,65%')).toBeInTheDocument();
    expect(within(card).getByText('63 de 68 regras — Regras aprovadas')).toBeInTheDocument();
    expect(within(card).getByText('2 regra(s) configurada(s) sem execução — fora do cálculo.')).toBeInTheDocument();
    expect(within(card).getByText('Medido')).toBeInTheDocument();
  });

  it('avisa quando não há escopo e não atesta conformidade', () => {
    const report = buildReport();
    report.escopo.tabelas = [];
    render(<RC18DimensionsOverview report={report} />);
    expect(screen.getByText(/Nenhum DataScan de qualidade de dados foi encontrado/)).toBeInTheDocument();
    expect(screen.getByText(/não atesta conformidade regulatória/)).toBeInTheDocument();
    expect(screen.getByText(/31\/12\/2026/)).toBeInTheDocument();
  });

  it('formatadores não presumem valores', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
    expect(formatPct(100)).toBe('100%');
    expect(formatCount(null)).toBe('—');
    expect(formatCount(1234)).toBe('1.234');
    expect(formatEvidenceValue('2026-01-15T08:03:36.000Z')).toBe('15/01/2026 08:03 UTC');
    expect(formatEvidenceValue('3 de 4')).toBe('3 de 4');
  });
});

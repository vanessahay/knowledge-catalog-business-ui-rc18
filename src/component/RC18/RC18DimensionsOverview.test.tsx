import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RC18DimensionsOverview from './RC18DimensionsOverview';
import {
  type Rc18Dimension,
  type Rc18DimensionsReport,
  type Rc18Rule,
  formatCount,
  formatEvidenceValue,
  formatPct,
  ruleResultText,
} from './rc18Types';

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
  medicao: [{ recurso: `Recurso de ${nome}`, acao: `Como medir ${nome}.` }],
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
    expect(within(card).getByText('Não medido automaticamente')).toBeVisible();
    expect(within(card).getByText('Sem indicador')).toBeVisible();
    expect(within(card).queryByText(/%/)).toBeNull();
    // Não há atalho para regras; o motivo e a orientação de como medir ficam nos detalhes.
    expect(within(card).queryByRole('button', { name: /Ver regras/ })).toBeNull();
    const detalhes = within(card).getByTestId('rc18-detalhes-confiabilidade') as HTMLDetailsElement;
    expect(detalhes.open).toBe(false);
    const motivo = within(detalhes).getByText(/Sem coleta automática para Confiabilidade\./);
    expect(motivo).not.toBeVisible();
    expect(within(detalhes).getByText('Recurso de Confiabilidade:')).not.toBeVisible();
    detalhes.open = true;
    expect(within(detalhes).getByText('Por que não há indicador')).toBeVisible();
    expect(motivo).toBeVisible();
    expect(motivo).toHaveTextContent('marque regras de DataScan com a dimensão personalizada CONFIABILIDADE.');
    expect(within(detalhes).getByText('Recurso de Confiabilidade:')).toBeVisible();
    expect(within(detalhes).getByText(/Como medir Confiabilidade\./)).toBeVisible();
  });

  it('a tela não reproduz o texto da Resolução nem cita artigos', () => {
    render(<RC18DimensionsOverview report={buildReport()} />);
    const texto = document.body.textContent ?? '';
    // `definicao` e `dispositivoDimensoes` continuam na resposta da API, mas não são exibidos.
    expect(texto).not.toContain('definição de');
    expect(texto).not.toMatch(/\bart\.\s*\d|§/i);
    expect(screen.getByRole('link', { name: 'Texto do normativo' })).toHaveAttribute('href', 'https://www.bcb.gov.br/');
  });

  it('dimensão medida exibe o indicador com numerador e denominador', () => {
    const report = buildReport({
      acuracia: {
        coleta: 'automatica',
        estado: 'medido',
        indicadores: [
          {
            id: 'regras_dq',
            rotulo: 'Regras aprovadas na última execução',
            rotuloCurto: 'regras aprovadas',
            valorPct: 92.65,
            numerador: 63,
            denominador: 68,
            unidade: 'regras',
          },
        ],
        regras: { total: 70, executadas: 68, aprovadas: 63, reprovadas: 5, naoExecutadas: 2 },
        fontes: ['Dataplex DataScan'],
        evidencias: [
          { rotulo: 'Regras: execução mais recente', valor: '2026-01-15T08:03:36.000Z' },
          { rotulo: 'Item 2', valor: 'b' },
          { rotulo: 'Item 3', valor: 'c' },
          { rotulo: 'Item 4', valor: 'd' },
        ],
      },
    });
    render(<RC18DimensionsOverview report={report} />);
    const card = screen.getByTestId('rc18-dimensao-acuracia');
    // À vista: situação, percentual e a legenda curta (com as regras fora do cálculo).
    expect(within(card).getByText('Medido')).toBeVisible();
    expect(within(card).getByText('92,65%')).toBeVisible();
    expect(within(card).getByText('63 de 68 regras aprovadas · 2 sem execução')).toBeVisible();

    // Em "Ver detalhes", fechado por padrão: o que é medido, coleta, limite, evidências e como medir.
    const detalhes = within(card).getByTestId('rc18-detalhes-acuracia') as HTMLDetailsElement;
    expect(detalhes.open).toBe(false);
    expect(within(detalhes).getByText('Ver detalhes')).toBeInTheDocument();
    const limite = within(detalhes).getByText('Sem coleta automática para Acurácia.');
    expect(limite).not.toBeVisible();
    detalhes.open = true;
    for (const rotulo of ['O que é medido', 'Coleta', 'Limite do indicador', 'Evidências', 'Dimensões de DataScan agregadas', 'Como medir no Google Cloud']) {
      expect(within(detalhes).getByText(rotulo)).toBeVisible();
    }
    expect(limite).toBeVisible();
    expect(within(detalhes).getByText('Regras aprovadas na última execução')).toBeVisible();
    expect(within(detalhes).getByText('2 regra(s) configurada(s) sem execução — fora do cálculo.')).toBeVisible();
    expect(within(detalhes).getByText('Regras de qualidade (DataScans) • Dataplex DataScan')).toBeVisible();
    expect(within(detalhes).getByText('Regras: execução mais recente: 15/01/2026 08:03 UTC')).toBeVisible();
    expect(within(detalhes).getByText('e mais 1 item(ns).')).toBeVisible();
    expect(within(detalhes).getByText('ACURACIA')).toBeVisible();
    expect(within(detalhes).getByText('Recurso de Acurácia:')).toBeVisible();
    expect(within(detalhes).queryByText('Por que não há indicador')).toBeNull();
  });

  it('indicador sem legenda curta usa a unidade e a descrição completa', () => {
    const report = buildReport({
      clareza: {
        coleta: 'parcial',
        estado: 'medido',
        indicadores: [{ id: 'colunas_descritas', rotulo: 'Colunas com descrição', valorPct: 60, numerador: 1200, denominador: 2000, unidade: 'colunas' }],
      },
    });
    render(<RC18DimensionsOverview report={report} />);
    expect(within(screen.getByTestId('rc18-dimensao-clareza')).getByText('1.200 de 2.000 colunas — Colunas com descrição')).toBeVisible();
  });

  it('regras configuradas e nunca executadas: sem percentual, com o atalho para as regras', () => {
    const onShowRules = vi.fn();
    const report = buildReport({
      adaptabilidade: { regras: { total: 2, executadas: 0, aprovadas: 0, reprovadas: 0, naoExecutadas: 2 } },
    });
    render(<RC18DimensionsOverview report={report} onShowRules={onShowRules} />);
    const card = screen.getByTestId('rc18-dimensao-adaptabilidade');
    expect(within(card).getByText('Sem indicador')).toBeVisible();
    expect(within(card).getByText('2 regra(s) sem execução')).toBeVisible();
    expect(within(card).queryByText(/%/)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Ver regras de Adaptabilidade' }));
    expect(onShowRules).toHaveBeenCalledWith('adaptabilidade');
  });

  it('dimensão com regras oferece o atalho para a lista de regras', () => {
    const onShowRules = vi.fn();
    const report = buildReport({
      integridade: {
        estado: 'medido',
        porRegrasPersonalizadas: true,
        indicadores: [{ id: 'regras_dq', rotulo: 'Regras aprovadas', valorPct: 33.33, numerador: 1, denominador: 3, unidade: 'regras' }],
        regras: { total: 3, executadas: 3, aprovadas: 1, reprovadas: 2, naoExecutadas: 0 },
      },
    });
    render(<RC18DimensionsOverview report={report} onShowRules={onShowRules} />);
    const card = screen.getByTestId('rc18-dimensao-integridade');
    const atalho = within(card).getByRole('button', { name: 'Ver regras de Integridade' });
    expect(atalho).toHaveTextContent('Ver regras');
    fireEvent.click(atalho);
    expect(onShowRules).toHaveBeenCalledWith('integridade');
    // Dimensão medida só por regras personalizadas: a coleta informada nos detalhes é essa.
    expect(within(card).getByText('Regras de DataScan marcadas com a dimensão personalizada')).toBeInTheDocument();
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

  it('resultado da regra: só o que a API devolve para cada forma de regra', () => {
    const rule = (overrides: Partial<Rc18Rule>): Rc18Rule => ({
      ruleName: 'regra',
      description: null,
      column: '—',
      table: 't',
      tableKey: 'd.t',
      executed: true,
      passed: true,
      resultKind: 'linhas',
      evaluatedCount: null,
      passedCount: null,
      failedCount: null,
      passPercentage: null,
      assertionRowCount: null,
      dimension: 'VALIDITY',
      dimensionId: 'acuracia',
      dimensionName: 'Acurácia',
      inciso: 'II',
      ...overrides,
    });
    expect(ruleResultText(rule({ evaluatedCount: 600, passedCount: 599, passPercentage: 99.83, passed: false }))).toBe('599 de 600 linhas (99,83%)');
    expect(ruleResultText(rule({ resultKind: 'assercao', assertionRowCount: 0 }))).toBe('Nenhuma linha em desacordo');
    expect(ruleResultText(rule({ resultKind: 'assercao', assertionRowCount: 1, passed: false }))).toBe('1 linha em desacordo');
    expect(ruleResultText(rule({ resultKind: 'assercao', assertionRowCount: 12, passed: false }))).toBe('12 linhas em desacordo');
    expect(ruleResultText(rule({ resultKind: 'agregada' }))).toBe('Condição atendida');
    expect(ruleResultText(rule({ resultKind: 'agregada', passed: false }))).toBe('Condição não atendida');
    // Sem execução, sem contagem ou forma desconhecida: nada é presumido.
    expect(ruleResultText(rule({ executed: false, passed: null }))).toBe('—');
    expect(ruleResultText(rule({ resultKind: 'assercao', assertionRowCount: null, passed: false }))).toBe('—');
    expect(ruleResultText(rule({ resultKind: null }))).toBe('—');
  });
});

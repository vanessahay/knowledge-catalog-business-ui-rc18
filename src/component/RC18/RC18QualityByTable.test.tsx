import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RC18QualityByTable, { SEM_CORRESPONDENCIA } from './RC18QualityByTable';
import { type Rc18DimensionGroup, type Rc18Rule, type Rc18TableSummary } from './rc18Types';

vi.setConfig({ testTimeout: 20000 });

const rule = (overrides: Partial<Rc18Rule>): Rc18Rule => ({
  ruleName: 'regra',
  description: null,
  column: '—',
  table: 'posicao',
  tableKey: 'ds.posicao',
  scanId: 'scan-1',
  executed: true,
  passed: true,
  resultKind: 'assercao',
  evaluatedCount: null,
  passedCount: null,
  failedCount: null,
  passPercentage: null,
  assertionRowCount: 0,
  dimension: 'ADAPTABILIDADE',
  dimensionId: 'adaptabilidade',
  dimensionName: 'Adaptabilidade',
  inciso: 'III',
  ruleType: 'Asserção SQL',
  executionTime: '2026-01-15T08:03:36.000Z',
  ...overrides,
});

const group: Rc18DimensionGroup = {
  id: 'adaptabilidade',
  inciso: 'III',
  name: 'Adaptabilidade',
  group: 'art. 2º, § 2º, III',
  dqDimensions: ['ADAPTABILIDADE'],
  scorePct: 50,
  rulesEvaluated: 2,
  rulesPassed: 1,
  rulesFailed: 1,
  rulesNotExecuted: 0,
  rules: [
    rule({ ruleName: 'teste-demanda-nao-periodica', description: 'Há teste bem-sucedido nos últimos 180 dias.' }),
    rule({ ruleName: 'teste-contingencia', passed: false, assertionRowCount: 1, tableKey: 'ds.outra', table: 'outra' }),
  ],
};

const unmapped = [rule({ ruleName: 'regra-da-casa', dimension: 'MINHA_DIMENSAO', dimensionId: null, dimensionName: null, inciso: null })];

const table = (fullTableName: string): Rc18TableSummary => ({
  dataset: 'ds',
  table: fullTableName.split('.')[1],
  fullTableName,
  totalRules: 2,
  passedRules: 1,
  failedRules: 1,
  notExecutedRules: 0,
  overallScore: 50,
  dimensionScores: [{ id: 'adaptabilidade', inciso: 'III', name: 'Adaptabilidade', scorePct: 50, rulesEvaluated: 2, rulesPassed: 1, rulesNotExecuted: 0 }],
  lastExecutionTime: '2026-01-15T08:03:36.000Z',
  status: 'Com falhas',
});

const tables = [table('ds.posicao'), table('ds.outra')];

describe('RC18QualityByTable', () => {
  it('sem tabelas no escopo: só o aviso', () => {
    render(<RC18QualityByTable groups={[]} unmappedRules={[]} tables={[]} dimensionFilter="" onDimensionFilterChange={() => {}} />);
    expect(screen.getByText(/Nenhum DataScan de qualidade de dados encontrado/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('abre na lista de tabelas; o cartão da dimensão pede o filtro e mostra as regras', () => {
    const onChange = vi.fn();
    render(<RC18QualityByTable groups={[group]} unmappedRules={unmapped} tables={tables} dimensionFilter="" onDimensionFilterChange={onChange} />);
    const tabelas = screen.getByTitle('Tabelas com regras de qualidade');
    expect(within(tabelas).getByText('ds.posicao')).toBeInTheDocument();
    expect(within(tabelas).getAllByText('III 50%')).toHaveLength(2);
    expect(within(tabelas).getAllByText('15/01/2026 08:03 UTC')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Ver regras de Adaptabilidade' }));
    expect(onChange).toHaveBeenCalledWith('adaptabilidade');
    // Sem filtro aplicado pelo componente pai, a lista traz todas as regras, inclusive a sem correspondência.
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('3 de 3 regras');
    const regras = screen.getByTitle('Regras de qualidade');
    const semCorrespondencia = within(regras).getByText('regra-da-casa').closest('tr') as HTMLElement;
    expect(within(semCorrespondencia).getByText('Sem correspondência')).toBeInTheDocument();
    expect(within(semCorrespondencia).getByText('MINHA_DIMENSAO')).toBeInTheDocument();
    expect(screen.getByText(/1 regra\(s\) usam uma dimensão de DataScan sem correspondência/)).toBeInTheDocument();
  });

  it('com a dimensão já escolhida: abre nas regras filtradas, com descrição e resultado', () => {
    render(<RC18QualityByTable groups={[group]} unmappedRules={unmapped} tables={tables} dimensionFilter="adaptabilidade" onDimensionFilterChange={() => {}} />);
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('2 de 3 regras');
    const regras = screen.getByTitle('Regras de qualidade');
    expect(within(regras).queryByText('regra-da-casa')).toBeNull();
    const aprovada = within(regras).getByText('teste-demanda-nao-periodica').closest('tr') as HTMLElement;
    expect(within(aprovada).getByText('Há teste bem-sucedido nos últimos 180 dias.')).toBeInTheDocument();
    expect(within(aprovada).getByText('Nenhuma linha em desacordo')).toBeInTheDocument();
    expect(within(aprovada).getByText('Aprovada')).toBeInTheDocument();
    const reprovada = within(regras).getByText('teste-contingencia').closest('tr') as HTMLElement;
    expect(within(reprovada).getByText('1 linha em desacordo')).toBeInTheDocument();
    expect(within(reprovada).getByText('Reprovada')).toBeInTheDocument();
  });

  it('filtro "sem correspondência" mostra só as regras fora das dimensões da Resolução', () => {
    render(<RC18QualityByTable groups={[group]} unmappedRules={unmapped} tables={tables} dimensionFilter={SEM_CORRESPONDENCIA} onDimensionFilterChange={() => {}} />);
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('1 de 3 regras');
    const regras = screen.getByTitle('Regras de qualidade');
    expect(within(regras).getByText('regra-da-casa')).toBeInTheDocument();
    expect(within(regras).queryByText('teste-contingencia')).toBeNull();
  });
});

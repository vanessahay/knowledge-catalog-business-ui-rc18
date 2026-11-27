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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RC18QualityByTable from './RC18QualityByTable';
import respostas from './__fixtures__/rc18-respostas.json';
import { ruleResultText, tableRulesText, type Rc18OverviewResponse, type Rc18Rule } from './rc18Types';

vi.setConfig({ testTimeout: 20000 });

const demoOverview = respostas.demo as unknown as Rc18OverviewResponse;

describe('RC18QualityByTable', () => {
  it('ordena regras reprovadas primeiro, exibe limiar e permite copiar ou expandir SQL de reprovados', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={demoOverview.catalogByTable}
        isDemo={false}
        subView="regras"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
        onOpenEntry={vi.fn()}
      />
    );

    const rows = screen.getAllByRole('row');
    // Primeira linha de dados após o cabeçalho deve ser a regra reprovada com mais linhas afetadas (email-formato: 1.070 falhas)
    expect(rows[1].textContent).toContain('email-formato');
    expect(rows[1].textContent).toContain('Limiar 99%');
    expect(rows[1].textContent).toContain('Reprovada');
    expect(document.body.textContent ?? '').not.toMatch(/\bInciso\b|\bart\.\s*\d|§/i);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar SQL da regra email-formato' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('REGEXP_CONTAINS');

    fireEvent.click(screen.getByRole('button', { name: 'Ver SQL da regra email-formato' }));
    expect(screen.getByTestId('rc18-sql-email-formato')).toBeVisible();
  });

  it('filtra somente reprovadas e abre bloco SQL como fallback quando clipboard falha', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={demoOverview.catalogByTable}
        isDemo={false}
        subView="regras"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="reprovadas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('Exibindo 3 de');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar SQL da regra email-formato' }));
    expect(await screen.findByTestId('rc18-sql-email-formato')).toBeVisible();
  });

  it('dispara onOpenEntry apenas fora do modo demo quando entryName existe e exibe governança nula como traço', () => {
    const onOpenEntry = vi.fn();
    const catalogWithNull = {
      ...demoOverview.catalogByTable,
      [demoOverview.tableSummaries[0].canonicalKey]: {
        ...demoOverview.catalogByTable[demoOverview.tableSummaries[0].canonicalKey],
        contactsCount: null,
        hasUpstream: null,
      },
    };

    const { rerender } = render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={catalogWithNull}
        isDemo={false}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
        onOpenEntry={onOpenEntry}
      />
    );

    const tableBtn = screen.getByRole('button', { name: demoOverview.tableSummaries[0].fullTableName });
    fireEvent.click(tableBtn);
    expect(onOpenEntry).toHaveBeenCalledWith(demoOverview.tableSummaries[0].entryName);
    expect(screen.getByText('Contatos: —')).toBeVisible();
    expect(screen.getByText('Linhagem: —')).toBeVisible();

    // A etiqueta Linhagem abre direto a aba nativa Lineage do Business UI
    const row = tableBtn.closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Linhagem/ }));
    expect(onOpenEntry).toHaveBeenLastCalledWith(demoOverview.tableSummaries[0].entryName, 'lineage');

    // No modo demo o nome da tabela não vira link de navegação para o catálogo real
    rerender(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={catalogWithNull}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
        onOpenEntry={onOpenEntry}
      />
    );
    expect(screen.queryByRole('button', { name: demoOverview.tableSummaries[0].fullTableName })).toBeNull();
    expect(screen.queryByRole('button', { name: /Linhagem/ })).toBeNull();
  });

  it('filtra tabelas desatualizadas (>30d) na sub-aba Tabelas', () => {
    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={demoOverview.catalogByTable}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="desatualizados"
        onTableStatusFilterChange={vi.fn()}
      />
    );

    expect(screen.getByText('fin_demo_cartoes.transacao_cartao')).toBeVisible();
    expect(screen.queryByText('fin_demo_cadastro.dados_cadastrais')).toBeNull();
  });

  it('exibe "< 100%" quando há linhas reprovadas mesmo se o percentual arredondar para 100%', () => {
    const sampleRule = demoOverview.dimensionGroups[0].rules[0];
    const almostPerfectFail: Rc18Rule = {
      ...sampleRule,
      executed: true,
      passed: false,
      suspended: false,
      resultKind: 'linhas',
      evaluatedCount: 85543324,
      passedCount: 85543294,
      failedCount: 30,
      passPercentage: 100,
    };
    expect(ruleResultText(almostPerfectFail)).toContain('(< 100%)');
    expect(ruleResultText(almostPerfectFail)).not.toContain('(100%)');
  });

  it('filtra tabelas com lacunas de governança pelo marcador calculado no backend', () => {
    const [primeira, ...demais] = demoOverview.tableSummaries;
    const catalogo = JSON.parse(JSON.stringify(demoOverview.catalogByTable)) as typeof demoOverview.catalogByTable;
    catalogo[primeira.canonicalKey].lacunaGovernanca = false;

    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={demoOverview.tableSummaries}
        catalogByTable={catalogo}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="lacunas_governanca"
        onTableStatusFilterChange={vi.fn()}
      />
    );

    expect(screen.queryByText(primeira.fullTableName)).toBeNull();
    const esperadas = demais.filter((t) => catalogo[t.canonicalKey].lacunaGovernanca);
    expect(esperadas.length).toBeGreaterThan(0);
    for (const t of esperadas) expect(screen.getByText(t.fullTableName)).toBeVisible();
  });

  it('resume as regras da tabela sobre as executadas, como o percentual, com sem execução e suspensas', () => {
    expect(
      tableRulesText({ passedRules: 2, totalRules: 3, notExecutedRules: 1, suspendedRules: 1, overallScore: 100 })
    ).toBe('2 / 2 aprovadas (100%) · 1 sem execução · 1 suspensa(s)');
    expect(
      tableRulesText({ passedRules: 0, totalRules: 2, notExecutedRules: 2, suspendedRules: 0, overallScore: null })
    ).toBe('Nenhuma regra executada · 2 sem execução');

    const [primeira] = demoOverview.tableSummaries;
    const tabela = {
      ...primeira,
      totalRules: 3,
      passedRules: 2,
      failedRules: 0,
      notExecutedRules: 1,
      suspendedRules: 1,
      overallScore: 100,
    };
    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={[tabela]}
        catalogByTable={demoOverview.catalogByTable}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
      />
    );
    expect(screen.getByText('2 / 2 aprovadas (100%) · 1 sem execução · 1 suspensa(s)')).toBeVisible();
  });

  it('marca os contadores de glossário e de linhagem como parciais quando a lista foi cortada', () => {
    const [primeira] = demoOverview.tableSummaries;
    const catalogo = JSON.parse(JSON.stringify(demoOverview.catalogByTable)) as typeof demoOverview.catalogByTable;
    catalogo[primeira.canonicalKey].glossaryTermLinks = 50;
    catalogo[primeira.canonicalKey].glossaryLinksTruncated = true;
    catalogo[primeira.canonicalKey].hasUpstream = true;
    catalogo[primeira.canonicalKey].upstreamCount = 2;
    catalogo[primeira.canonicalKey].upstreamTruncated = true;

    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={[primeira]}
        catalogByTable={catalogo}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Glossário: 50+ vínculo(s)')).toBeInTheDocument();
    expect(screen.getByLabelText('Linhagem: 2+ origem(ns)')).toBeInTheDocument();
  });

  it('mostra o texto de escopo vazio recebido do painel', () => {
    render(
      <RC18QualityByTable
        groups={[]}
        unmappedRules={[]}
        tables={[]}
        catalogByTable={{}}
        subView="regras"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
        emptyText="3 DataScan(s) de qualidade encontrado(s) no filtro atual, mas nenhum pôde ser lido. Veja os diagnósticos."
      />
    );
    expect(screen.getByText(/mas nenhum pôde ser lido/)).toBeVisible();
  });

  it('mostra "sem entrada no catálogo" quando a tabela não existe no Knowledge Catalog (404)', () => {
    const [primeira] = demoOverview.tableSummaries;
    const catalogo = JSON.parse(JSON.stringify(demoOverview.catalogByTable)) as typeof demoOverview.catalogByTable;
    catalogo[primeira.canonicalKey] = {
      ...catalogo[primeira.canonicalKey],
      found: false,
      entryName: null,
      contactsCount: 0,
      glossaryTermLinks: 0,
      glossaryTerms: [],
      glossaryLinksTruncated: false,
    };

    render(
      <RC18QualityByTable
        groups={demoOverview.dimensionGroups}
        unmappedRules={demoOverview.unmappedRules}
        tables={[primeira]}
        catalogByTable={catalogo}
        isDemo={true}
        subView="tabelas"
        onSubViewChange={vi.fn()}
        dimensionFilter=""
        onDimensionFilterChange={vi.fn()}
        statusFilter="todas"
        onStatusFilterChange={vi.fn()}
        tableStatusFilter="todas"
        onTableStatusFilterChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Contatos: sem entrada no catálogo')).toBeInTheDocument();
    expect(screen.getByLabelText('Glossário: sem entrada no catálogo')).toBeInTheDocument();
  });
});

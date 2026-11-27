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
import { render, screen, within, fireEvent } from '@testing-library/react';
import RC18DimensionsOverview from './RC18DimensionsOverview';
import respostas from './__fixtures__/rc18-respostas.json';
import type { Rc18OverviewResponse } from './rc18Types';

vi.setConfig({ testTimeout: 20000 });

const demoOverview = respostas.demo as unknown as Rc18OverviewResponse;
const vazioOverview = respostas.vazio as unknown as Rc18OverviewResponse;
const erroOverview = respostas.erroApi as unknown as Rc18OverviewResponse;

const CITACAO_PROIBIDA = /\bart\.\s*\d|§|\bInciso\b/i;

const renderOverview = (overview: Rc18OverviewResponse, handlers: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) =>
  render(
    <RC18DimensionsOverview
      overview={overview}
      onShowDimensionRules={handlers.onShowDimensionRules ?? vi.fn()}
      onJumpToFailedRules={handlers.onJumpToFailedRules ?? vi.fn()}
      onJumpToFailedTables={handlers.onJumpToFailedTables ?? vi.fn()}
      onJumpToStaleTables={handlers.onJumpToStaleTables ?? vi.fn()}
      onJumpToGovernanceGaps={handlers.onJumpToGovernanceGaps ?? vi.fn()}
    />
  );

describe('RC18DimensionsOverview', () => {
  it('separa Qualidade dos dados (8) e Governança no catálogo (4), sem Inciso nem texto normativo', () => {
    renderOverview(demoOverview);

    const dados = screen.getByTestId('rc18-dimensoes-dados');
    const governanca = screen.getByTestId('rc18-dimensoes-governanca');
    expect(within(dados).getAllByRole('heading', { level: 3 })).toHaveLength(8);
    expect(within(governanca).getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(document.body.textContent ?? '').not.toMatch(CITACAO_PROIBIDA);
  });

  it('aciona os 4 KPIs da faixa de não conformidades com os destinos corretos', () => {
    const onJumpToFailedRules = vi.fn();
    const onJumpToFailedTables = vi.fn();
    const onJumpToStaleTables = vi.fn();
    const onJumpToGovernanceGaps = vi.fn();
    renderOverview(demoOverview, { onJumpToFailedRules, onJumpToFailedTables, onJumpToStaleTables, onJumpToGovernanceGaps });

    fireEvent.click(screen.getByTestId('rc18-kpi-regras-reprovadas'));
    expect(onJumpToFailedRules).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('rc18-kpi-tabelas-afetadas'));
    expect(onJumpToFailedTables).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('rc18-kpi-scans-desatualizados'));
    expect(onJumpToStaleTables).toHaveBeenCalledTimes(1);

    const lacunas = screen.getByTestId('rc18-kpi-lacunas-governanca');
    expect(lacunas).toHaveTextContent('Tabelas sem contato, sem origem ou com colunas sem descrição');
    fireEvent.click(lacunas);
    expect(onJumpToGovernanceGaps).toHaveBeenCalledTimes(1);
  });

  it('mostra "Ver falhas" em dimensões reprovadas e "Ver regras" em Comparabilidade sem falhas mesmo com glossário <100%', () => {
    const onShowDimensionRules = vi.fn();
    renderOverview(demoOverview, { onShowDimensionRules });

    const acuracia = screen.getByTestId('rc18-dimensao-acuracia');
    fireEvent.click(within(acuracia).getByRole('button', { name: /Ver falhas de Acurácia/ }));
    expect(onShowDimensionRules).toHaveBeenCalledWith('acuracia', true);

    const comparabilidade = screen.getByTestId('rc18-dimensao-comparabilidade');
    expect(within(comparabilidade).queryByRole('button', { name: /Ver falhas/ })).toBeNull();
    fireEvent.click(within(comparabilidade).getByRole('button', { name: /Ver regras de Comparabilidade/ }));
    expect(onShowDimensionRules).toHaveBeenCalledWith('comparabilidade', false);
  });

  it('abre e fecha a gaveta lateral de detalhes (diálogo com nome acessível) com fontes, lacuna e como medir no Google Cloud', () => {
    const onShowDimensionRules = vi.fn();
    renderOverview(demoOverview, { onShowDimensionRules });

    const confiabilidade = screen.getByTestId('rc18-dimensao-confiabilidade');
    fireEvent.click(within(confiabilidade).getByRole('button', { name: /Detalhes de Confiabilidade/ }));

    const drawer = screen.getByRole('dialog', { name: 'Confiabilidade' });
    expect(within(drawer).getByText(/Como medir no Google Cloud/i)).toBeVisible();
    expect(within(drawer).getByText('CONFIABILIDADE')).toBeVisible();

    fireEvent.click(within(drawer).getByRole('button', { name: /Ver 1 falha/i }));
    expect(onShowDimensionRules).toHaveBeenCalledWith('confiabilidade', true);
  });

  it('gaveta com regras só suspensas não pede para "marcar regras" e indicador incompleto nunca aparece como 100%', () => {
    const overview = JSON.parse(JSON.stringify(demoOverview)) as Rc18OverviewResponse;
    const integridade = overview.dimensoes.find((d) => d.id === 'integridade')!;
    integridade.indicadores = [];
    integridade.estado = 'nao_medido';
    integridade.situacao = 'nao_medido';
    integridade.regras = { total: 0, executadas: 0, aprovadas: 0, reprovadas: 0, naoExecutadas: 0, suspensas: 1 };
    integridade.lacuna =
      'Há 1 regra(s) marcada(s) com esta dimensão no escopo, mas nenhuma foi executada na última execução dos DataScans (0 sem execução, 1 suspensa(s)).';
    const clareza = overview.dimensoes.find((d) => d.id === 'clareza')!;
    clareza.indicadores = [{ ...clareza.indicadores[0], valorPct: 100, numerador: 20000, denominador: 20001 }];

    renderOverview(overview);

    expect(within(screen.getByTestId('rc18-dimensao-clareza')).getByText('< 100%')).toBeVisible();

    fireEvent.click(
      within(screen.getByTestId('rc18-dimensao-integridade')).getByRole('button', { name: /Detalhes de Integridade/ })
    );
    const dialog = screen.getByRole('dialog', { name: 'Integridade' });
    expect(within(dialog).getByText(/nenhuma foi executada/)).toBeVisible();
    expect(within(dialog).queryByText(/Para incluir um indicador/)).toBeNull();
  });

  it('sem escopo exibe alerta e não fabrica percentuais', () => {
    renderOverview(vazioOverview);

    expect(screen.getByText(/Nenhum DataScan de qualidade de dados encontrado/)).toBeVisible();
    const acuracia = screen.getByTestId('rc18-dimensao-acuracia');
    expect(within(acuracia).getByText('Sem dados')).toBeVisible();
    expect(within(acuracia).queryByText(/%/)).toBeNull();
  });

  it('não afirma o que não foi lido: DataScans sem leitura e governança não verificada aparecem como "—"', () => {
    const semLeitura = JSON.parse(JSON.stringify(vazioOverview)) as Rc18OverviewResponse;
    semLeitura.escopo = { ...semLeitura.escopo, scansDeQualidade: 3, scansLidos: 0 };
    const primeiro = renderOverview(semLeitura);
    expect(
      screen.getByText('3 DataScan(s) de qualidade encontrado(s) no filtro atual, mas nenhum pôde ser lido. Veja os diagnósticos.')
    ).toBeVisible();
    expect(screen.queryByText(/Nenhum DataScan de qualidade de dados encontrado/)).toBeNull();
    for (const id of ['regras-reprovadas', 'tabelas-afetadas', 'scans-desatualizados', 'lacunas-governanca']) {
      expect(screen.getByTestId(`rc18-kpi-${id}`)).toHaveTextContent('—');
    }
    primeiro.unmount();

    const tabelas = demoOverview.escopo.tabelas.length;
    const naoVerificada = JSON.parse(JSON.stringify(demoOverview)) as Rc18OverviewResponse;
    naoVerificada.resumoNaoConformidades = {
      ...naoVerificada.resumoNaoConformidades,
      lacunasGovernanca: 0,
      governancaNaoVerificada: tabelas,
    };
    const segundo = renderOverview(naoVerificada);
    const kpiTodas = screen.getByTestId('rc18-kpi-lacunas-governanca');
    expect(kpiTodas).toHaveTextContent('—');
    expect(kpiTodas).toHaveTextContent(`${tabelas} não verificada(s)`);
    segundo.unmount();

    const parcial = JSON.parse(JSON.stringify(demoOverview)) as Rc18OverviewResponse;
    parcial.resumoNaoConformidades = { ...parcial.resumoNaoConformidades, lacunasGovernanca: 0, governancaNaoVerificada: 1 };
    renderOverview(parcial);
    const kpiParcial = screen.getByTestId('rc18-kpi-lacunas-governanca');
    expect(kpiParcial).not.toHaveTextContent('—');
    expect(kpiParcial).toHaveTextContent('1 não verificada(s)');
  });

  it('sinaliza listagem não lida, leitura parcial e cobertura parcial sem a cor de "zero verificado"', () => {
    const corDoPonto = (id: string) => getComputedStyle(screen.getByTestId(`rc18-kpi-${id}-ponto`)).backgroundColor;
    const NEUTRO = 'rgb(87, 87, 87)';
    const VERDE = 'rgb(18, 137, 55)';
    const KPIS = ['regras-reprovadas', 'tabelas-afetadas', 'scans-desatualizados', 'lacunas-governanca'];

    // 1) Listagem não lida (cenário real do backend): texto próprio, KPIs "—" em cinza e nada afirmado sobre regras
    const primeiro = renderOverview(erroOverview);
    expect(screen.getByText('A listagem de DataScans não pôde ser lida. Veja os diagnósticos.')).toBeVisible();
    expect(screen.getByText(/Listagem de DataScans não lida/)).toBeVisible();
    expect(screen.getByTestId('rc18-kpi-tabelas-afetadas')).toHaveTextContent('Escopo não lido');
    for (const id of KPIS) {
      expect(screen.getByTestId(`rc18-kpi-${id}`)).toHaveTextContent('—');
      expect(corDoPonto(id)).toBe(NEUTRO);
    }
    fireEvent.click(
      within(screen.getByTestId('rc18-dimensao-integridade')).getByRole('button', { name: /Detalhes de Integridade/ })
    );
    const gaveta = screen.getByRole('dialog', { name: 'Integridade' });
    expect(within(gaveta).getByText(/não é possível afirmar se há regras desta dimensão/)).toBeVisible();
    expect(within(gaveta).queryByText(/Não há regras marcadas/)).toBeNull();
    expect(within(gaveta).queryByText(/Para incluir um indicador/)).toBeNull();
    expect(within(gaveta).queryByText(/nenhuma executada no escopo/)).toBeNull();
    primeiro.unmount();

    // 2) Escopo não lido por inteiro: zero fica cinza (não verde) e o cabeçalho diz o motivo
    const zerado = JSON.parse(JSON.stringify(demoOverview)) as Rc18OverviewResponse;
    zerado.resumoNaoConformidades = {
      ...zerado.resumoNaoConformidades,
      totalRegrasReprovadas: 0,
      tabelasComFalhas: 0,
      scansDesatualizados: 0,
      lacunasGovernanca: 0,
      governancaNaoVerificada: 0,
    };
    const naoLidos = JSON.parse(JSON.stringify(zerado)) as Rc18OverviewResponse;
    naoLidos.escopo = { ...naoLidos.escopo, scansNaoLidos: 1, lidoPorInteiro: false };
    const segundo = renderOverview(naoLidos);
    expect(screen.getByText(/1 scan\(s\) não lido\(s\)/)).toBeVisible();
    for (const id of KPIS) expect(corDoPonto(id)).toBe(NEUTRO);
    segundo.unmount();

    const incompleta = JSON.parse(JSON.stringify(zerado)) as Rc18OverviewResponse;
    incompleta.escopo = { ...incompleta.escopo, scansNaoLidos: 0, truncado: false, lidoPorInteiro: false };
    const terceiro = renderOverview(incompleta);
    expect(screen.getByText(/listagem incompleta/)).toBeVisible();
    for (const id of KPIS) expect(corDoPonto(id)).toBe(NEUTRO);
    terceiro.unmount();

    // 3) Tudo lido e zero de fato: verde; cobertura de 100% só entre as tabelas lidas: "Leitura parcial"
    const lido = JSON.parse(JSON.stringify(zerado)) as Rc18OverviewResponse;
    const acessibilidade = lido.dimensoes.find((d) => d.id === 'acessibilidade')!;
    acessibilidade.situacao = 'leitura_parcial';
    acessibilidade.indicadores = [
      { ...acessibilidade.indicadores[0], numerador: 1, denominador: 1, valorPct: 100, naoVerificadas: 2 },
    ];
    renderOverview(lido);
    for (const id of KPIS) expect(corDoPonto(id)).toBe(VERDE);
    const cartao = screen.getByTestId('rc18-dimensao-acessibilidade');
    expect(within(cartao).getByText('Leitura parcial')).toBeVisible();
    expect(cartao).toHaveTextContent('2 tabela(s) não verificada(s)');
  });
});

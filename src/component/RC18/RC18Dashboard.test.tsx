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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import RC18Dashboard from './RC18Dashboard';
import respostas from './__fixtures__/rc18-respostas.json';
import type { Rc18OverviewResponse } from './rc18Types';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();

vi.mock('axios');
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));
vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { token: 'token-de-teste' } }),
}));
vi.mock('../../features/entry/entrySlice', () => ({
  clearHistory: () => ({ type: 'entry/clearHistory' }),
  fetchEntry: (payload: unknown) => ({ type: 'entry/fetchEntry', payload }),
}));

type Cenario = typeof respostas.demo;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const responder = (cenario: Cenario) => {
  vi.mocked(axios.get).mockImplementation(async (url: string) => {
    if (url.endsWith('/rc18/overview')) return { data: cenario };
    throw new Error(`URL inesperada: ${url}`);
  });
};

const projetoReal = (): Cenario => {
  const real = clone(respostas.demo);
  real.demo = false;
  real.identityMode = 'user';
  return real;
};

// O painel descreve evidências; não pode atestar conformidade nem citar artigos/incisos.
const TERMOS_VEDADOS = /\bConforme\b|Auditado|Adequado|Nível de Risco|CADOC|Certificad/;
const CITACAO_DE_ARTIGO = /\bart\.\s*\d|§|\bInciso\b/i;
const semTermosVedados = () => {
  const texto = document.body.textContent ?? '';
  expect(texto).not.toMatch(TERMOS_VEDADOS);
  expect(texto).not.toMatch(CITACAO_DE_ARTIGO);
};

const selecionarDataset = async (dataset: string) => {
  fireEvent.mouseDown(screen.getByLabelText('Dataset'));
  fireEvent.click(await screen.findByRole('option', { name: dataset }));
};

vi.setConfig({ testTimeout: 20000 });

describe('RC18Dashboard', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    mockNavigate.mockReset();
    mockDispatch.mockReset();
  });

  it('consulta /rc18/overview uma única vez com o token do usuário e mostra as 12 dimensões sem termos vedados', async () => {
    responder(projetoReal());

    render(<RC18Dashboard />);

    expect(await screen.findByTestId('rc18-dimensao-acessibilidade')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
    expect(screen.getByText('Permissões do usuário conectado')).toBeInTheDocument();
    expect(screen.getByText(/não atesta conformidade regulatória/i)).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Visões do painel RC 18' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'rc18-tab-0');
    semTermosVedados();

    const calls = vi.mocked(axios.get).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/\/rc18\/overview$/);
    expect(calls[0][1]?.headers).toEqual({ Authorization: 'Bearer token-de-teste' });
    expect(calls[0][1]?.params).toEqual({ location: 'global' });
    expect(calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('abre o Popover normativo acessível por clique sem citar artigos ou incisos', async () => {
    responder(respostas.demo);
    render(<RC18Dashboard />);
    await screen.findByTestId('rc18-dimensao-acuracia');

    const infoBtn = screen.getByRole('button', { name: 'Sobre o normativo' });
    expect(infoBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(infoBtn);
    expect(infoBtn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Resolução Conjunta nº 18/)).toBeVisible();
    expect(screen.getByText(/Prazo de adequação: 31\/12\/2026/)).toBeVisible();
    semTermosVedados();
  });

  it('clicar em "Regras reprovadas" abre a aba 2 filtrada; nome da tabela e etiqueta Linhagem levam ao /view-details', async () => {
    const real = projetoReal();
    responder(real);

    render(<RC18Dashboard />);
    await screen.findByTestId('rc18-kpi-regras-reprovadas');

    fireEvent.click(screen.getByTestId('rc18-kpi-regras-reprovadas'));
    expect(await screen.findByTestId('rc18-regras-contagem')).toHaveTextContent('Exibindo 3 de');

    const tabelaBtn = screen.getAllByRole('button', { name: 'fin_demo_cadastro.dados_cadastrais' })[0];
    fireEvent.click(tabelaBtn);

    const expectedEntry = real.tableSummaries.find((t) => t.fullTableName === 'fin_demo_cadastro.dados_cadastrais')!.entryName!;
    const entryParam = encodeURIComponent(btoa(expectedEntry));
    expect(mockDispatch).toHaveBeenNthCalledWith(1, { type: 'entry/clearHistory' });
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'entry/fetchEntry',
      payload: { entryName: expectedEntry, id_token: 'token-de-teste' },
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/view-details?entry=${entryParam}`);

    // Sub-aba Tabelas: a etiqueta Linhagem abre direto a aba nativa Lineage
    fireEvent.click(screen.getByRole('button', { name: /^Tabelas \(/ }));
    const linha = screen.getByRole('button', { name: 'fin_demo_cadastro.dados_cadastrais' }).closest('tr')!;
    fireEvent.click(within(linha).getByRole('button', { name: /Linhagem/ }));
    expect(mockNavigate).toHaveBeenLastCalledWith(`/view-details?entry=${entryParam}&tab=lineage`);
  });

  it('KPI "Lacunas de governança" abre a sub-aba Tabelas filtrada pelas tabelas com lacuna', async () => {
    const real = projetoReal();
    responder(real);
    render(<RC18Dashboard />);

    fireEvent.click(await screen.findByTestId('rc18-kpi-lacunas-governanca'));
    expect(await screen.findByText('Com lacunas de governança')).toBeVisible();
    const comLacuna = Object.values(real.catalogByTable).filter((c) => c.lacunaGovernanca).length;
    expect(comLacuna).toBe(real.resumoNaoConformidades.lacunasGovernanca);
    // Cabeçalho + uma linha por tabela com lacuna
    expect(screen.getAllByRole('row')).toHaveLength(comLacuna + 1);
  });

  it('Atualizar envia refresh=true e cancelar requisição anterior via AbortController não sobrescreve resposta nova', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst!: (val: unknown) => void;
    let callCount = 0;

    vi.mocked(axios.get).mockImplementation((_url, config) => {
      callCount += 1;
      if (config?.signal) signals.push(config.signal as AbortSignal);
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        }) as ReturnType<typeof axios.get>;
      }
      return Promise.resolve({ data: respostas.demo }) as ReturnType<typeof axios.get>;
    });

    render(<RC18Dashboard />);
    // Com o primeiro fetch pendente, a troca de localização aborta a requisição anterior
    const locInput = screen.getByLabelText('Localização');
    fireEvent.mouseDown(locInput);
    const spOpt = await screen.findByRole('option', { name: /southamerica-east1/ });
    fireEvent.click(spOpt);

    expect(await screen.findByTestId('rc18-dimensao-acuracia')).toBeInTheDocument();
    expect(signals[0].aborted).toBe(true);

    // Resolver a primeira resposta atrasada não deve sobrescrever o estado atual
    resolveFirst({ data: respostas.vazio });
    await waitFor(() => expect(screen.getByTestId('rc18-kpi-regras-reprovadas')).toHaveTextContent('3'));

    // Clique em Atualizar envia refresh=true
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => {
      const lastCall = vi.mocked(axios.get).mock.calls.at(-1);
      expect(lastCall?.[1]?.params).toMatchObject({ location: 'southamerica-east1', refresh: 'true' });
    });
  });

  it('baixa JSON de evidências consolidado sem lookupContextYaml', async () => {
    responder(respostas.demo);
    let capturedBlob: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:rc18-test';
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(<RC18Dashboard />);
      await screen.findByTestId('rc18-dimensao-acuracia');

      fireEvent.click(screen.getByRole('button', { name: 'Baixar evidências (JSON)' }));
      expect(capturedBlob).not.toBeNull();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlob!);
      });
      const parsed = JSON.parse(text);
      expect(parsed.geradoEm).toBeTruthy();
      expect(parsed.aviso).toBe(respostas.demo.norma.aviso);
      expect(parsed.dimensoes).toHaveLength(12);
      expect(parsed.lookupContextYaml).toBeUndefined();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it('exibe diagnósticos quando há erro parcial de API e erro geral quando a requisição falha', async () => {
    responder(respostas.erroApi);
    render(<RC18Dashboard />);
    expect(await screen.findByText(/1 consulta\(s\) a APIs falharam/)).toBeVisible();

    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { message: 'Token de acesso ausente na requisição.' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Token de acesso ausente na requisição.')).toBeVisible();
  });

  it('alterna para exemplo sintético enviando demo=true e limpando o filtro de dataset selecionado', async () => {
    const real = projetoReal();
    vi.mocked(axios.get).mockImplementation(async (url: string, config?: { params?: { demo?: string } }) => {
      if (url.endsWith('/rc18/overview')) {
        return { data: config?.params?.demo === 'true' ? respostas.demo : real };
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(<RC18Dashboard />);
    await screen.findByTestId('rc18-dimensao-acuracia');

    await selecionarDataset('fin_demo_cadastro');
    await waitFor(() => {
      const lastCall = vi.mocked(axios.get).mock.calls.at(-1);
      expect(lastCall?.[1]?.params).toEqual({ location: 'global', dataset: 'fin_demo_cadastro' });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exemplo sintético' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Exemplo sintético' }));
    await waitFor(() => {
      const lastCall = vi.mocked(axios.get).mock.calls.at(-1);
      expect(lastCall?.[1]?.params).toEqual({ location: 'global', demo: 'true' });
    });
    expect(await within(document.body).findByText('Dados de exemplo (sintéticos)')).toBeVisible();
  });

  it('limpa o filtro quando a API o recusa (HTTP 400) e volta a consultar sem filtro', async () => {
    const real = projetoReal();
    vi.mocked(axios.get).mockImplementation(async (url: string, config?: { params?: { dataset?: string } }) => {
      if (!url.endsWith('/rc18/overview')) throw new Error(`URL inesperada: ${url}`);
      if (config?.params?.dataset) {
        return Promise.reject({ response: { status: 400, data: { message: 'Parâmetro "dataset" inválido.' } } });
      }
      return { data: real };
    });

    render(<RC18Dashboard />);
    await screen.findByTestId('rc18-dimensao-acuracia');

    await selecionarDataset('fin_demo_cadastro');
    await waitFor(() => {
      const calls = vi.mocked(axios.get).mock.calls;
      expect(calls.some((c) => c[1]?.params?.dataset === 'fin_demo_cadastro')).toBe(true);
      expect(calls.at(-1)?.[1]?.params).toEqual({ location: 'global' });
    });
    expect(await screen.findByTestId('rc18-dimensao-acuracia')).toBeInTheDocument();
    expect(screen.getByLabelText('Dataset')).toHaveTextContent('Todos os datasets');
  });

  describe('filtros presos à visão atual', () => {
    const comFiltros = <T,>(cenario: T, datasets: string[], labels: string[] = [], completos = true): T => {
      const resposta = cenario as unknown as Rc18OverviewResponse;
      resposta.filtrosDisponiveis = { datasets, labels };
      resposta.filtrosCompletos = completos;
      return cenario;
    };
    const desabilitado = (rotulo: string) => screen.getByLabelText(rotulo).getAttribute('aria-disabled') === 'true';

    it('zera os filtros ao trocar de localização e desabilita Dataset e Label durante o carregamento', async () => {
      const global = comFiltros(projetoReal(), ['ds_global'], ['env:prod']);
      const saoPaulo = comFiltros(projetoReal(), ['ds_sp']);
      let liberar: () => void = () => {};
      vi.mocked(axios.get).mockImplementation((_url: string, config?: { params?: { location?: string } }) => {
        if (config?.params?.location === 'global') {
          return Promise.resolve({ data: global }) as ReturnType<typeof axios.get>;
        }
        return new Promise((resolve) => {
          liberar = () => resolve({ data: saoPaulo });
        }) as ReturnType<typeof axios.get>;
      });

      render(<RC18Dashboard />);
      await screen.findByTestId('rc18-dimensao-acuracia');
      expect(desabilitado('Dataset')).toBe(false);
      expect(desabilitado('Label do scan')).toBe(false);

      fireEvent.mouseDown(screen.getByLabelText('Localização'));
      fireEvent.click(await screen.findByRole('option', { name: /southamerica-east1/ }));

      // Enquanto a nova localização carrega, nenhum valor da localização anterior fica disponível
      await waitFor(() => expect(desabilitado('Dataset')).toBe(true));
      expect(desabilitado('Label do scan')).toBe(true);

      liberar();
      await waitFor(() => expect(desabilitado('Dataset')).toBe(false));
      expect(desabilitado('Label do scan')).toBe(true);
      fireEvent.mouseDown(screen.getByLabelText('Dataset'));
      const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
      expect(opcoes).toEqual(['Todos os datasets', 'ds_sp']);
    });

    it('ao voltar do exemplo para o projeto com erro, não oferece datasets do exemplo sintético', async () => {
      vi.mocked(axios.get).mockImplementation(async (_url: string, config?: { params?: { demo?: string } }) => {
        if (config?.params?.demo === 'true') return { data: respostas.demo };
        return Promise.reject({ response: { status: 503, data: { message: 'Falha temporária' } } });
      });

      render(<RC18Dashboard />);
      await screen.findByText('Falha temporária');

      fireEvent.click(screen.getByRole('button', { name: 'Exemplo sintético' }));
      await screen.findByText('Dados de exemplo (sintéticos)');
      await waitFor(() => expect(desabilitado('Dataset')).toBe(false));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar ao projeto' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Voltar ao projeto' }));
      await screen.findByText('Falha temporária');
      expect(screen.queryByText('Dados de exemplo (sintéticos)')).toBeNull();
      expect(desabilitado('Dataset')).toBe(true);
      expect(desabilitado('Label do scan')).toBe(true);
    });

    it('limpa o filtro que deixou de existir no escopo e consulta de novo sem ele', async () => {
      const inicial = comFiltros(projetoReal(), ['ds_a', 'ds_b']);
      const filtradoSemDsB = comFiltros(clone(respostas.vazio), ['ds_a']);
      const depois = comFiltros(projetoReal(), ['ds_a']);
      let consultasSemFiltro = 0;
      vi.mocked(axios.get).mockImplementation(async (_url: string, config?: { params?: { dataset?: string } }) => {
        if (config?.params?.dataset === 'ds_b') return { data: filtradoSemDsB };
        consultasSemFiltro += 1;
        return { data: consultasSemFiltro === 1 ? inicial : depois };
      });

      render(<RC18Dashboard />);
      await screen.findByTestId('rc18-dimensao-acuracia');
      await selecionarDataset('ds_b');

      await waitFor(() => expect(consultasSemFiltro).toBe(2));
      const calls = vi.mocked(axios.get).mock.calls;
      expect(calls.some((c) => c[1]?.params?.dataset === 'ds_b')).toBe(true);
      expect(calls.at(-1)?.[1]?.params).toEqual({ location: 'global' });
      await waitFor(() => expect(screen.getByLabelText('Dataset')).toHaveTextContent('Todos os datasets'));
      expect(screen.queryByText(/Nenhum DataScan de qualidade de dados encontrado/)).toBeNull();
      expect(await screen.findByTestId('rc18-kpi-regras-reprovadas')).toHaveTextContent('3');
    });

    it('mantém o filtro e mostra o aviso quando a listagem falha ao atualizar', async () => {
      const inicial = comFiltros(projetoReal(), ['ds_a', 'ds_b']);
      const falha = comFiltros(clone(respostas.erroApi), [], [], false);
      let atualizacoes = 0;
      vi.mocked(axios.get).mockImplementation(async (_url: string, config?: { params?: { refresh?: string } }) => {
        if (config?.params?.refresh === 'true') {
          atualizacoes += 1;
          return { data: falha };
        }
        return { data: inicial };
      });

      render(<RC18Dashboard />);
      await screen.findByTestId('rc18-dimensao-acuracia');
      await selecionarDataset('ds_b');
      await waitFor(() =>
        expect(vi.mocked(axios.get).mock.calls.at(-1)?.[1]?.params).toEqual({ location: 'global', dataset: 'ds_b' })
      );
      await screen.findByTestId('rc18-dimensao-acuracia');

      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
      expect(await screen.findByText(/1 consulta\(s\) a APIs falharam/)).toBeVisible();
      // Listagem não lida: nada de "zero verificado" nem de "nenhum DataScan encontrado"
      expect(screen.getByText('A listagem de DataScans não pôde ser lida. Veja os diagnósticos.')).toBeVisible();
      expect(screen.getByTestId('rc18-kpi-regras-reprovadas')).toHaveTextContent('—');
      expect(atualizacoes).toBe(1);
      expect(vi.mocked(axios.get).mock.calls.at(-1)?.[1]?.params).toEqual({
        location: 'global',
        dataset: 'ds_b',
        refresh: 'true',
      });
      expect(screen.getByLabelText('Dataset')).toHaveTextContent('ds_b');
      expect(desabilitado('Dataset')).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import RC18Dashboard from './RC18Dashboard';
// Respostas geradas pelas rotas reais do backend (backend/rc18/rc18.test.js mantém este arquivo em dia).
import respostas from './__fixtures__/rc18-respostas.json';

vi.mock('axios');
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { token: 'token-de-teste' } }),
}));

type Cenario = typeof respostas.demo;

const responder = (cenario: Cenario) => {
  vi.mocked(axios.get).mockImplementation(async (url: string) => {
    if (url.endsWith('/rc18/dimensions')) return { data: cenario.dimensions };
    if (url.endsWith('/rc18/data-quality-dimensions')) return { data: cenario.dataQuality };
    if (url.endsWith('/rc18/dlp-sensitive-data')) return { data: cenario.sensitive };
    if (url.endsWith('/rc18/lineage-traceability')) return { data: cenario.lineage };
    throw new Error(`URL inesperada: ${url}`);
  });
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const abrirVisao = (nome: RegExp | string) => fireEvent.click(screen.getByRole('button', { name: nome }));
const abrirAba = (nome: RegExp | string) => fireEvent.click(screen.getByRole('tab', { name: nome }));

// O painel descreve evidências; não pode atestar conformidade nem classificar risco.
const TERMOS_VEDADOS = /\bConforme\b|Auditado|Adequado|Nível de Risco|CADOC|Certificad/;
const semTermosVedados = () => expect(document.body.textContent ?? '').not.toMatch(TERMOS_VEDADOS);

// Folga para a suíte completa, que roda os arquivos em paralelo (o padrão do Vitest é 5 s).
vi.setConfig({ testTimeout: 20000 });

const VISOES = [
  /12 dimensões/,
  'Qualidade por tabela',
  /Dados sensíveis/,
  /Rastreabilidade \(inciso X\)/,
  /Knowledge Catalog \(contexto\)/,
] as const;

describe('RC18Dashboard', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it('consulta as quatro rotas com o token do usuário e mostra as 12 dimensões', async () => {
    const real = clone(respostas.demo);
    for (const payload of Object.values(real)) {
      payload.demo = false;
      payload.identityMode = 'user';
    }
    responder(real);
    render(<RC18Dashboard />);

    expect(await screen.findByTestId('rc18-dimensao-acessibilidade')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
    expect(screen.getByText('Consultado com as permissões do usuário conectado')).toBeInTheDocument();
    expect(screen.queryByText(/Dados de exemplo/)).toBeNull();

    const calls = vi.mocked(axios.get).mock.calls;
    expect(calls).toHaveLength(4);
    const rids = new Set<string>();
    for (const [, config] of calls) {
      expect(config?.headers).toEqual({ Authorization: 'Bearer token-de-teste' });
      expect(config?.params.location).toBe('global');
      expect(config?.params.demo).toBeUndefined();
      rids.add(config?.params.rid);
    }
    expect(rids.size).toBe(1);
  });

  it('mostra indicadores com numerador e denominador e não inventa percentual para o que não mede', async () => {
    responder(respostas.demo);
    render(<RC18Dashboard />);

    const acessibilidade = await screen.findByTestId('rc18-dimensao-acessibilidade');
    expect(within(acessibilidade).getByText('50%')).toBeInTheDocument();
    expect(within(acessibilidade).getByText(/2 de 4 tabelas — Tabelas do escopo com contatos registrados/)).toBeInTheDocument();

    const relevancia = screen.getByTestId('rc18-dimensao-relevancia');
    expect(within(relevancia).getByText(/2 de 4 tabelas — Tabelas do escopo com consultas registradas/)).toBeInTheDocument();
    expect(within(relevancia).getByText(/Limite do indicador: O uso técnico da tabela não comprova/)).toBeInTheDocument();

    const acuracia = screen.getByTestId('rc18-dimensao-acuracia');
    expect(within(acuracia).getByText('66,67%')).toBeInTheDocument();
    expect(within(acuracia).getByText(/1 regra\(s\) configurada\(s\) sem execução/)).toBeInTheDocument();

    // Dimensão sem coletor, medida por regra marcada com a dimensão personalizada.
    const integridade = screen.getByTestId('rc18-dimensao-integridade');
    expect(within(integridade).getByText('100%')).toBeInTheDocument();
    expect(within(integridade).getByText(/Coleta: regras de DataScan marcadas com a dimensão personalizada/)).toBeInTheDocument();
    expect(within(integridade).getByText(/Limite do indicador: Reflete apenas as regras que a instituição marcou/)).toBeInTheDocument();
    expect(within(integridade).queryByText(/Sem coleta automática/)).toBeNull();

    // Confiabilidade: medida por regras que comparam a versão revisada com a informada.
    const confiabilidade = screen.getByTestId('rc18-dimensao-confiabilidade');
    expect(within(confiabilidade).getByText('50%')).toBeInTheDocument();
    expect(within(confiabilidade).getByText(/1 de 2 regras — Regras de qualidade aprovadas/)).toBeInTheDocument();

    // Comparabilidade: regras marcadas com a dimensão e termos de glossário vinculados.
    const comparabilidade = screen.getByTestId('rc18-dimensao-comparabilidade');
    expect(within(comparabilidade).getByText(/1 de 1 regras — Regras de qualidade aprovadas/)).toBeInTheDocument();
    expect(within(comparabilidade).getByText(/2 de 4 tabelas — Tabelas do escopo com termo de glossário vinculado/)).toBeInTheDocument();

    // Dimensão sem regras marcadas: sem percentual, e o caminho para medir já aparece aberto.
    const adaptabilidade = screen.getByTestId('rc18-dimensao-adaptabilidade');
    expect(within(adaptabilidade).getByText('Não medido automaticamente')).toBeInTheDocument();
    expect(within(adaptabilidade).queryByText(/%/)).toBeNull();
    expect(within(adaptabilidade).getByText(/marque regras de DataScan com a dimensão personalizada/)).toBeInTheDocument();
    const medicao = within(adaptabilidade).getByTestId('rc18-medicao-adaptabilidade');
    expect(within(medicao).getByText('BigQuery — tabela de controle:')).toBeInTheDocument();
    expect(within(medicao).getByText('Dataplex — regras de qualidade (ADAPTABILIDADE):')).toBeInTheDocument();

    // Dimensão já medida: a orientação fica recolhida até ser pedida.
    expect(within(acuracia).queryByTestId('rc18-medicao-acuracia')).toBeNull();
    fireEvent.click(within(acuracia).getByRole('button', { name: 'Como medir no Google Cloud' }));
    expect(within(acuracia).getByTestId('rc18-medicao-acuracia')).toBeInTheDocument();

    expect(screen.getByText('Dados de exemplo (sintéticos) — não representam o projeto')).toBeInTheDocument();
    expect(screen.getByText(/não atesta conformidade regulatória/)).toBeInTheDocument();
    semTermosVedados();
  });

  // Uma visão por teste: renderizar as tabelas do MUI no jsdom é lento, e a suíte completa roda em paralelo.
  const abrirPainel = async (cenario: Cenario) => {
    responder(cenario);
    render(<RC18Dashboard />);
    await screen.findByTestId('rc18-dimensao-acuracia');
  };

  it('visão "Qualidade por tabela": regras de todas as dimensões com regras, por tabela e por dimensão', async () => {
    await abrirPainel(respostas.demo);
    abrirVisao('Qualidade por tabela');

    // Um cartão por dimensão com regras — inclusive as personalizadas; nenhum para as demais.
    expect(screen.getAllByTestId(/^rc18-grupo-/).map((c) => c.getAttribute('data-testid'))).toEqual([
      'rc18-grupo-acuracia',
      'rc18-grupo-comparabilidade',
      'rc18-grupo-completude',
      'rc18-grupo-confiabilidade',
      'rc18-grupo-consistencia',
      'rc18-grupo-integridade',
      'rc18-grupo-tempestividade',
    ]);
    const cartao = screen.getByTestId('rc18-grupo-confiabilidade');
    expect(within(cartao).getByText('50%')).toBeInTheDocument();
    expect(within(cartao).getByText('1 de 2 regras aprovadas')).toBeInTheDocument();

    expect(screen.getByText('fin_demo_cartoes.transacao_cartao')).toBeInTheDocument();
    // Scan configurado e ainda não executado: sem percentual e sem selo de aprovação.
    const linhaSemExecucao = screen.getByText('fin_demo_credito.operacoes_ativas').closest('tr') as HTMLElement;
    expect(within(linhaSemExecucao).getByText('Sem execução')).toBeInTheDocument();
    expect(within(linhaSemExecucao).queryByText(/%/)).toBeNull();
    const linhaContas = screen.getByText('fin_demo_contas.saldos_extratos').closest('tr') as HTMLElement;
    expect(within(linhaContas).getByText('VII 50%')).toBeInTheDocument();
    expect(within(linhaContas).getByText('IX 100%')).toBeInTheDocument();
    semTermosVedados();

    // Todas as regras, com a dimensão da Resolução, a descrição e o resultado de cada forma de regra.
    abrirAba(/^Regras \(16\)$/);
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('16 de 16 regras');
    fireEvent.click(within(cartao).getByRole('button', { name: 'Ver regras de Confiabilidade' }));
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('2 de 16 regras');
    const regras = screen.getByTitle('Regras de qualidade');
    const revisao = within(regras).getByText('revisao-sem-desvio-relevante').closest('tr') as HTMLElement;
    expect(within(revisao).getByText(/Nenhum saldo revisado se afasta mais de 5% do valor informado/)).toBeInTheDocument();
    expect(within(revisao).getByText('VII — Confiabilidade')).toBeInTheDocument();
    expect(within(revisao).getByText('3 linhas em desacordo')).toBeInTheDocument();
    expect(within(revisao).getByText('Reprovada')).toBeInTheDocument();
    const total = within(regras).getByText('total-revisado-proximo-do-informado').closest('tr') as HTMLElement;
    expect(within(total).getByText('Condição atendida')).toBeInTheDocument();
    expect(within(total).getByText('Aprovada')).toBeInTheDocument();
    expect(within(regras).queryByText('cpf-formato')).toBeNull();
    semTermosVedados();

    // Regra por linha: linhas aprovadas e avaliadas, como devolvidas pela API.
    fireEvent.click(within(screen.getByTestId('rc18-grupo-acuracia')).getByRole('button', { name: 'Ver regras de Acurácia' }));
    const email = within(screen.getByTitle('Regras de qualidade')).getByText('email-formato').closest('tr') as HTMLElement;
    expect(within(email).getByText('47.850 de 48.920 linhas (97,81%)')).toBeInTheDocument();
    const semExecucao = within(screen.getByTitle('Regras de qualidade')).getByText('taxa-em-intervalo').closest('tr') as HTMLElement;
    expect(within(semExecucao).getByText('Sem execução')).toBeInTheDocument();
    expect(within(semExecucao).queryByText(/%/)).toBeNull();
    semTermosVedados();
  });

  it('do cartão da dimensão para as regras: abre a lista já filtrada', async () => {
    await abrirPainel(respostas.demo);
    const integridade = screen.getByTestId('rc18-dimensao-integridade');
    fireEvent.click(within(integridade).getByRole('button', { name: 'Ver as 1 regra(s) desta dimensão' }));
    expect(screen.getByTestId('rc18-regras-contagem')).toHaveTextContent('1 de 16 regras');
    const regras = screen.getByTitle('Regras de qualidade');
    expect(within(regras).getByText('hash-de-carga-confere')).toBeInTheDocument();
    expect(within(regras).getByText('IX — Integridade')).toBeInTheDocument();
    // Dimensão sem regras não oferece o atalho.
    abrirVisao(/12 dimensões/);
    expect(within(screen.getByTestId('rc18-dimensao-adaptabilidade')).queryByRole('button', { name: /Ver as/ })).toBeNull();
  });

  it('visão "Dados sensíveis": complementar, factual e sem classificação de risco', async () => {
    await abrirPainel(respostas.demo);
    abrirVisao(/Dados sensíveis/);
    expect(screen.getByText(/não é uma das 12 dimensões/)).toBeInTheDocument();
    expect(screen.getByText('Há colunas sem Policy Tag')).toBeInTheDocument();
    semTermosVedados();
    abrirAba('Policy Tags por tabela');
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    semTermosVedados();
  });

  it('visão "Rastreabilidade": cobertura, origens, processos e destinos registrados', async () => {
    await abrirPainel(respostas.demo);
    abrirVisao(/Rastreabilidade \(inciso X\)/);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('3 de 4 tabelas do escopo')).toBeInTheDocument();
    expect(screen.getAllByText('Sem origem registrada').length).toBeGreaterThan(0);
    semTermosVedados();
    abrirAba('Processos registrados');
    expect(screen.getAllByText('carga_cadastro').length).toBeGreaterThan(0);
    semTermosVedados();
  });

  it('visão "Knowledge Catalog": entradas com contatos e uso; métrica ausente não vira zero', async () => {
    await abrirPainel(respostas.demo);
    abrirVisao(/Knowledge Catalog \(contexto\)/);
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    const entradas = screen.getByTitle('Entradas do Knowledge Catalog');
    const linhaSemUso = within(entradas).getByText('saldos_extratos').closest('tr') as HTMLElement;
    expect(within(linhaSemUso).getByText('não informado')).toBeInTheDocument();
    // Termos de glossário vinculados à tabela ou às suas colunas (indicador de comparabilidade).
    expect(within(linhaSemUso).getByText('saldo-disponivel')).toBeInTheDocument();
    const linhaCadastro = within(entradas).getByText('dados_cadastrais').closest('tr') as HTMLElement;
    expect(within(linhaCadastro).getByText('cliente, cpf')).toBeInTheDocument();
    semTermosVedados();
  });

  it('projeto sem DataScans: avisa em cada visão e não exibe percentuais', async () => {
    responder(respostas.vazio);
    render(<RC18Dashboard />);

    expect(await screen.findByText(/Nenhum DataScan de qualidade de dados foi encontrado neste projeto/)).toBeInTheDocument();
    expect(screen.getByText('0 com indicador')).toBeInTheDocument();
    for (const card of screen.getAllByTestId(/^rc18-dimensao-/)) {
      expect(within(card).queryByText(/\d%/)).toBeNull();
    }

    abrirVisao('Qualidade por tabela');
    expect(screen.getByText(/Nenhum DataScan de qualidade de dados encontrado para este projeto/)).toBeInTheDocument();
    // Sem regras: nenhum cartão de dimensão, nenhuma tabela e nenhum selo de aprovação.
    expect(screen.queryByTestId(/^rc18-grupo-/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('CheckCircleIcon')).toBeNull();

    abrirVisao(/Dados sensíveis/);
    expect(screen.getByText('Nenhuma tabela inspecionada')).toBeInTheDocument();
    expect(screen.queryByTestId('CheckCircleIcon')).toBeNull();

    abrirVisao(/Rastreabilidade \(inciso X\)/);
    expect(screen.getByText('Não há tabelas no escopo para consultar na Data Lineage API.')).toBeInTheDocument();

    abrirVisao(/Knowledge Catalog \(contexto\)/);
    expect(screen.getByText('0 de 0')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/100%/);
    semTermosVedados();
  });

  it('falha de API aparece como diagnóstico, sem troca por dados de exemplo', async () => {
    responder(respostas.falha);
    render(<RC18Dashboard />);

    expect(await screen.findByText(/1 consulta\(s\) a APIs falharam\./)).toBeInTheDocument();
    expect(screen.getByText(/Dataplex DataScans \(listagem\).*PERMISSION_DENIED/)).toBeInTheDocument();
    expect(screen.queryByText(/Dados de exemplo/)).toBeNull();
    expect(screen.queryByText(/fin_demo_/)).toBeNull();
  });

  it('erro ao carregar: mostra a mensagem e nenhuma visão com valores zerados', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { message: 'Token de acesso ausente na requisição.' } },
    });
    render(<RC18Dashboard />);

    expect(await screen.findByText('Token de acesso ausente na requisição.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar evidências (JSON)' })).toBeDisabled();
    for (const visao of VISOES) {
      abrirVisao(visao);
      expect(screen.queryByTestId(/^rc18-dimensao-/)).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByText(/TABELAS DO ESCOPO|COLUNAS COM POLICY TAG|PROCESSOS REGISTRADOS/)).toBeNull();
    }
  });

  it('baixa as evidências em JSON sem a resposta do lookupContext', async () => {
    const real = clone(respostas.demo);
    for (const payload of Object.values(real)) {
      payload.demo = false;
      payload.identityMode = 'user';
    }
    (real.dataQuality as { lookupContextYaml: string | null }).lookupContextYaml = 'sampleValues: [valor-de-exemplo-do-dado]';
    responder(real);

    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:rc18';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    render(<RC18Dashboard />);
    const botao = screen.getByRole('button', { name: 'Baixar evidências (JSON)' });
    expect(botao).toBeDisabled(); // nada para baixar enquanto carrega
    await screen.findByTestId('rc18-dimensao-acuracia');
    fireEvent.click(botao);

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^rc18-evidencias-projeto-exemplo-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rc18');
    const texto = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    const exportado = JSON.parse(texto);
    expect(Object.keys(exportado)).toEqual(['geradoEm', 'aviso', 'dimensoes', 'qualidadePorTabela', 'rastreabilidade', 'dadosSensiveis']);
    expect(exportado.dimensoes.dimensoes).toHaveLength(12);
    expect(exportado.aviso).toMatch(/não atesta conformidade regulatória/);
    expect(exportado.qualidadePorTabela.tableSummaries.length).toBeGreaterThan(0);
    expect(exportado.qualidadePorTabela.dimensionGroups).toHaveLength(7);
    expect('lookupContextYaml' in exportado.qualidadePorTabela).toBe(false);
    expect(texto).not.toContain('valor-de-exemplo-do-dado');
    click.mockRestore();
  });

  it('dados de exemplo só são pedidos quando o usuário aciona o modo de exemplo', async () => {
    responder(respostas.vazio);
    render(<RC18Dashboard />);
    await screen.findByText('0 com indicador');
    expect(vi.mocked(axios.get).mock.calls.every(([, config]) => config?.params.demo === undefined)).toBe(true);

    responder(respostas.demo);
    vi.mocked(axios.get).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Ver exemplo sintético' }));
    await screen.findByText('Dados de exemplo (sintéticos) — não representam o projeto');

    const calls = vi.mocked(axios.get).mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls.every(([, config]) => config?.params.demo === 'true')).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar aos dados do projeto' })).toBeInTheDocument());
  });
});

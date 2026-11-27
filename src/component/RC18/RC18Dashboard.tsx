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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  MenuItem,
  Popover,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  InfoOutlined as InfoIcon,
  Refresh as RefreshIcon,
  ScienceOutlined as DemoIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../../auth/AuthProvider';
import { URLS } from '../../constants/urls';
import { clearHistory, fetchEntry } from '../../features/entry/entrySlice';
import type { AppDispatch } from '../../app/store';
import RC18DimensionsOverview from './RC18DimensionsOverview';
import RC18QualityByTable, {
  type EntryTab,
  type QualitySubView,
  type RulesStatusFilter,
  type TablesStatusFilter,
} from './RC18QualityByTable';
import { type Rc18AvailableFilters, type Rc18OverviewResponse, escopoVazioTexto, formatIsoDate } from './rc18Types';

const AVAILABLE_REGIONS = [
  { value: 'global', label: 'Todas as localizações' },
  { value: 'southamerica-east1', label: 'southamerica-east1 (São Paulo)' },
  { value: 'us-central1', label: 'us-central1 (Iowa)' },
  { value: 'us-east1', label: 'us-east1 (Carolina do Sul)' },
  { value: 'us-east4', label: 'us-east4 (Virgínia)' },
  { value: 'us-west1', label: 'us-west1 (Oregon)' },
  { value: 'europe-west1', label: 'europe-west1 (Bélgica)' },
  { value: 'asia-east1', label: 'asia-east1 (Taiwan)' },
];

const messageFromError = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { response?: { data?: { message?: unknown } }; message?: unknown };
  const apiMessage = e.response?.data?.message;
  if (typeof apiMessage === 'string' && apiMessage) return apiMessage;
  return typeof e.message === 'string' && e.message ? e.message : undefined;
};

const isCanceledError = (err: unknown): boolean => {
  if (axios.isCancel(err)) return true;
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; name?: unknown };
    return e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError';
  }
  return false;
};

const statusFromError = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { response?: { status?: unknown } }).response?.status;
  return typeof status === 'number' ? status : undefined;
};

const EMPTY_FILTERS: Rc18AvailableFilters = { datasets: [], labels: [] };

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

/** União de duas listas de filtros da mesma visão (sem repetição, na ordem do backend). */
const mergeFilters = (a: Rc18AvailableFilters, b: Rc18AvailableFilters): Rc18AvailableFilters => ({
  datasets: uniqueSorted([...a.datasets, ...b.datasets]),
  labels: uniqueSorted([...a.labels, ...b.labels]),
});

const RC18Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Rc18OverviewResponse | null>(null);
  // Filtros disponíveis da visão atual (modo e localização): zerados ao trocar de visão, para que os
  // seletores nunca ofereçam valores de outra visão; mantidos após um erro na mesma visão e completados
  // (nunca reduzidos) quando a listagem de DataScans falha ou vem parcial.
  const [availableFilters, setAvailableFilters] = useState<Rc18AvailableFilters>(EMPTY_FILTERS);

  const [selectedLocation, setSelectedLocation] = useState<string>('global');
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [qualitySubView, setQualitySubView] = useState<QualitySubView>('regras');
  const [rulesDimension, setRulesDimension] = useState<string>('');
  const [rulesStatus, setRulesStatus] = useState<RulesStatusFilter>('todas');
  const [tableStatus, setTableStatus] = useState<TablesStatusFilter>('todas');

  const [infoAnchorEl, setInfoAnchorEl] = useState<HTMLElement | null>(null);

  const activeControllerRef = useRef<AbortController | null>(null);
  const userToken = user?.token;

  const fetchOverview = useCallback(
    async ({
      location,
      dataset,
      label,
      demo,
      refresh,
    }: {
      location: string;
      dataset: string;
      label: string;
      demo: boolean;
      refresh: boolean;
    }) => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const headers = userToken ? { Authorization: `Bearer ${userToken}` } : {};
        const params: Record<string, string> = { location };
        if (demo) params.demo = 'true';
        if (dataset) params.dataset = dataset;
        if (label) params.label = label;
        if (refresh) params.refresh = 'true';

        const resp = await axios.get<Rc18OverviewResponse>(`${URLS.API_URL}/rc18/overview`, {
          params,
          headers,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const filtros = resp.data.filtrosDisponiveis ?? EMPTY_FILTERS;
          if (resp.data.filtrosCompletos === false) {
            // Listagem com falha ou parcial: a lista recebida pode não ter todos os valores. Junta com a
            // lista da mesma visão, mantém o filtro escolhido e mostra a resposta com os diagnósticos.
            setAvailableFilters((anterior) => mergeFilters(anterior, filtros));
          } else {
            setAvailableFilters(filtros);
            // Filtro que não existe mais no escopo (ex.: scan removido): volta para "todos" e a consulta é
            // refeita sem ele, em vez de exibir um escopo vazio com o seletor mostrando "Todos".
            const datasetAusente = Boolean(dataset) && !filtros.datasets.includes(dataset);
            const labelAusente = Boolean(label) && !filtros.labels.includes(label);
            if (datasetAusente || labelAusente) {
              if (datasetAusente) setSelectedDataset('');
              if (labelAusente) setSelectedLabel('');
              return;
            }
          }
          setOverview(resp.data);
        }
      } catch (err) {
        if (controller.signal.aborted || isCanceledError(err)) return;
        console.error('Failed to fetch RC18 overview:', err);
        setOverview(null);
        setError(messageFromError(err) ?? 'Erro ao carregar os dados do painel RC 18.');
        // Filtro recusado pela API (HTTP 400): volta para "todos" em vez de ficar preso no erro.
        if (statusFromError(err) === 400 && (dataset || label)) {
          setSelectedDataset('');
          setSelectedLabel('');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [userToken]
  );

  useEffect(() => {
    fetchOverview({
      location: selectedLocation,
      dataset: selectedDataset,
      label: selectedLabel,
      demo: demoMode,
      refresh: false,
    });
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [fetchOverview, selectedLocation, selectedDataset, selectedLabel, demoMode]);

  // Trocar de visão (localização ou modo) zera os filtros escolhidos e os disponíveis: a lista certa
  // chega com a resposta da nova visão.
  const handleLocationChange = (nextLocation: string) => {
    setSelectedLocation(nextLocation);
    setSelectedDataset('');
    setSelectedLabel('');
    setAvailableFilters(EMPTY_FILTERS);
  };

  const handleToggleDemo = () => {
    setDemoMode((prev) => !prev);
    setSelectedDataset('');
    setSelectedLabel('');
    setAvailableFilters(EMPTY_FILTERS);
  };

  const handleRefresh = () => {
    fetchOverview({
      location: selectedLocation,
      dataset: selectedDataset,
      label: selectedLabel,
      demo: demoMode,
      refresh: true,
    });
  };

  const handleOpenEntry = useCallback(
    (entryName: string, tab?: EntryTab) => {
      dispatch(clearHistory());
      dispatch(fetchEntry({ entryName, id_token: userToken || '' }));
      // `tab` abre direto uma aba nativa do Business UI em /view-details (ex.: Lineage).
      navigate(`/view-details?entry=${encodeURIComponent(btoa(entryName))}${tab ? `&tab=${tab}` : ''}`);
    },
    [dispatch, navigate, userToken]
  );

  const downloadEvidence = () => {
    if (!overview) return;
    const geradoEm = new Date().toISOString();
    const payload = {
      geradoEm,
      aviso: overview.norma?.aviso ?? null,
      ...overview,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rc18-evidencias-${overview.demo ? 'exemplo' : overview.projectId}-${geradoEm.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const isDemo = Boolean(overview?.demo ?? demoMode);
  const identityMode = overview?.identityMode;
  const identityLabel =
    identityMode === 'service_account'
      ? 'Conta de serviço do aplicativo'
      : identityMode === 'adc_dev'
      ? 'Credenciais locais (desenvolvimento)'
      : 'Permissões do usuário conectado';

  const availableDatasets = availableFilters.datasets;
  const availableLabels = availableFilters.labels;
  const safeDataset = availableDatasets.includes(selectedDataset) ? selectedDataset : '';
  const safeLabel = availableLabels.includes(selectedLabel) ? selectedLabel : '';
  const failedCount = overview?.resumoNaoConformidades?.totalRegrasReprovadas ?? 0;

  return (
    <Box
      data-testid="rc18-dashboard-root"
      sx={{
        backgroundColor: '#F8FAFC',
        minHeight: '100%',
        width: '100%',
        boxSizing: 'border-box',
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 3 },
      }}
    >
      <Box sx={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Cabeçalho enxuto no padrão KC Business UI */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <Typography
                component="h1"
                sx={{
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 600,
                  fontSize: { xs: '18px', sm: '24px' },
                  lineHeight: 1.25,
                  color: '#1F1F1F',
                }}
              >
                Qualidade das Informações (RC 18)
              </Typography>
              <IconButton
                size="small"
                aria-label="Sobre o normativo"
                aria-haspopup="true"
                aria-expanded={Boolean(infoAnchorEl)}
                aria-controls={infoAnchorEl ? 'rc18-normativo-popover' : undefined}
                onClick={(e) => setInfoAnchorEl(e.currentTarget)}
                sx={{ color: '#575757' }}
              >
                <InfoIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: '12.5px', color: '#575757', mt: '2px' }}>
              Evidências técnicas de apoio — não atesta conformidade regulatória.{' '}
              {overview?.norma?.url && (
                <Link
                  href={overview.norma.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: '#0B57D0', fontWeight: 500 }}
                >
                  Texto do normativo
                </Link>
              )}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <Button
              size="small"
              variant={demoMode ? 'contained' : 'outlined'}
              startIcon={<DemoIcon />}
              onClick={handleToggleDemo}
              disabled={loading}
              sx={{
                textTransform: 'none',
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                borderRadius: '8px',
                ...(demoMode
                  ? { backgroundColor: '#0B57D0', boxShadow: 'none', '&:hover': { backgroundColor: '#0842A0' } }
                  : { color: '#1F1F1F', borderColor: '#D6D9E8', backgroundColor: '#FFFFFF' }),
              }}
            >
              {demoMode ? 'Voltar ao projeto' : 'Exemplo sintético'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadEvidence}
              disabled={loading || Boolean(error) || !overview}
              sx={{
                textTransform: 'none',
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                borderRadius: '8px',
                color: '#1F1F1F',
                borderColor: '#D6D9E8',
                backgroundColor: '#FFFFFF',
              }}
            >
              Baixar evidências (JSON)
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading}
              sx={{
                textTransform: 'none',
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                borderRadius: '8px',
                backgroundColor: '#0B57D0',
                boxShadow: 'none',
                '&:hover': { backgroundColor: '#0842A0', boxShadow: 'none' },
              }}
            >
              Atualizar
            </Button>
          </Box>
        </Box>

        {/* Popover normativo acessível por clique/teclado */}
        <Popover
          id="rc18-normativo-popover"
          open={Boolean(infoAnchorEl)}
          anchorEl={infoAnchorEl}
          onClose={() => setInfoAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          PaperProps={{
            sx: { maxWidth: '420px', p: '16px 18px', borderRadius: '12px', border: '1px solid #E8EEF5' },
          }}
        >
          <Typography sx={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 500, fontSize: '14px', color: '#1F1F1F' }}>
            {overview?.norma?.nome ?? 'Resolução Conjunta nº 18, de 28 de novembro de 2025'}
          </Typography>
          <Typography sx={{ fontSize: '12.5px', color: '#444746', mt: '6px', lineHeight: 1.5 }}>
            {overview?.norma?.aviso ??
              'Os indicadores deste painel são evidências técnicas de apoio à política de qualidade das informações.'}
          </Typography>
          {overview?.norma?.prazoAdequacao && (
            <Typography sx={{ fontSize: '12px', color: '#575757', mt: '8px' }}>
              Prazo de adequação: {formatIsoDate(overview.norma.prazoAdequacao)}
            </Typography>
          )}
          {overview?.norma?.url && (
            <Link
              href={overview.norma.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'inline-block', mt: '8px', fontSize: '12.5px', color: '#0B57D0', fontWeight: 500 }}
            >
              Texto do normativo
            </Link>
          )}
        </Popover>

        {/* Barra única de filtros de escopo + metadados de sessão */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8EEF5',
            borderRadius: '12px',
            padding: '12px 16px',
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: '1 1 320px' }}>
            <TextField
              select
              size="small"
              label="Localização"
              value={selectedLocation}
              onChange={(e) => handleLocationChange(e.target.value)}
              sx={{ minWidth: { xs: '100%', sm: '200px' }, backgroundColor: '#FFFFFF' }}
            >
              {AVAILABLE_REGIONS.map((reg) => (
                <MenuItem key={reg.value} value={reg.value}>
                  {reg.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Dataset"
              value={safeDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              disabled={loading || availableDatasets.length === 0}
              sx={{ minWidth: { xs: '100%', sm: '185px' }, backgroundColor: '#FFFFFF' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">Todos os datasets</MenuItem>
              {availableDatasets.map((ds) => (
                <MenuItem key={ds} value={ds}>
                  {ds}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Label do scan"
              value={safeLabel}
              onChange={(e) => setSelectedLabel(e.target.value)}
              disabled={loading || availableLabels.length === 0}
              sx={{ minWidth: { xs: '100%', sm: '185px' }, backgroundColor: '#FFFFFF' }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">Todas as labels</MenuItem>
              {availableLabels.map((lbl) => (
                <MenuItem key={lbl} value={lbl}>
                  {lbl}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {isDemo ? (
              <Chip
                label="Dados de exemplo (sintéticos)"
                size="small"
                sx={{ backgroundColor: '#FEF7E0', color: '#B06000', fontWeight: 500, fontSize: '12px' }}
              />
            ) : (
              overview && (
                <>
                  <Chip
                    label={overview.projectId}
                    size="small"
                    sx={{ backgroundColor: '#E8F0FE', color: '#0B57D0', fontWeight: 500, fontSize: '12px' }}
                  />
                  <Chip
                    label={identityLabel}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '12px', color: '#444746', borderColor: '#D6D9E8' }}
                  />
                </>
              )
            )}
          </Box>
        </Box>

        {/* Abas principais (2 visões) */}
        <Box sx={{ borderBottom: '1px solid #E8EEF5' }}>
          <Tabs
            value={activeTab}
            onChange={(_, val: number) => setActiveTab(val)}
            aria-label="Visões do painel RC 18"
            sx={{
              minHeight: '42px',
              '& .MuiTabs-indicator': { backgroundColor: '#0B57D0' },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                minHeight: '42px',
                color: '#575757',
                '&.Mui-selected': { color: '#0B57D0' },
              },
            }}
          >
            <Tab id="rc18-tab-0" aria-controls="rc18-tabpanel-0" label="Visão geral" />
            <Tab
              id="rc18-tab-1"
              aria-controls="rc18-tabpanel-1"
              label={
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span>Não conformidades e regras</span>
                  {failedCount > 0 && (
                    <Box
                      component="span"
                      sx={{
                        px: '7px',
                        py: '1px',
                        borderRadius: '10px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        backgroundColor: '#FCE8E6',
                        color: '#C5221F',
                      }}
                    >
                      {failedCount}
                    </Box>
                  )}
                </Box>
              }
            />
          </Tabs>
        </Box>

        {error && (
          <Alert severity="error" sx={{ borderRadius: '10px' }}>
            {error}
          </Alert>
        )}

        {!isDemo && overview && overview.diagnostics.length > 0 && (
          <Alert severity="warning" sx={{ borderRadius: '10px' }}>
            <strong>{overview.diagnostics.length} consulta(s) a APIs falharam.</strong> Os dados exibidos estão
            incompletos.
            {overview.diagnostics.slice(0, 5).map((d, i) => (
              <Box key={i} sx={{ fontSize: '12px', mt: 0.5 }}>
                • {d.fonte} [{d.local}]: {d.mensagem}
              </Box>
            ))}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '260px' }}>
            <CircularProgress size={40} sx={{ color: '#0B57D0' }} />
          </Box>
        ) : error || !overview ? null : (
          <>
            {activeTab === 0 && (
              <Box role="tabpanel" id="rc18-tabpanel-0" aria-labelledby="rc18-tab-0">
                <RC18DimensionsOverview
                  overview={overview}
                  onShowDimensionRules={(dimensionId, onlyFailed) => {
                    setRulesDimension(dimensionId);
                    setRulesStatus(onlyFailed ? 'reprovadas' : 'todas');
                    setQualitySubView('regras');
                    setActiveTab(1);
                  }}
                  onJumpToFailedRules={() => {
                    setRulesDimension('');
                    setRulesStatus('reprovadas');
                    setQualitySubView('regras');
                    setActiveTab(1);
                  }}
                  onJumpToFailedTables={() => {
                    setTableStatus('com_falhas');
                    setQualitySubView('tabelas');
                    setActiveTab(1);
                  }}
                  onJumpToStaleTables={() => {
                    setTableStatus('desatualizados');
                    setQualitySubView('tabelas');
                    setActiveTab(1);
                  }}
                  onJumpToGovernanceGaps={() => {
                    setTableStatus('lacunas_governanca');
                    setQualitySubView('tabelas');
                    setActiveTab(1);
                  }}
                />
              </Box>
            )}

            {activeTab === 1 && (
              <Box role="tabpanel" id="rc18-tabpanel-1" aria-labelledby="rc18-tab-1">
                <RC18QualityByTable
                  groups={overview.dimensionGroups}
                  unmappedRules={overview.unmappedRules}
                  tables={overview.tableSummaries}
                  catalogByTable={overview.catalogByTable}
                  isDemo={isDemo}
                  subView={qualitySubView}
                  onSubViewChange={setQualitySubView}
                  dimensionFilter={rulesDimension}
                  onDimensionFilterChange={setRulesDimension}
                  statusFilter={rulesStatus}
                  onStatusFilterChange={setRulesStatus}
                  tableStatusFilter={tableStatus}
                  onTableStatusFilterChange={setTableStatus}
                  onOpenEntry={handleOpenEntry}
                  emptyText={escopoVazioTexto(overview.escopo)}
                />
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default RC18Dashboard;

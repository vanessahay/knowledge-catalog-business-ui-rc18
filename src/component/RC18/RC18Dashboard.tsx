import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Button,
  Tabs,
  Tab,
  Alert,
  TextField,
  MenuItem,
  Stack
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HubIcon from '@mui/icons-material/Hub';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SecurityIcon from '@mui/icons-material/Security';
import GppGoodIcon from '@mui/icons-material/GppGood';
import KeyIcon from '@mui/icons-material/Key';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CodeIcon from '@mui/icons-material/Code';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import axios from 'axios';
import { useAuth } from '../../auth/AuthProvider';
import { URLS } from '../../constants/urls';
import RC18DimensionsOverview from './RC18DimensionsOverview';
import { type Rc18DimensionsReport, type Rc18Diagnostic, formatCount, formatPct } from './rc18Types';

interface RuleDetail {
  ruleName: string;
  column: string;
  table: string;
  dataset?: string;
  executed?: boolean;
  passed: boolean | null;
  evaluatedCount: number | null;
  passedCount: number | null;
  failedCount: number | null;
  passPercentage: number | null;
  dimension: string;
  description?: string;
  executionTime?: string;
}

interface DimensionData {
  name: string;
  group: string;
  scorePct: number | null;
  rulesEvaluated: number;
  rulesPassed: number;
  rules: RuleDetail[];
  description: string;
  productGcp?: string;
}

interface TableSummary {
  dataset: string;
  table: string;
  fullTableName: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  notExecutedRules?: number;
  accuracyScore: number | null;
  completenessScore: number | null;
  consistencyScore: number | null;
  overallScore: number | null;
  lastExecutionTime?: string;
  status: 'Sem falhas' | 'Com falhas' | 'Sem execução';
}

interface CatalogContextItem {
  entryId: string;
  displayName: string;
  linkedResource: string;
  entryGroup: string;
  entryLocation?: string;
  aspectTypes: string[];
  hasScorecardAspect?: boolean;
  scorecardScore?: number | null;
  contactsCount?: number | null;
  hasOverview?: boolean | null;
  queries30d?: number | null;
  found?: boolean;
  error?: string | null;
  governanceDomain: string;
  dataQualityScore: number | null;
  complianceStatus: 'Sem falhas' | 'Com falhas' | 'Sem execução';
  lastLookupTime: string;
}

interface DlpFinding {
  dataset: string;
  table: string;
  fullTableName: string;
  column: string;
  infoType: string;
  infoTypeDisplayName: string;
  category: string;
  likelihood: string;
  estimatedOccurrences: number | null;
  sensitivity: 'Alta' | 'Média' | 'Baixa';
  policyTagApplied: boolean;
  policyTagName?: string;
  recommendation: string;
}

interface DlpTableRiskProfile {
  dataset: string;
  table: string;
  fullTableName: string;
  totalSensitiveColumns: number;
  highSensitivityColumns: number;
  detectedInfoTypes: string[];
  categories: string[];
  maskingCoveragePct: number;
  taggedColumns?: number;
  complianceStatus: string;
}

interface DlpSummary {
  totalTablesScanned: number;
  tablesWithSensitiveData: number;
  totalPiiFieldsDetected: number;
  bankingSecrecyFields: number;
  highSensitivityFieldsCount: number;
  protectedWithPolicyTagsCount: number;
  overallProtectionCoveragePct: number | null;
  highRiskTablesCount: number;
  complianceLevel: string;
}

interface InfoTypeDistributionItem {
  infoType: string;
  displayName: string;
  count: number;
  category: string;
}

interface DlpResponse {
  success: boolean;
  isDemoFallback?: boolean;
  demo?: boolean;
  identityMode?: string;
  diagnostics?: Rc18Diagnostic[];
  projectId?: string;
  timestamp: string;
  location: string;
  summary: DlpSummary;
  infoTypeDistribution: InfoTypeDistributionItem[];
  findings: DlpFinding[];
  tableRiskProfiles: DlpTableRiskProfile[];
  metodo?: string;
  aviso?: string;
  perfisSensitiveDataProtection?: {
    consultado: boolean;
    local: string | null;
    quantidade: number | null;
    haMais: boolean;
    erro: string | null;
  };
}

interface LineageNode {
  id: string;
  label: string;
  type: 'source' | 'process' | 'table' | 'target';
  layer?: string;
  system?: string;
  engine?: string | null;
  schedule?: string | null;
  script?: string | null;
  dataset?: string;
  table?: string;
  rows?: string | null;
  sensitivity?: string;
  qualityScore?: number | null;
  regulatoryEntity?: string;
  deadline?: string | null;
  frequency?: string | null;
  processId?: string | null;
}

interface LineageEdge {
  source: string;
  target: string;
  label?: string;
}

interface PipelineDetail {
  table: string;
  sourceSystem: string;
  ingestionType: string;
  transformationEngine: string;
  pipelineName: string | null;
  lastRunTime: string | null;
  regulatoryTargets: string[];
  traceabilityStatus: string;
  hasUpstream: boolean;
  columnLineageCount: number;
  complianceNote: string;
}

interface LineageSummary {
  totalTablesAudited: number;
  fullyTraceableTablesCount: number;
  partialTraceableTablesCount: number;
  traceabilityCoveragePct: number | null;
  totalTransformationPipelines: number;
  regulatoryReportsMapped: number;
  activeSourcesCount: number;
  complianceLevel: string;
}

interface LineageResponse {
  success: boolean;
  isDemoFallback?: boolean;
  demo?: boolean;
  identityMode?: string;
  diagnostics?: Rc18Diagnostic[];
  projectId?: string;
  timestamp: string;
  location: string;
  summary: LineageSummary;
  nodes: LineageNode[];
  edges: LineageEdge[];
  pipelineDetails: PipelineDetail[];
}

interface RC18Response {
  success: boolean;
  isDemoFallback?: boolean;
  demo?: boolean;
  identityMode?: string;
  diagnostics?: Rc18Diagnostic[];
  projectId?: string;
  location?: string;
  timestamp: string;
  dataset?: string;
  table?: string;
  dimensions: {
    accuracy: DimensionData;
    completeness: DimensionData;
    consistency: DimensionData;
  };
  scannedTables?: string[];
  scannedSourceTables?: string[];
  tableSummaries?: TableSummary[];
  centralizedCatalogContext?: CatalogContextItem[];
  lookupContextYaml?: string | null;
  totalScansFound?: number;
  totalRulesEvaluated?: number;
}

const AVAILABLE_REGIONS = [
  { value: 'global', label: 'Todas as localizações' },
  { value: 'southamerica-east1', label: 'southamerica-east1 (América do Sul - São Paulo)' },
  { value: 'us-central1', label: 'us-central1 (EUA Central - Iowa)' },
  { value: 'us-east1', label: 'us-east1 (EUA Leste - Carolina do Sul)' },
  { value: 'us-east4', label: 'us-east4 (EUA Leste - Virgínia)' },
  { value: 'us-west1', label: 'us-west1 (EUA Oeste - Oregon)' },
  { value: 'europe-west1', label: 'europe-west1 (Europa Ocidental - Bélgica)' },
  { value: 'asia-east1', label: 'asia-east1 (Ásia Leste - Taiwan)' }
];

/** Mensagem devolvida pela API (ou pelo cliente HTTP), quando houver. */
const messageFromError = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { response?: { data?: { message?: unknown } }; message?: unknown };
  const apiMessage = e.response?.data?.message;
  if (typeof apiMessage === 'string' && apiMessage) return apiMessage;
  return typeof e.message === 'string' && e.message ? e.message : undefined;
};

const RC18Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RC18Response | null>(null);
  const [dlpData, setDlpData] = useState<DlpResponse | null>(null);
  const [lineageData, setLineageData] = useState<LineageResponse | null>(null);
  const [dimsData, setDimsData] = useState<Rc18DimensionsReport | null>(null);
  // Dados sintéticos só aparecem quando o usuário pede explicitamente.
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [dlpTab, setDlpTab] = useState<number>(0);
  const [lineageTab, setLineageTab] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'dimensions' | 'by_table' | 'dlp_privacy' | 'lineage_traceability' | 'centralized'>('dimensions');
  const [selectedLineageTable, setSelectedLineageTable] = useState<string | null>(null);

  // Knowledge Catalog & Cloud DLP Selection State (defaults to multi-region discovery)
  const [selectedLocation, setSelectedLocation] = useState<string>('global');

  // Carrega as visões em paralelo; `rid` agrupa as chamadas de um mesmo carregamento no backend.
  const fetchFrameworkData = async (location: string = selectedLocation, demo: boolean = demoMode) => {
    setLoading(true);
    setError(null);
    setDimsData(null);
    setData(null);
    setDlpData(null);
    setLineageData(null);
    try {
      const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
      const params = {
        location,
        demo: demo ? 'true' : undefined,
        rid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };
      const [dimRes, dqRes, dlpRes, linRes] = await Promise.all([
        axios.get(`${URLS.API_URL}/rc18/dimensions`, { params, headers }),
        axios.get(`${URLS.API_URL}/rc18/data-quality-dimensions`, { params, headers }),
        axios.get(`${URLS.API_URL}/rc18/dlp-sensitive-data`, { params, headers }),
        axios.get(`${URLS.API_URL}/rc18/lineage-traceability`, { params, headers })
      ]);
      setDimsData(dimRes.data);
      setData(dqRes.data);
      setDlpData(dlpRes.data);
      setLineageData(linRes.data);
    } catch (err) {
      console.error('Failed to fetch RC18 framework data:', err);
      setError(messageFromError(err) ?? 'Erro ao carregar os dados do painel RC 18.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFrameworkData(selectedLocation);
  }, []);

  const handleAnalyze = () => {
    fetchFrameworkData(selectedLocation);
  };

  const toggleDemo = () => {
    const next = !demoMode;
    setDemoMode(next);
    fetchFrameworkData(selectedLocation, next);
  };

  const accuracy = data?.dimensions?.accuracy;
  const completeness = data?.dimensions?.completeness;
  const consistency = data?.dimensions?.consistency;

  const tableSummariesList: TableSummary[] = data?.tableSummaries ?? [];
  const centralizedContextList: CatalogContextItem[] = data?.centralizedCatalogContext ?? [];

  const isDemo = !!(dimsData?.demo ?? data?.demo);
  const identityMode = dimsData?.identityMode ?? data?.identityMode;
  const identityLabel =
    identityMode === 'service_account'
      ? 'Consultado com a conta de serviço do aplicativo'
      : identityMode === 'adc_dev'
      ? 'Consultado com as credenciais locais (desenvolvimento)'
      : 'Consultado com as permissões do usuário conectado';
  const allDiagnostics: Rc18Diagnostic[] = Array.from(
    new Map(
      [
        ...(dimsData?.diagnostics ?? []),
        ...(data?.diagnostics ?? []),
        ...(dlpData?.diagnostics ?? []),
        ...(lineageData?.diagnostics ?? [])
      ].map((d) => [`${d.fonte}|${d.local}|${d.mensagem}`, d] as const)
    ).values()
  );

  // Baixa as evidências exibidas, para apoiar o relatório semestral (art. 3º, V, "b").
  // A resposta do lookupContext fica de fora: ela pode trazer valores de exemplo dos dados.
  const downloadEvidence = () => {
    if (!dimsData) return;
    const geradoEm = new Date().toISOString();
    const payload = {
      geradoEm,
      aviso: dimsData.norma?.aviso ?? null,
      dimensoes: dimsData,
      qualidadePorTabela: data ? { ...data, lookupContextYaml: undefined } : null,
      rastreabilidade: lineageData,
      dadosSensiveis: dlpData
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rc18-evidencias-${isDemo ? 'exemplo' : dimsData.projectId}-${geradoEm.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const scoreColor = (v: number | null | undefined) =>
    v === null || v === undefined ? '#5F6368' : v === 100 ? '#137333' : '#B06000';

  // Selo dos cartões: neutro quando não há execução (nunca presume aprovação nem falha).
  const renderScoreBadge = (v: number | null | undefined) => {
    const none = v === null || v === undefined;
    return (
      <Box
        sx={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: none ? '#F1F3F4' : v === 100 ? '#E6F4EA' : '#FEF7E0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {none ? (
          <RemoveCircleOutlineIcon sx={{ color: '#5F6368', fontSize: 32 }} />
        ) : v === 100 ? (
          <CheckCircleIcon sx={{ color: '#137333', fontSize: 32 }} />
        ) : (
          <WarningIcon sx={{ color: '#B06000', fontSize: 32 }} />
        )}
      </Box>
    );
  };

  const renderRuleStatus = (rule: RuleDetail) => {
    if (rule.executed === false || rule.passed === null) {
      return <Chip label="Sem execução" size="small" variant="outlined" />;
    }
    return rule.passed ? (
      <Chip icon={<CheckCircleIcon />} label="Aprovada" color="success" size="small" />
    ) : (
      <Chip icon={<WarningIcon />} label="Reprovada" color="error" size="small" />
    );
  };

  return (
    <Box
      sx={{
        width: '92%',
        maxWidth: '1400px',
        margin: '24px auto',
        paddingBottom: '40px',
        // Nomes longos de dataset/tabela quebram linha em vez de empurrar colunas para fora da tela.
        '& .MuiTableCell-root': { padding: '12px 10px' },
        '& td:first-of-type': { overflowWrap: 'anywhere', minWidth: '190px' }
      }}
    >
      {/* Header Banner */}
      <Box
        sx={{
          background: 'linear-gradient(90deg, #022FCD 0%, #1A73E8 100%)',
          color: '#FFF',
          borderRadius: '16px',
          padding: '28px 32px',
          boxShadow: '0 4px 20px rgba(2, 47, 205, 0.15)',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif', fontSize: '28px' }}>
            Painel — Qualidade das Informações (Resolução Conjunta nº 18/2025)
          </Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9, marginTop: '6px', fontSize: '15px' }}>
            Evidências técnicas das 12 dimensões do art. 2º, § 2º — Dataplex, Knowledge Catalog, Data Lineage e BigQuery
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexShrink: 0, marginLeft: '16px' }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={downloadEvidence}
            disabled={loading || !!error || !dimsData}
            sx={{
              color: '#FFF',
              borderColor: 'rgba(255,255,255,0.7)',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              '&:hover': { borderColor: '#FFF', backgroundColor: 'rgba(255,255,255,0.12)' },
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.3)' }
            }}
          >
            Baixar evidências (JSON)
          </Button>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => fetchFrameworkData(selectedLocation)}
            disabled={loading}
            sx={{
              backgroundColor: '#FFF',
              color: '#022FCD',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              '&:hover': { backgroundColor: '#E8F0FE' }
            }}
          >
            Atualizar
          </Button>
        </Stack>
      </Box>

      {/* Selector Panel: Região como filtro de escolha */}
      <Paper
        sx={{
          padding: '20px 24px',
          borderRadius: '16px',
          border: '1px solid #E0E0E0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          marginBottom: '24px',
          backgroundColor: '#F8F9FA'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '16px', color: '#1F1F1F', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StorageIcon sx={{ color: '#1A73E8' }} /> Localização do Google Cloud
        </Typography>
        <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px', fontSize: '13px' }}>
          Escolha uma localização ou todas. O escopo do painel são as tabelas com DataScan de qualidade de dados na localização escolhida.
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <TextField
            select
            fullWidth
            size="small"
            label="Região do Google Cloud (Location)"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            sx={{ backgroundColor: '#FFF', borderRadius: '8px' }}
          >
            {AVAILABLE_REGIONS.map((reg) => (
              <MenuItem key={reg.value} value={reg.value}>
                {reg.label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleAnalyze}
            disabled={loading}
            sx={{
              minWidth: '240px',
              height: '40px',
              backgroundColor: '#1A73E8',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#1557B0' }
            }}
          >
            Consultar
          </Button>
          <Button
            variant="outlined"
            onClick={toggleDemo}
            disabled={loading}
            sx={{ minWidth: '220px', height: '40px', fontWeight: 600, textTransform: 'none', borderRadius: '8px' }}
          >
            {demoMode ? 'Voltar aos dados do projeto' : 'Ver exemplo sintético'}
          </Button>
        </Stack>
      </Paper>

      {/* Seletor de visões do painel RC 18 */}
      <Paper
        sx={{
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid #E0E0E0',
          marginBottom: '24px',
          backgroundColor: '#FFF'
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <Button
            fullWidth
            variant={viewMode === 'dimensions' ? 'contained' : 'outlined'}
            startIcon={<FactCheckIcon />}
            onClick={() => setViewMode('dimensions')}
            sx={{
              py: 1.3,
              borderRadius: '10px',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
              backgroundColor: viewMode === 'dimensions' ? '#022FCD' : 'transparent',
              color: viewMode === 'dimensions' ? '#FFF' : '#5F6368',
              borderColor: '#DADCE0'
            }}
          >
            12 dimensões (art. 2º, § 2º)
          </Button>
          <Button
            fullWidth
            variant={viewMode === 'by_table' ? 'contained' : 'outlined'}
            startIcon={<AssessmentIcon />}
            onClick={() => setViewMode('by_table')}
            sx={{
              py: 1.3,
              borderRadius: '10px',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
              backgroundColor: viewMode === 'by_table' ? '#022FCD' : 'transparent',
              color: viewMode === 'by_table' ? '#FFF' : '#5F6368',
              borderColor: '#DADCE0'
            }}
          >
            Qualidade por tabela
          </Button>
          <Button
            fullWidth
            variant={viewMode === 'dlp_privacy' ? 'contained' : 'outlined'}
            startIcon={<SecurityIcon />}
            onClick={() => setViewMode('dlp_privacy')}
            sx={{
              py: 1.3,
              borderRadius: '10px',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
              backgroundColor: viewMode === 'dlp_privacy' ? '#022FCD' : 'transparent',
              color: viewMode === 'dlp_privacy' ? '#FFF' : '#5F6368',
              borderColor: '#DADCE0'
            }}
          >
            Dados sensíveis (complementar)
          </Button>
          <Button
            fullWidth
            variant={viewMode === 'lineage_traceability' ? 'contained' : 'outlined'}
            startIcon={<AccountTreeIcon />}
            onClick={() => setViewMode('lineage_traceability')}
            sx={{
              py: 1.3,
              borderRadius: '10px',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
              backgroundColor: viewMode === 'lineage_traceability' ? '#022FCD' : 'transparent',
              color: viewMode === 'lineage_traceability' ? '#FFF' : '#5F6368',
              borderColor: '#DADCE0'
            }}
          >
            Rastreabilidade (inciso X)
          </Button>
          <Button
            fullWidth
            variant={viewMode === 'centralized' ? 'contained' : 'outlined'}
            startIcon={<HubIcon />}
            onClick={() => setViewMode('centralized')}
            sx={{
              py: 1.3,
              borderRadius: '10px',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
              backgroundColor: viewMode === 'centralized' ? '#022FCD' : 'transparent',
              color: viewMode === 'centralized' ? '#FFF' : '#5F6368',
              borderColor: '#DADCE0'
            }}
          >
            Knowledge Catalog (contexto)
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ marginBottom: '24px', borderRadius: '8px' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <CircularProgress size={48} sx={{ color: '#1A73E8' }} />
        </Box>
      ) : error ? null : (
        <>
          {/* Origem dos dados e diagnósticos */}
          <Box sx={{ marginBottom: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            {/* No modo de exemplo o projeto não é exibido: os dados não vêm dele. */}
            {!isDemo && (
              <Chip
                icon={<StorageIcon style={{ fontSize: 16 }} />}
                label={`${dimsData?.projectId ?? data?.projectId ?? '—'} • ${(dimsData?.location ?? data?.location ?? 'global') === 'global' ? 'todas as localizações' : dimsData?.location ?? data?.location}`}
                size="small"
                sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600 }}
              />
            )}
            {isDemo ? (
              <Chip
                label="Dados de exemplo (sintéticos) — não representam o projeto"
                color="warning"
                size="small"
                sx={{ fontWeight: 700 }}
              />
            ) : (
              <Chip label={identityLabel} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
            )}
          </Box>

          {!isDemo && allDiagnostics.length > 0 && (
            <Alert severity="warning" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
              <strong>{allDiagnostics.length} consulta(s) a APIs falharam.</strong> Os dados abaixo estão incompletos.
              {allDiagnostics.slice(0, 5).map((d, i) => (
                <Box key={i} sx={{ fontSize: '12px', mt: 0.5 }}>
                  • {d.fonte} [{d.local}]: {d.mensagem}
                </Box>
              ))}
            </Alert>
          )}

          {viewMode === 'dimensions' && dimsData && <RC18DimensionsOverview report={dimsData} />}

          {/* VISÃO 2: CLASSIFICAÇÃO DE DADOS SENSÍVEIS E SIGILO BANCÁRIO (Cloud DLP / LGPD) */}
          {viewMode === 'dlp_privacy' && (
            <Box>
              <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
                {dlpData?.aviso ?? 'Visão complementar: não é uma das 12 dimensões da Resolução Conjunta nº 18/2025.'}
                {dlpData?.perfisSensitiveDataProtection && (
                  <Box sx={{ fontSize: '12px', mt: 0.5 }}>
                    Perfis de tabela do Sensitive Data Protection:{' '}
                    {dlpData.perfisSensitiveDataProtection.consultado
                      ? `${formatCount(dlpData.perfisSensitiveDataProtection.quantidade)}${dlpData.perfisSensitiveDataProtection.haMais ? ' ou mais' : ''} encontrado(s) em ${dlpData.perfisSensitiveDataProtection.local} (todas as tabelas do projeto, não só as do escopo)`
                      : `não consultados (${dlpData.perfisSensitiveDataProtection.erro ?? 'sem detalhe'})`}
                    .
                  </Box>
                )}
              </Alert>
              {/* DLP Executive Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      COLUNAS CANDIDATAS OU COM POLICY TAG
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {dlpData?.summary?.totalPiiFieldsDetected ?? 0}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Em {dlpData?.summary?.totalTablesScanned ?? 0} tabelas do escopo
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      ALTA SENSIBILIDADE (SIGILO / PCI)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#C5221F', my: 1 }}>
                      {dlpData?.summary?.highSensitivityFieldsCount ?? 0}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Classificação pelo nome da coluna
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      COLUNAS COM POLICY TAG
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', my: 1 }}>
                      {formatPct(dlpData?.summary?.overallProtectionCoveragePct)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      {dlpData?.summary?.protectedWithPolicyTagsCount ?? 0} de {dlpData?.summary?.totalPiiFieldsDetected ?? 0} colunas com Policy Tag
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      PENDÊNCIAS
                    </Typography>
                    <Box sx={{ my: 1.5 }}>
                      {(dlpData?.summary?.totalTablesScanned ?? 0) === 0 ? (
                        <Chip label="Nenhuma tabela inspecionada" variant="outlined" sx={{ fontWeight: 700, fontSize: '13px' }} />
                      ) : (dlpData?.summary?.highRiskTablesCount ?? 0) > 0 ? (
                        <Chip icon={<WarningIcon />} label="Há colunas sem Policy Tag" color="warning" sx={{ fontWeight: 700, fontSize: '13px' }} />
                      ) : (
                        <Chip icon={<CheckCircleIcon />} label="Nenhuma coluna candidata sem Policy Tag" color="success" sx={{ fontWeight: 700, fontSize: '13px' }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Tabelas com colunas candidatas sem Policy Tag
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* InfoTypes Tag Cloud */}
              <Paper sx={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #E0E0E0', marginBottom: '24px', backgroundColor: '#F8F9FA' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1F1F1F', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyIcon fontSize="small" sx={{ color: '#1A73E8' }} /> Categorias identificadas (pelo nome da coluna ou por Policy Tag):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(dlpData?.infoTypeDistribution || []).map((it, idx) => (
                    <Chip
                      key={idx}
                      label={`${it.displayName} (${it.category}): ${it.count.toLocaleString('pt-BR')} coluna(s)`}
                      sx={{
                        backgroundColor: it.category.includes('Sigilo') ? '#FCE8E6' : '#E8F0FE',
                        color: it.category.includes('Sigilo') ? '#C5221F' : '#1A73E8',
                        fontWeight: 600,
                        fontSize: '12px'
                      }}
                    />
                  ))}
                </Box>
              </Paper>

              {/* DLP Detailed Tabs & Tables */}
              <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#FAFAFA', px: 2 }}>
                  <Tabs
                    value={dlpTab}
                    onChange={(_, newVal) => setDlpTab(newVal)}
                    textColor="primary"
                    indicatorColor="primary"
                  >
                    <Tab label="Colunas (Policy Tags e heurística por nome)" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="Policy Tags por tabela" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {dlpTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 700 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Coluna</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tipo sugerido</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Categoria</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Sensibilidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Policy Tag</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Observação</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(dlpData?.findings || []).map((f, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 700, color: '#1A73E8' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <TableChartIcon fontSize="small" sx={{ color: '#1A73E8' }} />
                                  {f.fullTableName}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.column}</TableCell>
                              <TableCell>
                                <Chip label={f.infoTypeDisplayName} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '13px' }}>{f.category}</TableCell>
                              <TableCell>
                                <Chip
                                  label={f.sensitivity}
                                  size="small"
                                  sx={{
                                    backgroundColor: f.sensitivity === 'Alta' ? '#FCE8E6' : '#FEF7E0',
                                    color: f.sensitivity === 'Alta' ? '#C5221F' : '#B06000',
                                    fontWeight: 700
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                {f.policyTagApplied ? (
                                  <Chip icon={<GppGoodIcon />} label="Com Policy Tag" color="success" size="small" sx={{ fontWeight: 600 }} />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Sem Policy Tag" color="warning" size="small" sx={{ fontWeight: 600 }} />
                                )}
                              </TableCell>
                              <TableCell sx={{ fontSize: '12px', color: '#5F6368', maxWidth: '280px' }}>
                                {f.recommendation}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {dlpTab === 1 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela do BigQuery</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Colunas candidatas ou com Policy Tag</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Alta sensibilidade (pelo nome)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Categorias</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Colunas com Policy Tag (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Situação</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(dlpData?.tableRiskProfiles || []).map((trp, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 700, color: '#022FCD' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <TableChartIcon fontSize="small" sx={{ color: '#022FCD' }} />
                                  {trp.fullTableName}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{trp.totalSensitiveColumns}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{trp.highSensitivityColumns}</TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {trp.detectedInfoTypes.map((it, i) => (
                                    <Chip key={i} label={it} size="small" sx={{ fontSize: '11px', fontWeight: 600 }} />
                                  ))}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 800, fontSize: '14px' }}>
                                {trp.maskingCoveragePct}%
                              </TableCell>
                              <TableCell>
                                {trp.maskingCoveragePct === 100 ? (
                                  <Chip icon={<CheckCircleIcon />} label={trp.complianceStatus} color="success" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label={trp.complianceStatus} color="warning" size="small" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Paper>
            </Box>
          )}

          {/* RASTREABILIDADE (art. 2º, § 2º, X) — Data Lineage API */}
          {viewMode === 'lineage_traceability' && (
            <Box>
              {(lineageData?.pipelineDetails?.length ?? 0) === 0 ? (
                <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
                  Não há tabelas no escopo para consultar na Data Lineage API.
                </Alert>
              ) : (
                (lineageData?.summary?.fullyTraceableTablesCount ?? 0) === 0 && (
                  <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
                    A Data Lineage API não devolveu origem registrada para nenhuma das tabelas do escopo. Isso indica
                    apenas que não há elos registrados na API para essas tabelas; a tabela abaixo mostra o que foi
                    consultado.
                  </Alert>
                )
              )}
              {/* Lineage Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      TABELAS COM ORIGEM REGISTRADA (INCISO X)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {formatPct(lineageData?.summary?.traceabilityCoveragePct)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      {lineageData?.summary?.fullyTraceableTablesCount ?? 0} de {lineageData?.summary?.totalTablesAudited ?? 0} tabelas do escopo
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      PROCESSOS REGISTRADOS
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#1A73E8', my: 1 }}>
                      {lineageData?.summary?.totalTransformationPipelines ?? 0}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Processos ligados às origens na Data Lineage API
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      DESTINOS REGISTRADOS
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#137333', my: 1 }}>
                      {lineageData?.summary?.regulatoryReportsMapped ?? 0}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Ativos a jusante na Data Lineage API
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      DISPOSITIVO
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#1F1F1F', my: 1 }}>
                      Art. 2º, § 2º, X
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Indicador técnico; não atesta conformidade
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* End-to-End Visual Architecture DAG Flow */}
              <Paper sx={{ padding: '24px', borderRadius: '16px', border: '1px solid #E0E0E0', marginBottom: '24px', backgroundColor: '#FAFAFA' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F1F1F', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AccountTreeIcon sx={{ color: '#022FCD' }} /> Rastreabilidade registrada na Data Lineage API
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Origens ➔ processos ➔ tabelas do escopo ➔ destinos (somente o que está registrado na API)
                    </Typography>
                  </Box>

                  {/* Filter chips */}
                  <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <Chip
                      label="Todas as Tabelas"
                      clickable
                      color={selectedLineageTable === null ? 'primary' : 'default'}
                      onClick={() => setSelectedLineageTable(null)}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                    {(lineageData?.pipelineDetails || []).map((p, idx) => (
                      <Chip
                        key={idx}
                        label={p.table.split('.').pop()}
                        clickable
                        color={selectedLineageTable === p.table ? 'primary' : 'default'}
                        onClick={() => setSelectedLineageTable(selectedLineageTable === p.table ? null : p.table)}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    ))}
                  </Box>
                </Box>

                {/* 4-Stage Connected Flow Columns */}
                <Grid container spacing={2} alignItems="stretch">
                  {/* Stage 1: Sources */}
                  <Grid size={{ xs: 12, md: 3 }}>
                    <Paper sx={{ p: 2, height: '100%', backgroundColor: '#FFF', borderRadius: '12px', border: '1px solid #DADCE0' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1A73E8', mb: 2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <StorageIcon fontSize="small" /> 1. Origens registradas
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'source') || []).length === 0 && (
                          <Typography variant="caption" sx={{ color: '#5F6368' }}>
                            Nenhum registro.
                          </Typography>
                        )}
                        {(lineageData?.nodes?.filter(n => n.type === 'source') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#F8F9FA', border: '1px solid #E8EAED' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#202124', fontSize: '13px', overflowWrap: 'anywhere' }}>
                              {node.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#5F6368', display: 'block' }}>
                              Sistema: {node.system}
                            </Typography>
                            <Chip label={node.layer} size="small" sx={{ mt: 0.5, height: '20px', fontSize: '11px', backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600 }} />
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  </Grid>

                  {/* Stage 2: Transformation Processes */}
                  <Grid size={{ xs: 12, md: 3 }}>
                    <Paper sx={{ p: 2, height: '100%', backgroundColor: '#FFF', borderRadius: '12px', border: '1px solid #DADCE0' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#7E22CE', mb: 2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CodeIcon fontSize="small" /> 2. Processos
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'process') || []).length === 0 && (
                          <Typography variant="caption" sx={{ color: '#5F6368' }}>
                            Nenhum registro.
                          </Typography>
                        )}
                        {(lineageData?.nodes?.filter(n => n.type === 'process') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#581C87', fontSize: '13px', overflowWrap: 'anywhere' }}>
                              {node.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block' }}>
                              {node.engine ? `Origem do processo: ${node.engine}` : 'Origem do processo não informada'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', fontSize: '11px' }}>
                              {node.schedule ? `Frequência: ${node.schedule}` : ''}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  </Grid>

                  {/* Stage 3: Curated BigQuery Tables */}
                  <Grid size={{ xs: 12, md: 3 }}>
                    <Paper sx={{ p: 2, height: '100%', backgroundColor: '#FFF', borderRadius: '12px', border: '1px solid #DADCE0' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#022FCD', mb: 2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TableChartIcon fontSize="small" /> 3. Tabelas do escopo
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'table') || []).length === 0 && (
                          <Typography variant="caption" sx={{ color: '#5F6368' }}>
                            Nenhum registro.
                          </Typography>
                        )}
                        {(lineageData?.nodes?.filter(n => n.type === 'table') || []).map((node, idx) => (
                          <Box
                            key={idx}
                            onClick={() => setSelectedLineageTable(selectedLineageTable === `${node.dataset}.${node.table}` ? null : `${node.dataset}.${node.table}`)}
                            sx={{
                              p: 1.5,
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: selectedLineageTable === `${node.dataset}.${node.table}` ? '#E8F0FE' : '#F8F9FA',
                              border: selectedLineageTable === `${node.dataset}.${node.table}` ? '2px solid #1A73E8' : '1px solid #E8EAED',
                              transition: 'all 0.2s',
                              '&:hover': { borderColor: '#1A73E8' }
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#022FCD', fontSize: '13px', overflowWrap: 'anywhere' }}>
                              {node.label}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#5F6368' }}>
                                {node.rows ? `${node.rows} linhas` : 'BigQuery'}
                              </Typography>
                              <Chip
                                label={node.qualityScore === null || node.qualityScore === undefined ? 'Regras: sem execução' : `Regras aprovadas: ${formatPct(node.qualityScore)}`}
                                size="small"
                                color={node.qualityScore === null || node.qualityScore === undefined ? 'default' : node.qualityScore === 100 ? 'success' : 'warning'}
                                sx={{ height: '20px', fontSize: '11px', fontWeight: 700 }}
                              />
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  </Grid>

                  {/* Stage 4: Regulatory Targets BACEN */}
                  <Grid size={{ xs: 12, md: 3 }}>
                    <Paper sx={{ p: 2, height: '100%', backgroundColor: '#FFF', borderRadius: '12px', border: '1px solid #DADCE0' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#137333', mb: 2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FactCheckIcon fontSize="small" /> 4. Destinos registrados
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'target') || []).length === 0 && (
                          <Typography variant="caption" sx={{ color: '#5F6368' }}>
                            Nenhum registro.
                          </Typography>
                        )}
                        {(lineageData?.nodes?.filter(n => n.type === 'target') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#14532D', fontSize: '13px', overflowWrap: 'anywhere' }}>
                              {node.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#15803D', display: 'block' }}>
                              {node.regulatoryEntity}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#4B5563', display: 'block', fontSize: '11px' }}>
                              {node.deadline ? `Periodicidade: ${node.deadline}` : ''}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  </Grid>
                </Grid>
              </Paper>

              {/* Lineage Detailed Tabs & Tables */}
              <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#FAFAFA', px: 2 }}>
                  <Tabs
                    value={lineageTab}
                    onChange={(_, newVal) => setLineageTab(newVal)}
                    textColor="primary"
                    indicatorColor="primary"
                  >
                    <Tab label="Rastreabilidade por tabela" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="Processos registrados" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {lineageTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 750 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela do escopo</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Origem registrada</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tipo de processo</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Destinos registrados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Elos</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Situação</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Observação</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(lineageData?.pipelineDetails || [])
                            .filter(p => selectedLineageTable === null || p.table === selectedLineageTable)
                            .map((p, idx) => (
                              <TableRow key={idx} hover>
                                <TableCell sx={{ fontWeight: 700, color: '#022FCD' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <TableChartIcon fontSize="small" sx={{ color: '#022FCD' }} />
                                    {p.table}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.sourceSystem}</Typography>
                                  <Typography variant="caption" sx={{ color: '#5F6368' }}>{p.ingestionType}</Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip label={p.transformationEngine} size="small" sx={{ fontWeight: 600, backgroundColor: '#F3E8FF', color: '#7E22CE' }} />
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {p.regulatoryTargets.map((t, i) => (
                                      <Chip key={i} label={t} size="small" sx={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#E6F4EA', color: '#137333' }} />
                                    ))}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>
                                  {p.columnLineageCount}
                                </TableCell>
                                <TableCell>
                                  <Chip label={p.traceabilityStatus} color={p.hasUpstream ? 'success' : 'warning'} size="small" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell sx={{ fontSize: '12px', color: '#5F6368', maxWidth: '280px' }}>
                                  {p.complianceNote}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {lineageTab === 1 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 700 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Processo / Pipeline</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Origem (sourceType)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Agendamento</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Nome de origem</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Identificador</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(lineageData?.nodes?.filter(n => n.type === 'process') || []).map((proc, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 700, color: '#7E22CE', fontFamily: 'monospace' }}>
                                {proc.label}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{proc.engine || '—'}</TableCell>
                              <TableCell>
                                {proc.schedule ? <Chip label={proc.schedule} size="small" variant="outlined" sx={{ fontWeight: 600 }} /> : 'não informado pela API'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>
                                {proc.script || '—'}
                              </TableCell>
                              <TableCell>
                                {proc.processId || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Paper>
            </Box>
          )}

          {/* VISÃO 4: VISÃO CENTRALIZADA (Knowledge Catalog lookupContext) */}
          {viewMode === 'centralized' && (
            <Box>
              {isDemo && (
                <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
                  No modo de exemplo as entradas são sintéticas e o método lookupContext não é chamado.
                </Alert>
              )}
              {/* Centralized Catalog Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      TABELAS DO ESCOPO NO CATÁLOGO
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {centralizedContextList.filter((c) => c.found !== false).length} de {centralizedContextList.length}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Entradas encontradas (GetEntry)
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      DATASETS NO ESCOPO
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#137333', my: 1 }}>
                      {new Set(centralizedContextList.map(c => c.governanceDomain)).size}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Datasets das tabelas do escopo
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      ENTRADAS COM SCORECARD DE QUALIDADE
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#1A73E8', my: 1 }}>
                      {centralizedContextList.filter((c) => c.hasScorecardAspect).length}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Entradas com o aspecto data-quality-scorecard
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Centralized Catalog Context Table */}
              <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                <Box sx={{ backgroundColor: '#F8F9FA', px: 3, py: 2, borderBottom: '1px solid #E0E0E0' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '17px', color: '#1F1F1F' }}>
                    Entradas do Knowledge Catalog das tabelas do escopo
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                    Aspectos lidos com GetEntry (contatos, documentação, uso e scorecard); regras de qualidade vindas dos
                    DataScans. Contatos alimentam o indicador de acessibilidade (inciso I) e as consultas, o de relevância
                    (inciso XI).
                  </Typography>
                </Box>
                <TableContainer>
                  <Table sx={{ minWidth: 700 }} title="Entradas do Knowledge Catalog">
                    <TableHead sx={{ backgroundColor: '#FAFAFA' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Entrada (tabela • dataset)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Aspectos na entrada</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Contatos</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Consultas (30 dias)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Regras aprovadas (%)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Regras de qualidade</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {centralizedContextList.map((item, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ fontWeight: 700, color: '#022FCD' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <HubIcon fontSize="small" sx={{ color: '#022FCD' }} />
                              <Box>
                                {item.displayName}
                                <Typography variant="caption" sx={{ display: 'block', color: '#5F6368', fontWeight: 400 }}>
                                  {item.governanceDomain} • {item.entryGroup}
                                  {item.entryLocation ? ` • ${item.entryLocation}` : ''}
                                </Typography>
                                {item.found === false && (
                                  <Typography variant="caption" sx={{ display: 'block', color: '#B06000', fontWeight: 400 }}>
                                    Entrada não lida: {item.error ?? 'sem detalhe'}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {item.aspectTypes.map((asp, i) => (
                                <Chip
                                  key={i}
                                  label={asp}
                                  size="small"
                                  sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontSize: '11px', fontWeight: 600 }}
                                />
                              ))}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{item.found === false ? '—' : formatCount(item.contactsCount)}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {item.found === false ? '—' : item.queries30d === null || item.queries30d === undefined ? 'não informado' : formatCount(item.queries30d)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: '15px' }}>
                            {formatPct(item.dataQualityScore)}
                          </TableCell>
                          <TableCell>
                            {item.complianceStatus === 'Sem falhas' ? (
                              <Chip icon={<CheckCircleIcon />} label="Sem falhas" color="success" size="small" />
                            ) : item.complianceStatus === 'Com falhas' ? (
                              <Chip icon={<WarningIcon />} label="Com falhas" color="warning" size="small" />
                            ) : (
                              <Chip label="Sem execução" size="small" variant="outlined" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {data?.lookupContextYaml && (
                <Paper sx={{ mt: 3, borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                  <Box sx={{ backgroundColor: '#F8F9FA', px: 3, py: 2, borderBottom: '1px solid #E0E0E0' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1F1F1F' }}>
                      Resposta do método lookupContext (YAML)
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#5F6368' }}>
                      Contexto devolvido pela API para as entradas acima (até 10 por localização).
                    </Typography>
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 2.5,
                      maxHeight: '320px',
                      overflow: 'auto',
                      backgroundColor: '#0F172A',
                      color: '#E2E8F0',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      lineHeight: 1.5
                    }}
                  >
                    {data.lookupContextYaml}
                  </Box>
                </Paper>
              )}
            </Box>
          )}

          {/* VISÃO 2: VISÃO DE QUALIDADE DE DADOS POR TABELA */}
          {viewMode === 'by_table' && (
            <Box>
              {tableSummariesList.length === 0 && (
                <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
                  Nenhum DataScan de qualidade de dados encontrado para este projeto e localização.
                </Alert>
              )}
              {/* Executive Overview Cards for Dimensions 1, 2 & 3 */}
              <Grid container spacing={3} sx={{ marginBottom: '32px' }}>
                {/* Dimensão 1: Acurácia */}
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      borderRadius: '16px',
                      border: '1px solid #E0E0E0',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }
                    }}
                  >
                    <CardContent sx={{ padding: '24px' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Chip
                            label="Inciso II • art. 2º, § 2º"
                            size="small"
                            sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Acurácia
                          </Typography>
                        </Box>
                        {renderScoreBadge(accuracy?.scorePct)}
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {formatPct(accuracy?.scorePct)}
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {accuracy?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras aprovadas:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#1F1F1F' }}>
                          {accuracy?.rulesPassed ?? 0} / {accuracy?.rulesEvaluated ?? 0}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Dimensão 2: Completude */}
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      borderRadius: '16px',
                      border: '1px solid #E0E0E0',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }
                    }}
                  >
                    <CardContent sx={{ padding: '24px' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Chip
                            label="Inciso VI • art. 2º, § 2º"
                            size="small"
                            sx={{ backgroundColor: '#E6F4EA', color: '#137333', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Completude
                          </Typography>
                        </Box>
                        {renderScoreBadge(completeness?.scorePct)}
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {formatPct(completeness?.scorePct)}
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {completeness?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras aprovadas:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#1F1F1F' }}>
                          {completeness?.rulesPassed ?? 0} / {completeness?.rulesEvaluated ?? 0}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Dimensão 3: Consistência */}
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      borderRadius: '16px',
                      border: '1px solid #E0E0E0',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }
                    }}
                  >
                    <CardContent sx={{ padding: '24px' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Chip
                            label="Inciso VIII • art. 2º, § 2º"
                            size="small"
                            sx={{ backgroundColor: '#F3E8FF', color: '#7E22CE', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Consistência
                          </Typography>
                        </Box>
                        {renderScoreBadge(consistency?.scorePct)}
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {formatPct(consistency?.scorePct)}
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {consistency?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras aprovadas:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#1F1F1F' }}>
                          {consistency?.rulesPassed ?? 0} / {consistency?.rulesEvaluated ?? 0}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Detailed Rules Table with Tabs */}
              <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#FAFAFA', px: 2 }}>
                  <Tabs
                    value={activeTab}
                    onChange={(_, newValue) => setActiveTab(newValue)}
                    textColor="primary"
                    indicatorColor="primary"
                  >
                    <Tab label="Regras por tabela" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="Acurácia (II)" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                    <Tab label="Completude (VI)" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                    <Tab label="Consistência (VIII)" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {activeTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela (dataset.tabela)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Acurácia (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Completude (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Consistência (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Regras aprovadas (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Regras (Aprovadas/Total)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Situação</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tableSummariesList.map((ts, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 700, color: '#1A73E8' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <TableChartIcon fontSize="small" sx={{ color: '#1A73E8' }} />
                                  {ts.fullTableName}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600, color: scoreColor(ts.accuracyScore) }}>
                                {formatPct(ts.accuracyScore)}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600, color: scoreColor(ts.completenessScore) }}>
                                {formatPct(ts.completenessScore)}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600, color: scoreColor(ts.consistencyScore) }}>
                                {formatPct(ts.consistencyScore)}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 800, fontSize: '15px' }}>
                                {formatPct(ts.overallScore)}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={`${ts.passedRules} / ${ts.totalRules}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>
                              <TableCell>
                                {ts.status === 'Sem falhas' ? (
                                  <Chip icon={<CheckCircleIcon />} label="Sem falhas" color="success" size="small" />
                                ) : ts.status === 'Com falhas' ? (
                                  <Chip icon={<WarningIcon />} label="Com falhas" color="warning" size="small" />
                                ) : (
                                  <Chip label="Sem execução" size="small" variant="outlined" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {activeTab === 1 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Nome da Regra</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Coluna</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Registros Avaliados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Linhas aprovadas (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {accuracy?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{formatCount(rule.evaluatedCount)}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{formatPct(rule.passPercentage)}</TableCell>
                              <TableCell>
                                {renderRuleStatus(rule)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {activeTab === 2 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Nome da Regra</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Coluna</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Registros Avaliados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Linhas aprovadas (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {completeness?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{formatCount(rule.evaluatedCount)}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{formatPct(rule.passPercentage)}</TableCell>
                              <TableCell>
                                {renderRuleStatus(rule)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {activeTab === 3 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Nome da Regra</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Coluna</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Registros Avaliados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Linhas aprovadas (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {consistency?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{formatCount(rule.evaluatedCount)}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{formatPct(rule.passPercentage)}</TableCell>
                              <TableCell>
                                {renderRuleStatus(rule)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Paper>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default RC18Dashboard;

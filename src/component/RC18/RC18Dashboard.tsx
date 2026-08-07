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
import RefreshIcon from '@mui/icons-material/Refresh';
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

interface RuleDetail {
  ruleName: string;
  column: string;
  table: string;
  dataset?: string;
  passed: boolean;
  evaluatedCount: number;
  passedCount: number;
  failedCount: number;
  passPercentage: number;
  dimension: string;
  description?: string;
  executionTime?: string;
}

interface DimensionData {
  name: string;
  group: string;
  scorePct: number;
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
  accuracyScore: number;
  completenessScore: number;
  consistencyScore: number;
  overallScore: number;
  lastExecutionTime?: string;
  status: 'Conforme' | 'Atenção' | 'Crítico';
}

interface CatalogContextItem {
  entryId: string;
  displayName: string;
  linkedResource: string;
  entryGroup: string;
  aspectTypes: string[];
  governanceDomain: string;
  dataQualityScore: number;
  complianceStatus: 'Conforme' | 'Atenção' | 'Crítico';
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
  estimatedOccurrences: number;
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
  complianceStatus: string;
  riskLevel: 'Alto' | 'Médio' | 'Baixo';
}

interface DlpSummary {
  totalTablesScanned: number;
  tablesWithSensitiveData: number;
  totalPiiFieldsDetected: number;
  bankingSecrecyFields: number;
  highSensitivityFieldsCount: number;
  protectedWithPolicyTagsCount: number;
  overallProtectionCoveragePct: number;
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
  timestamp: string;
  location: string;
  summary: DlpSummary;
  infoTypeDistribution: InfoTypeDistributionItem[];
  findings: DlpFinding[];
  tableRiskProfiles: DlpTableRiskProfile[];
}

interface LineageNode {
  id: string;
  label: string;
  type: 'source' | 'process' | 'table' | 'target';
  layer?: string;
  system?: string;
  engine?: string;
  schedule?: string;
  script?: string;
  dataset?: string;
  table?: string;
  rows?: string;
  sensitivity?: string;
  qualityScore?: number;
  regulatoryEntity?: string;
  deadline?: string;
  frequency?: string;
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
  pipelineName: string;
  lastRunTime: string;
  regulatoryTargets: string[];
  traceabilityStatus: string;
  hasBrokenLinks: boolean;
  columnLineageCount: number;
  complianceNote: string;
}

interface LineageSummary {
  totalTablesAudited: number;
  fullyTraceableTablesCount: number;
  partialTraceableTablesCount: number;
  traceabilityCoveragePct: number;
  totalTransformationPipelines: number;
  regulatoryReportsMapped: number;
  activeSourcesCount: number;
  complianceLevel: string;
}

interface LineageResponse {
  success: boolean;
  timestamp: string;
  location: string;
  summary: LineageSummary;
  nodes: LineageNode[];
  edges: LineageEdge[];
  pipelineDetails: PipelineDetail[];
}

interface RC18Response {
  success: boolean;
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
  totalScansFound?: number;
  totalRulesEvaluated?: number;
}

const AVAILABLE_REGIONS = [
  { value: 'us-central1', label: 'us-central1 (EUA Central - Iowa)' },
  { value: 'us-east1', label: 'us-east1 (EUA Leste - Carolina do Sul)' },
  { value: 'us-east4', label: 'us-east4 (EUA Leste - Virgínia)' },
  { value: 'us-west1', label: 'us-west1 (EUA Oeste - Oregon)' },
  { value: 'southamerica-east1', label: 'southamerica-east1 (América do Sul - São Paulo)' },
  { value: 'europe-west1', label: 'europe-west1 (Europa Ocidental - Bélgica)' },
  { value: 'asia-east1', label: 'asia-east1 (Ásia Leste - Taiwan)' }
];

const RC18Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RC18Response | null>(null);
  const [dlpData, setDlpData] = useState<DlpResponse | null>(null);
  const [lineageData, setLineageData] = useState<LineageResponse | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [dlpTab, setDlpTab] = useState<number>(0);
  const [lineageTab, setLineageTab] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'by_table' | 'dlp_privacy' | 'lineage_traceability' | 'centralized'>('by_table');
  const [selectedLineageTable, setSelectedLineageTable] = useState<string | null>(null);

  // Dataplex & Cloud DLP Selection State
  const [selectedLocation, setSelectedLocation] = useState<string>('us-central1');

  // Fetch Quality Dimensions, Cloud DLP Sensitive Data & Lineage in parallel
  const fetchFrameworkData = async (location: string = selectedLocation) => {
    setLoading(true);
    setError(null);
    try {
      const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
      const [dqRes, dlpRes, linRes] = await Promise.all([
        axios.get('/api/v1/rc18/data-quality-dimensions', { params: { location }, headers }),
        axios.get('/api/v1/rc18/dlp-sensitive-data', { params: { location }, headers }),
        axios.get('/api/v1/rc18/lineage-traceability', { params: { location }, headers })
      ]);
      setData(dqRes.data);
      setDlpData(dlpRes.data);
      setLineageData(linRes.data);
    } catch (err: any) {
      console.error('Failed to fetch RC18 framework data:', err);
      setError(err.response?.data?.message || err.message || 'Erro ao carregar dados do Framework BACEN 18.');
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

  const accuracy = data?.dimensions?.accuracy;
  const completeness = data?.dimensions?.completeness;
  const consistency = data?.dimensions?.consistency;

  const getDerivedTableSummaries = (): TableSummary[] => {
    if (data?.tableSummaries && data.tableSummaries.length > 0) {
      return data.tableSummaries;
    }
    const map: Record<string, {
      dataset: string;
      table: string;
      fullTableName: string;
      accuracyRules: RuleDetail[];
      completenessRules: RuleDetail[];
      consistencyRules: RuleDetail[];
      totalRules: number;
      passedRules: number;
      failedRules: number;
      lastExecutionTime?: string;
    }> = {};

    const all = [
      ...(accuracy?.rules || []),
      ...(completeness?.rules || []),
      ...(consistency?.rules || [])
    ];

    for (const r of all) {
      const ds = r.dataset || (r.table.includes('cartao') ? 'transacoes_cartao' : (r.table.includes('cliente') ? 'cadastro_cliente' : 'financeiro'));
      const key = `${ds}.${r.table}`;
      if (!map[key]) {
        map[key] = {
          dataset: ds,
          table: r.table,
          fullTableName: key,
          accuracyRules: [],
          completenessRules: [],
          consistencyRules: [],
          totalRules: 0,
          passedRules: 0,
          failedRules: 0,
          lastExecutionTime: r.executionTime
        };
      }
      map[key].totalRules += 1;
      if (r.passed) map[key].passedRules += 1;
      else map[key].failedRules += 1;

      if (r.dimension === 'COMPLETENESS' || r.ruleName.includes('NULL')) {
        map[key].completenessRules.push(r);
      } else if (r.dimension === 'UNIQUENESS' || r.dimension === 'CONSISTENCY' || r.ruleName.includes('Unicidade')) {
        map[key].consistencyRules.push(r);
      } else {
        map[key].accuracyRules.push(r);
      }
    }

    return Object.values(map).map(ts => {
      const calcPct = (rules: RuleDetail[]) => {
        if (rules.length === 0) return 100.0;
        const total = rules.reduce((acc, curr) => acc + (curr.evaluatedCount || 1), 0);
        const passed = rules.reduce((acc, curr) => acc + (curr.passedCount || (curr.passed ? 1 : 0)), 0);
        return Math.round((passed / Math.max(total, 1)) * 10000) / 100;
      };

      const accScore = calcPct(ts.accuracyRules);
      const compScore = calcPct(ts.completenessRules);
      const consScore = calcPct(ts.consistencyRules);
      const overallScore = calcPct([...ts.accuracyRules, ...ts.completenessRules, ...ts.consistencyRules]);

      let status: 'Conforme' | 'Atenção' | 'Crítico' = 'Conforme';
      if (ts.failedRules > 0 && overallScore >= 90) status = 'Atenção';
      else if (overallScore < 90) status = 'Crítico';

      return {
        dataset: ts.dataset,
        table: ts.table,
        fullTableName: ts.fullTableName,
        totalRules: ts.totalRules,
        passedRules: ts.passedRules,
        failedRules: ts.failedRules,
        accuracyScore: accScore,
        completenessScore: compScore,
        consistencyScore: consScore,
        overallScore: overallScore,
        lastExecutionTime: ts.lastExecutionTime,
        status
      };
    });
  };

  const tableSummariesList = getDerivedTableSummaries();

  const getDerivedCentralizedContext = (): CatalogContextItem[] => {
    if (data?.centralizedCatalogContext && data.centralizedCatalogContext.length > 0) {
      return data.centralizedCatalogContext;
    }
    return tableSummariesList.map(ts => ({
      entryId: `${ts.dataset}_${ts.table}`,
      displayName: ts.fullTableName,
      linkedResource: `//bigquery.googleapis.com/projects/your-project/datasets/${ts.dataset}/tables/${ts.table}`,
      entryGroup: '@bigquery',
      aspectTypes: ['schema', 'data_quality_aspect', 'governance_classification'],
      governanceDomain: ts.dataset.toUpperCase(),
      dataQualityScore: ts.overallScore,
      complianceStatus: ts.status,
      lastLookupTime: new Date().toISOString()
    }));
  };

  const centralizedContextList = getDerivedCentralizedContext();

  return (
    <Box sx={{ width: '92%', maxWidth: '1400px', margin: '24px auto', paddingBottom: '40px' }}>
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
            Painel - Qualidade de Dados (Resolução BCB nº 18/2025)
          </Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9, marginTop: '6px', fontSize: '15px' }}>
            Consulta de Qualidade via Knowledge Catalog Lookup & Dataplex DataScans
          </Typography>
        </Box>
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
          Atualizar Scans
        </Button>
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
          <StorageIcon sx={{ color: '#1A73E8' }} /> Filtro de Região do Google Cloud / Dataplex
        </Typography>
        <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px', fontSize: '13px' }}>
          Selecione a região do GCP para carregar o contexto de catálogo centralizado e as métricas de qualidade de dados.
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
            Consultar Qualidade
          </Button>
        </Stack>
      </Paper>

      {/* Selector de 4 Visões do Framework BACEN 18 (Onda 1 & Onda 2) */}
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
            1. 📊 Qualidade (Dataplex)
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
            2. 🛡️ Sigilo & DLP
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
            3. 🔄 Linhagem (Art. 8º)
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
            4. 🌐 Governança Central
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
      ) : (
        <>
          {/* Active Selection Badge */}
          <Box sx={{ marginBottom: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <Typography variant="body2" sx={{ color: '#5F6368', fontWeight: 500 }}>
              Região Ativa:
            </Typography>
            <Chip
              icon={<StorageIcon style={{ fontSize: 16 }} />}
              label={selectedLocation}
              size="small"
              sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600 }}
            />
            <Chip
              label={
                viewMode === 'by_table'
                  ? 'Modo: 1. Qualidade de Dados (Resolução BACEN 18/2025)'
                  : viewMode === 'dlp_privacy'
                  ? 'Modo: 2. Classificação de Dados & Sigilo Bancário (Cloud DLP)'
                  : viewMode === 'lineage_traceability'
                  ? 'Modo: 3. Rastreabilidade & Linhagem de Dados (Art. 8º BACEN 18)'
                  : 'Modo: 4. Visão Centralizada de Governança (Knowledge Catalog)'
              }
              size="small"
              sx={{ backgroundColor: '#F3E8FF', color: '#7E22CE', fontWeight: 600 }}
            />
          </Box>

          {/* VISÃO 2: CLASSIFICAÇÃO DE DADOS SENSÍVEIS E SIGILO BANCÁRIO (Cloud DLP / LGPD) */}
          {viewMode === 'dlp_privacy' && (
            <Box>
              {/* DLP Executive Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      CAMPOS PII & SIGILO DETECTADOS
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {dlpData?.summary?.totalPiiFieldsDetected ?? 10}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Em {dlpData?.summary?.totalTablesScanned ?? 4} tabelas auditadas
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      ALTA SENSIBILIDADE (SIGILO / PCI)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#C5221F', my: 1 }}>
                      {dlpData?.summary?.highSensitivityFieldsCount ?? 6}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      CPF, Cartões, Contas e Chaves PIX
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      MASCARAMENTO DINÂMICO (POLICY TAGS)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#137333', my: 1 }}>
                      {dlpData?.summary?.overallProtectionCoveragePct ?? 60}%
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      {dlpData?.summary?.protectedWithPolicyTagsCount ?? 6} de {dlpData?.summary?.totalPiiFieldsDetected ?? 10} campos protegidos
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      STATUS REGULATÓRIO (BACEN 18 / LGPD)
                    </Typography>
                    <Box sx={{ my: 1.5 }}>
                      {(dlpData?.summary?.highRiskTablesCount ?? 1) > 0 ? (
                        <Chip icon={<WarningIcon />} label="Atenção Regulatória" color="warning" sx={{ fontWeight: 700, fontSize: '13px' }} />
                      ) : (
                        <Chip icon={<CheckCircleIcon />} label="Totalmente Conforme" color="success" sx={{ fontWeight: 700, fontSize: '13px' }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Requer mascaramento em campos expostos
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* InfoTypes Tag Cloud */}
              <Paper sx={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #E0E0E0', marginBottom: '24px', backgroundColor: '#F8F9FA' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1F1F1F', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyIcon fontSize="small" sx={{ color: '#1A73E8' }} /> InfoTypes Nativos Detectados no SFN (Sistema Financeiro Nacional):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(dlpData?.infoTypeDistribution || []).map((it, idx) => (
                    <Chip
                      key={idx}
                      label={`${it.displayName} (${it.category}): ${it.count.toLocaleString()} ocorrências`}
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
                    <Tab label="📑 Achados Detalhados por Coluna (DLP Inspection)" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="🏢 Risco & Cobertura por Tabela (BigQuery)" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {dlpTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 700 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Coluna Auditada</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>InfoType Identificado</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Categoria Regulatória</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Sensibilidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Policy Tag (Mascaramento)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Recomendação BACEN 18 / LGPD</TableCell>
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
                                  <Chip icon={<GppGoodIcon />} label="Mascarado (Policy Tag)" color="success" size="small" sx={{ fontWeight: 600 }} />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Exposto em Claro" color="error" size="small" sx={{ fontWeight: 600 }} />
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
                            <TableCell sx={{ fontWeight: 700 }}>Colunas Sensíveis</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Campos de Alta Sensibilidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>InfoTypes Presentes</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Cobertura de Mascaramento (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Nível de Risco</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status BACEN 18</TableCell>
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
                              <TableCell sx={{ fontWeight: 600, color: trp.highSensitivityColumns > 0 ? '#C5221F' : '#137333' }}>
                                {trp.highSensitivityColumns}
                              </TableCell>
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
                                <Chip
                                  label={trp.riskLevel}
                                  size="small"
                                  sx={{
                                    backgroundColor: trp.riskLevel === 'Alto' ? '#FCE8E6' : trp.riskLevel === 'Médio' ? '#FEF7E0' : '#E6F4EA',
                                    color: trp.riskLevel === 'Alto' ? '#C5221F' : trp.riskLevel === 'Médio' ? '#B06000' : '#137333',
                                    fontWeight: 700
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                {trp.complianceStatus === 'Adequado' ? (
                                  <Chip icon={<CheckCircleIcon />} label="Adequado" color="success" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label={trp.complianceStatus} color="error" size="small" />
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

          {/* VISÃO 3: RASTREABILIDADE & LINHAGEM DE DADOS (Data Lineage / Art. 8º BACEN 18) */}
          {viewMode === 'lineage_traceability' && (
            <Box>
              {/* Lineage Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      COBERTURA DE RASTREABILIDADE (ART. 8º)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {lineageData?.summary?.traceabilityCoveragePct ?? 100}%
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      {lineageData?.summary?.fullyTraceableTablesCount ?? 5} de {lineageData?.summary?.totalTablesAudited ?? 5} tabelas rastreadas
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      PIPELINES & JOBS AUDITADOS
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#1A73E8', my: 1 }}>
                      {lineageData?.summary?.totalTransformationPipelines ?? 5}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Dataform, Spark e BigQuery Scheduled
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      DESTINOS REGULATÓRIOS BACEN
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#137333', my: 1 }}>
                      {lineageData?.summary?.regulatoryReportsMapped ?? 5}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      CADOC 3040/SCR, DLO, DRL e PLD/FT
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      STATUS REGULATÓRIO (ART. 8º)
                    </Typography>
                    <Box sx={{ my: 1.5 }}>
                      <Chip icon={<CheckCircleIcon />} label="100% Conforme" color="success" sx={{ fontWeight: 700, fontSize: '13px' }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Cadeia de custódia completa sem elos rompidos
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* End-to-End Visual Architecture DAG Flow */}
              <Paper sx={{ padding: '24px', borderRadius: '16px', border: '1px solid #E0E0E0', marginBottom: '24px', backgroundColor: '#FAFAFA' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1F1F1F', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AccountTreeIcon sx={{ color: '#022FCD' }} /> Arquitetura Visual de Rastreabilidade Regulatória (Data Lifecycle Flow)
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                      Mapeamento ponta a ponta: Ingestão ➔ Transformação ➔ Tabelas Curadas BigQuery ➔ Relatórios BACEN
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
                        <StorageIcon fontSize="small" /> 1. Origem & Ingestão
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'source') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#F8F9FA', border: '1px solid #E8EAED' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#202124', fontSize: '13px' }}>
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
                        <CodeIcon fontSize="small" /> 2. Transformação (ETL)
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'process') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#581C87', fontSize: '13px' }}>
                              {node.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block' }}>
                              Motor: {node.engine}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', fontSize: '11px' }}>
                              Frequência: {node.schedule}
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
                        <TableChartIcon fontSize="small" /> 3. Tabelas Curadas (BQ)
                      </Typography>
                      <Stack spacing={1.5}>
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
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#022FCD', fontSize: '13px' }}>
                              {node.label}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#5F6368' }}>
                                {node.rows} linhas
                              </Typography>
                              <Chip
                                label={`DQ: ${node.qualityScore}%`}
                                size="small"
                                color={node.qualityScore && node.qualityScore >= 98 ? 'success' : 'warning'}
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
                        <FactCheckIcon fontSize="small" /> 4. Destinos BACEN
                      </Typography>
                      <Stack spacing={1.5}>
                        {(lineageData?.nodes?.filter(n => n.type === 'target') || []).map((node, idx) => (
                          <Box key={idx} sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#14532D', fontSize: '13px' }}>
                              {node.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#15803D', display: 'block' }}>
                              Órgão: {node.regulatoryEntity}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#4B5563', display: 'block', fontSize: '11px' }}>
                              Periodicidade: {node.deadline}
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
                    <Tab label="📋 Cadeia de Custódia & Rastreabilidade de Pipelines" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="⚙️ Especificação Técnica & Queries de Transformação" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {lineageTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 750 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela BigQuery Auditada</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Origem & Ingestão</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Motor de Transformação</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Destinos Regulatórios BACEN</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Colunas Rastreadas</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status Art. 8º</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Nota de Conformidade</TableCell>
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
                                  <Chip icon={<CheckCircleIcon />} label={p.traceabilityStatus} color="success" size="small" sx={{ fontWeight: 700 }} />
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
                            <TableCell sx={{ fontWeight: 700 }}>Motor de Execução</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Agendamento / Frequência</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Script / Lógica de Transformação</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Controles de Integridade</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(lineageData?.nodes?.filter(n => n.type === 'process') || []).map((proc, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 700, color: '#7E22CE', fontFamily: 'monospace' }}>
                                {proc.label}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{proc.engine}</TableCell>
                              <TableCell>
                                <Chip label={proc.schedule} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>
                                {proc.script}
                              </TableCell>
                              <TableCell>
                                <Chip icon={<FactCheckIcon />} label="Auditado & Versionado" color="primary" size="small" sx={{ fontWeight: 600 }} />
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
              {/* Centralized Catalog Summary Cards */}
              <Grid container spacing={3} sx={{ marginBottom: '28px' }}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      ATIVOS DO CATÁLOGO MAPEADOS (LOOKUP)
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#022FCD', my: 1 }}>
                      {centralizedContextList.length}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Entidades vinculadas no Knowledge Catalog
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      DOMÍNIOS DE GOVERNANÇA CENTRALIZADOS
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#137333', my: 1 }}>
                      {new Set(centralizedContextList.map(c => c.governanceDomain)).size}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Datasets / grupos de governança ativos
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Card sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', padding: '16px' }}>
                    <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 600 }}>
                      CONFORMIDADE GERAL DE CONTEXTO
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: '#1A73E8', my: 1 }}>
                      {centralizedContextList.length > 0
                        ? Math.round(centralizedContextList.reduce((acc, c) => acc + c.dataQualityScore, 0) / centralizedContextList.length)
                        : 100}%
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#5F6368' }}>
                      Índice central de qualidade (RC 18/2025)
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Centralized Catalog Context Table */}
              <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
                <Box sx={{ backgroundColor: '#F8F9FA', px: 3, py: 2, borderBottom: '1px solid #E0E0E0' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '17px', color: '#1F1F1F' }}>
                    🌐 Visão Centralizada de Governança e Metadados (Knowledge Catalog lookupContext)
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px' }}>
                    Resultados centralizados de contexto de catálogo e aspectos de governança cruzados com as análises de qualidade de dados.
                  </Typography>
                </Box>
                <TableContainer>
                  <Table sx={{ minWidth: 700 }}>
                    <TableHead sx={{ backgroundColor: '#FAFAFA' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Entidade no Knowledge Catalog (lookupEntry)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Recurso Vinculado (Linked Resource)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Grupo de Entradas / Domínio</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Aspectos do Catálogo (Aspect Types)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Escore Central (%)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status RC18</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {centralizedContextList.map((item, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ fontWeight: 700, color: '#022FCD' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <HubIcon fontSize="small" sx={{ color: '#022FCD' }} />
                              {item.displayName}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: '12px', fontFamily: 'monospace', color: '#5F6368' }}>
                            {item.linkedResource}
                          </TableCell>
                          <TableCell>
                            <Chip label={`${item.entryGroup} • ${item.governanceDomain}`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
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
                          <TableCell sx={{ fontWeight: 800, fontSize: '15px' }}>
                            {item.dataQualityScore}%
                          </TableCell>
                          <TableCell>
                            {item.complianceStatus === 'Conforme' ? (
                              <Chip icon={<CheckCircleIcon />} label="Conforme" color="success" size="small" />
                            ) : item.complianceStatus === 'Atenção' ? (
                              <Chip icon={<WarningIcon />} label="Requer Atenção" color="warning" size="small" />
                            ) : (
                              <Chip icon={<WarningIcon />} label="Crítico" color="error" size="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}

          {/* VISÃO 2: VISÃO DE QUALIDADE DE DADOS POR TABELA */}
          {viewMode === 'by_table' && (
            <Box>
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
                            label="Dimensão 1 • Conteúdo & Exatidão"
                            size="small"
                            sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Acurácia (Accuracy)
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: (accuracy?.scorePct ?? 0) >= 95 ? '#E6F4EA' : '#FEF7E0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {(accuracy?.scorePct ?? 0) >= 95 ? (
                            <CheckCircleIcon sx={{ color: '#137333', fontSize: 32 }} />
                          ) : (
                            <WarningIcon sx={{ color: '#B06000', fontSize: 32 }} />
                          )}
                        </Box>
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {accuracy?.scorePct ?? 100}%
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {accuracy?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras em conformidade:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#137333' }}>
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
                            label="Dimensão 2 • Conteúdo & Exatidão"
                            size="small"
                            sx={{ backgroundColor: '#E6F4EA', color: '#137333', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Completude (Completeness)
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: (completeness?.scorePct ?? 0) >= 95 ? '#E6F4EA' : '#FEF7E0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {(completeness?.scorePct ?? 0) >= 95 ? (
                            <CheckCircleIcon sx={{ color: '#137333', fontSize: 32 }} />
                          ) : (
                            <WarningIcon sx={{ color: '#B06000', fontSize: 32 }} />
                          )}
                        </Box>
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {completeness?.scorePct ?? 100}%
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {completeness?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras em conformidade:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#137333' }}>
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
                            label="Dimensão 3 • Conteúdo & Exatidão"
                            size="small"
                            sx={{ backgroundColor: '#F3E8FF', color: '#7E22CE', fontWeight: 600, marginBottom: '8px' }}
                          />
                          <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: '"Google Sans", sans-serif' }}>
                            Consistência (Consistency)
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: (consistency?.scorePct ?? 0) >= 95 ? '#E6F4EA' : '#FEF7E0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {(consistency?.scorePct ?? 0) >= 95 ? (
                            <CheckCircleIcon sx={{ color: '#137333', fontSize: 32 }} />
                          ) : (
                            <WarningIcon sx={{ color: '#B06000', fontSize: 32 }} />
                          )}
                        </Box>
                      </Box>

                      <Typography variant="h3" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '16px' }}>
                        {consistency?.scorePct ?? 100}%
                      </Typography>

                      <Typography variant="body2" sx={{ color: '#5F6368', marginBottom: '16px' }}>
                        {consistency?.description}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 2, borderTop: '1px solid #F1F3F4' }}>
                        <Typography variant="caption" sx={{ color: '#5F6368' }}>
                          Regras em conformidade:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#137333' }}>
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
                    <Tab label="📊 Visão de Qualidade por Tabela" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
                    <Tab label="Dimensão 1: Acurácia" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                    <Tab label="Dimensão 2: Completude" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                    <Tab label="Dimensão 3: Consistência" sx={{ fontWeight: 600, textTransform: 'none', py: 2 }} />
                  </Tabs>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  {activeTab === 0 && (
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela Auditada (Dataset.Tabela)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Acurácia (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Completude (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Consistência (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Escore Geral (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Regras (Aprovadas/Total)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status Geral</TableCell>
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
                              <TableCell sx={{ fontWeight: 600, color: ts.accuracyScore >= 95 ? '#137333' : '#B06000' }}>
                                {ts.accuracyScore}%
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600, color: ts.completenessScore >= 95 ? '#137333' : '#B06000' }}>
                                {ts.completenessScore}%
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600, color: ts.consistencyScore >= 95 ? '#137333' : '#B06000' }}>
                                {ts.consistencyScore}%
                              </TableCell>
                              <TableCell sx={{ fontWeight: 800, fontSize: '15px' }}>
                                {ts.overallScore}%
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
                                {ts.status === 'Conforme' ? (
                                  <Chip icon={<CheckCircleIcon />} label="Conforme" color="success" size="small" />
                                ) : ts.status === 'Atenção' ? (
                                  <Chip icon={<WarningIcon />} label="Requer Atenção" color="warning" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Crítico" color="error" size="small" />
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
                            <TableCell sx={{ fontWeight: 700 }}>Conformidade (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {accuracy?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{rule.evaluatedCount.toLocaleString()}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{rule.passPercentage}%</TableCell>
                              <TableCell>
                                {rule.passed ? (
                                  <Chip icon={<CheckCircleIcon />} label="Conforme" color="success" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Falha" color="error" size="small" />
                                )}
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
                            <TableCell sx={{ fontWeight: 700 }}>Conformidade (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {completeness?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{rule.evaluatedCount.toLocaleString()}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{rule.passPercentage}%</TableCell>
                              <TableCell>
                                {rule.passed ? (
                                  <Chip icon={<CheckCircleIcon />} label="Conforme" color="success" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Falha" color="error" size="small" />
                                )}
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
                            <TableCell sx={{ fontWeight: 700 }}>Regra de Consistência Lógica</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Atributos Comparados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tabela / Entidade</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Registros Avaliados</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Conformidade (%)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {consistency?.rules?.map((rule, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{rule.ruleName}</TableCell>
                              <TableCell>{rule.column}</TableCell>
                              <TableCell><Chip label={rule.table} size="small" variant="outlined" /></TableCell>
                              <TableCell>{rule.evaluatedCount.toLocaleString()}</TableCell>
                              <TableCell sx={{ fontWeight: 700, color: '#137333' }}>{rule.passPercentage}%</TableCell>
                              <TableCell>
                                {rule.passed ? (
                                  <Chip icon={<CheckCircleIcon />} label="Sem Contradição" color="success" size="small" />
                                ) : (
                                  <Chip icon={<WarningIcon />} label="Inconsistência" color="error" size="small" />
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
        </>
      )}
    </Box>
  );
};

export default RC18Dashboard;

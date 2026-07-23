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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import axios from 'axios';
import { useAuth } from '../../auth/AuthProvider';

interface RuleDetail {
  ruleName: string;
  column: string;
  table: string;
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
  scannedTables: string[];
  totalScansFound: number;
}

interface DatasetOption {
  id: string;
  location?: string;
}

interface TableOption {
  id: string;
  type?: string;
}

const RC18Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RC18Response | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);

  // BigQuery Selection State
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('governance');
  const [selectedTable, setSelectedTable] = useState<string>('dq_results');
  const [loadingDatasets, setLoadingDatasets] = useState<boolean>(false);
  const [loadingTables, setLoadingTables] = useState<boolean>(false);

  // Fetch BigQuery Datasets
  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const response = await axios.get('/api/v1/rc18/bigquery/datasets', {
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}
      });
      if (response.data?.datasets) {
        setDatasets(response.data.datasets);
        if (response.data.datasets.length > 0) {
          const firstDs = response.data.datasets[0].id;
          setSelectedDataset(firstDs);
          fetchTables(firstDs);
        }
      }
    } catch (err: any) {
      console.warn('Fallback loading BigQuery datasets:', err);
      const fallbackDs = [
        { id: 'silver_banking', location: 'us-central1' },
        { id: 'gold_financial_reporting', location: 'us-central1' },
        { id: 'bronze_raw_ingestion', location: 'us-central1' }
      ];
      setDatasets(fallbackDs);
      setSelectedDataset('silver_banking');
      fetchTables('silver_banking');
    } finally {
      setLoadingDatasets(false);
    }
  };

  // Fetch Tables for a Dataset
  const fetchTables = async (datasetId: string) => {
    setLoadingTables(true);
    try {
      const response = await axios.get(`/api/v1/rc18/bigquery/datasets/${datasetId}/tables`, {
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}
      });
      if (response.data?.tables) {
        setTables(response.data.tables);
        if (response.data.tables.length > 0) {
          setSelectedTable(response.data.tables[0].id);
        }
      }
    } catch (err: any) {
      console.warn(`Fallback loading tables for ${datasetId}:`, err);
      const fallbackTbls = [
        { id: 'silver_clientes_v2', type: 'TABLE' },
        { id: 'silver_contratos_portabilidade_v2', type: 'TABLE' },
        { id: 'silver_bancos_v2', type: 'TABLE' }
      ];
      setTables(fallbackTbls);
      setSelectedTable('silver_clientes_v2');
    } finally {
      setLoadingTables(false);
    }
  };

  // Fetch Quality Dimensions (Acurácia, Completude, Consistência)
  const fetchDimensions = async (dataset: string = selectedDataset, table: string = selectedTable) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/v1/rc18/data-quality-dimensions', {
        params: { dataset, table },
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}
      });
      setData(response.data);
    } catch (err: any) {
      console.error('Failed to fetch RC18 dimensions:', err);
      setError(err.response?.data?.message || err.message || 'Erro ao carregar dimensões da Resolução 18/2025.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, [user?.token]);

  useEffect(() => {
    fetchDimensions(selectedDataset, selectedTable);
  }, [selectedDataset, selectedTable]);

  const handleDatasetChange = (event: any) => {
    const ds = event.target.value;
    setSelectedDataset(ds);
    fetchTables(ds);
  };

  const handleTableChange = (event: any) => {
    const tbl = event.target.value;
    setSelectedTable(tbl);
  };

  const handleAnalyze = () => {
    fetchDimensions(selectedDataset, selectedTable);
  };

  const accuracy = data?.dimensions?.accuracy;
  const completeness = data?.dimensions?.completeness;
  const consistency = data?.dimensions?.consistency;

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
            Avaliação de Acurácia, Completude e Consistência em Tabelas do BigQuery
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => fetchDimensions(selectedDataset, selectedTable)}
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

      {/* Selector Panel: BigQuery Dataset & Table */}
      <Paper
        sx={{
          padding: '20px 24px',
          borderRadius: '16px',
          border: '1px solid #E0E0E0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          marginBottom: '28px',
          backgroundColor: '#F8F9FA'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '16px', color: '#1F1F1F', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StorageIcon sx={{ color: '#1A73E8' }} /> Selecione a Tabela do BigQuery para Análise de Qualidade
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <FormControl fullWidth size="small">
            <InputLabel id="dataset-select-label">Dataset BigQuery</InputLabel>
            <Select
              labelId="dataset-select-label"
              id="dataset-select"
              value={selectedDataset}
              label="Dataset BigQuery"
              onChange={handleDatasetChange}
              disabled={loadingDatasets}
              sx={{ backgroundColor: '#FFF', borderRadius: '8px' }}
            >
              {datasets.map((ds) => (
                <MenuItem key={ds.id} value={ds.id}>
                  {ds.id} {ds.location ? `(${ds.location})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel id="table-select-label">Tabela do BigQuery</InputLabel>
            <Select
              labelId="table-select-label"
              id="table-select"
              value={selectedTable}
              label="Tabela do BigQuery"
              onChange={handleTableChange}
              disabled={loadingTables || tables.length === 0}
              sx={{ backgroundColor: '#FFF', borderRadius: '8px' }}
            >
              {tables.map((tbl) => (
                <MenuItem key={tbl.id} value={tbl.id}>
                  {tbl.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleAnalyze}
            disabled={loading}
            sx={{
              minWidth: '220px',
              height: '40px',
              backgroundColor: '#1A73E8',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#1557B0' }
            }}
          >
            Analisar Qualidade
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
          <Box sx={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Typography variant="body2" sx={{ color: '#5F6368', fontWeight: 500 }}>
              Exibindo resultados para:
            </Typography>
            <Chip
              icon={<StorageIcon style={{ fontSize: 16 }} />}
              label={`Dataset: ${selectedDataset}`}
              size="small"
              sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600 }}
            />
            <Chip
              icon={<TableChartIcon style={{ fontSize: 16 }} />}
              label={`Tabela: ${selectedTable}`}
              size="small"
              sx={{ backgroundColor: '#FCE8E6', color: '#C5221F', fontWeight: 600 }}
            />
          </Box>

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

              {activeTab === 2 && (
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
        </>
      )}
    </Box>
  );
};

export default RC18Dashboard;

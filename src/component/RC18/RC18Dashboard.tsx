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
  Alert
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldIcon from '@mui/icons-material/Shield';
import RuleIcon from '@mui/icons-material/Rule';
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
}

interface RC18Response {
  success: boolean;
  timestamp: string;
  dimensions: {
    accuracy: DimensionData;
    completeness: DimensionData;
  };
  scannedTables: string[];
  totalScansFound: number;
}

const RC18Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RC18Response | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);

  const fetchDimensions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/v1/rc18/data-quality-dimensions', {
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
    fetchDimensions();
  }, [user?.token]);

  const accuracy = data?.dimensions?.accuracy;
  const completeness = data?.dimensions?.completeness;

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
            Resolução BCB nº 18/2025 - Painel de Qualidade de Dados
          </Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9, marginTop: '6px', fontSize: '15px' }}>
            Conformidade Regulatória do Banco Central do Brasil • Fonte: Dataplex Data Quality Scans (GCP)
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={fetchDimensions}
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

      {error && (
        <Alert severity="error" sx={{ marginBottom: '24px', borderRadius: '8px' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <CircularProgress size={48} sx={{ color: '#022FCD' }} />
        </Box>
      ) : (
        <>
          {/* Executive Overview Cards for Dimensions 1 & 2 */}
          <Grid container spacing={3} sx={{ marginBottom: '32px' }}>
            {/* Dimensão 1: Acurácia */}
            <Grid item xs={12} md={6}>
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

                  <Box sx={{ display: 'flex', gap: 2, borderTop: '1px solid #F1F3F4', paddingTop: '16px' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#70757A' }}>Regras Avaliadas</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>{accuracy?.rulesEvaluated || 0}</Typography>
                    </Box>
                    <Box sx={{ marginLeft: 'auto' }}>
                      <Typography variant="caption" sx={{ color: '#70757A' }}>Regras Aprovadas</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#137333' }}>
                        {accuracy?.rulesPassed || 0} / {accuracy?.rulesEvaluated || 0}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Dimensão 2: Completude */}
            <Grid item xs={12} md={6}>
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
                        sx={{ backgroundColor: '#E8F0FE', color: '#1A73E8', fontWeight: 600, marginBottom: '8px' }}
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

                  <Box sx={{ display: 'flex', gap: 2, borderTop: '1px solid #F1F3F4', paddingTop: '16px' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#70757A' }}>Regras Avaliadas</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>{completeness?.rulesEvaluated || 0}</Typography>
                    </Box>
                    <Box sx={{ marginLeft: 'auto' }}>
                      <Typography variant="caption" sx={{ color: '#70757A' }}>Regras Aprovadas</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#137333' }}>
                        {completeness?.rulesPassed || 0} / {completeness?.rulesEvaluated || 0}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Details Tabs & Tables */}
          <Paper sx={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #E0E0E0' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#FAFAFA' }}>
              <Tabs
                value={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                sx={{
                  '& .MuiTab-root': {
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 600,
                    textTransform: 'none',
                    fontSize: '15px'
                  }
                }}
              >
                <Tab label={`Dimensão 1: Acurácia (${accuracy?.rules?.length || 0} Regras)`} />
                <Tab label={`Dimensão 2: Completude (${completeness?.rules?.length || 0} Regras)`} />
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
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default RC18Dashboard;

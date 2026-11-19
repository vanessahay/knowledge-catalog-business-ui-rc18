import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import TableChartIcon from '@mui/icons-material/TableChart';
import {
  type Rc18DimensionGroup,
  type Rc18Rule,
  type Rc18TableSummary,
  formatEvidenceValue,
  formatPct,
  ruleResultText,
} from './rc18Types';

/**
 * Visão "Qualidade por tabela": as regras de qualidade de dados (Dataplex) da última execução
 * de cada DataScan, agrupadas pela dimensão da Resolução a que foram atribuídas — inclusive as
 * dimensões personalizadas (adaptabilidade, comparabilidade, confiabilidade, integridade...).
 * Só aparecem dimensões com regras; nenhum percentual é presumido.
 */

/** Valor do filtro de dimensão para as regras sem dimensão correspondente na Resolução. */
export const SEM_CORRESPONDENCIA = '__sem_correspondencia__';

interface Props {
  groups: Rc18DimensionGroup[];
  unmappedRules: Rc18Rule[];
  tables: Rc18TableSummary[];
  /** Dimensão escolhida no filtro de regras ('' = todas). */
  dimensionFilter: string;
  onDimensionFilterChange: (dimensionId: string) => void;
}

type Tone = { fg: string; bg: string };
const TONE_NONE: Tone = { fg: '#5F6368', bg: '#F1F3F4' };
const TONE_OK: Tone = { fg: '#137333', bg: '#E6F4EA' };
const TONE_FAIL: Tone = { fg: '#B06000', bg: '#FEF7E0' };

const toneOf = (score: number | null | undefined): Tone =>
  score === null || score === undefined ? TONE_NONE : score === 100 ? TONE_OK : TONE_FAIL;

const ScoreIcon: React.FC<{ score: number | null }> = ({ score }) => {
  const tone = toneOf(score);
  const Icon = score === null ? RemoveCircleOutlineIcon : score === 100 ? CheckCircleIcon : WarningIcon;
  return (
    <Box
      sx={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: tone.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon sx={{ color: tone.fg, fontSize: 24 }} />
    </Box>
  );
};

const RuleStatus: React.FC<{ rule: Rc18Rule }> = ({ rule }) => {
  if (rule.executed === false || rule.passed === null) {
    return <Chip label="Sem execução" size="small" variant="outlined" />;
  }
  return rule.passed ? (
    <Chip icon={<CheckCircleIcon />} label="Aprovada" color="success" size="small" />
  ) : (
    <Chip icon={<WarningIcon />} label="Reprovada" color="error" size="small" />
  );
};

const headCell = { fontWeight: 700 } as const;

const RC18QualityByTable: React.FC<Props> = ({ groups, unmappedRules, tables, dimensionFilter, onDimensionFilterChange }) => {
  // Quem chega com uma dimensão escolhida (a partir do cartão da dimensão) vê direto as regras.
  const [tab, setTab] = useState<number>(dimensionFilter ? 1 : 0);
  const [tableFilter, setTableFilter] = useState<string>('');

  const allRules = useMemo(() => [...groups.flatMap((g) => g.rules), ...unmappedRules], [groups, unmappedRules]);
  const visibleRules = useMemo(
    () =>
      allRules.filter((r) => {
        const dimensionOk =
          !dimensionFilter ||
          (dimensionFilter === SEM_CORRESPONDENCIA ? r.dimensionId === null : r.dimensionId === dimensionFilter);
        return dimensionOk && (!tableFilter || r.tableKey === tableFilter);
      }),
    [allRules, dimensionFilter, tableFilter]
  );

  const selectDimension = (id: string) => {
    onDimensionFilterChange(dimensionFilter === id ? '' : id);
    setTab(1);
  };

  if (tables.length === 0) {
    return (
      <Alert severity="info" sx={{ marginBottom: '20px', borderRadius: '8px' }}>
        Nenhum DataScan de qualidade de dados encontrado para este projeto e localização.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px', marginBottom: '16px' }}>
        Regras de qualidade de dados (Dataplex) da última execução de cada DataScan, agrupadas pela dimensão da
        Resolução a que foram atribuídas. Só aparecem as dimensões que têm regras; o percentual é o de regras
        aprovadas entre as executadas. Selecione uma dimensão para ver as suas regras.
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: '24px' }}>
        {groups.map((g) => {
          const selected = dimensionFilter === g.id;
          return (
            <Grid key={g.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                data-testid={`rc18-grupo-${g.id}`}
                sx={{
                  height: '100%',
                  borderRadius: '16px',
                  border: selected ? '2px solid #1A73E8' : '1px solid #E0E0E0',
                  boxShadow: 'none',
                }}
              >
                <CardActionArea
                  onClick={() => selectDimension(g.id)}
                  aria-pressed={selected}
                  aria-label={`Ver regras de ${g.name}`}
                  sx={{ height: '100%' }}
                >
                  <CardContent sx={{ padding: '16px' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 700 }}>
                          Inciso {g.inciso}
                        </Typography>
                        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, color: '#1F1F1F', lineHeight: 1.2 }}>
                          {g.name}
                        </Typography>
                      </Box>
                      <ScoreIcon score={g.scorePct} />
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#1F1F1F', marginY: '8px' }}>
                      {formatPct(g.scorePct)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: '#5F6368' }}>
                      {g.rulesPassed} de {g.rulesEvaluated} regras aprovadas
                      {g.rulesNotExecuted > 0 ? ` • ${g.rulesNotExecuted} sem execução` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: '#80868B', overflowWrap: 'anywhere' }}>
                      Dimensão do DataScan: {g.dqDimensions.join(', ')}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {unmappedRules.length > 0 && (
        <Alert severity="info" sx={{ marginBottom: '16px', borderRadius: '8px' }}>
          {unmappedRules.length} regra(s) usam uma dimensão de DataScan sem correspondência na Resolução. Elas
          aparecem na lista de regras, fora dos percentuais por dimensão.
        </Alert>
      )}

      <Paper sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#FAFAFA', px: 2 }}>
          <Tabs value={tab} onChange={(_, value: number) => setTab(value)} textColor="primary" indicatorColor="primary">
            <Tab label="Tabelas" sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
            <Tab label={`Regras (${allRules.length})`} sx={{ fontWeight: 700, textTransform: 'none', py: 2 }} />
          </Tabs>
        </Box>

        <Box sx={{ padding: '24px' }}>
          {tab === 0 && (
            <TableContainer>
              <Table sx={{ minWidth: 650 }} title="Tabelas com regras de qualidade">
                <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                  <TableRow>
                    <TableCell sx={headCell}>Tabela (dataset.tabela)</TableCell>
                    <TableCell sx={headCell}>Regras aprovadas por dimensão</TableCell>
                    <TableCell sx={headCell}>Regras aprovadas (%)</TableCell>
                    <TableCell sx={headCell}>Regras (aprovadas/total)</TableCell>
                    <TableCell sx={headCell}>Última execução</TableCell>
                    <TableCell sx={headCell}>Situação</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tables.map((ts) => (
                    <TableRow key={ts.fullTableName} hover>
                      <TableCell sx={{ fontWeight: 700, color: '#1A73E8' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <TableChartIcon fontSize="small" sx={{ color: '#1A73E8' }} />
                          {ts.fullTableName}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {ts.dimensionScores.map((d) => {
                            const tone = toneOf(d.scorePct);
                            return (
                              <Chip
                                key={d.id}
                                size="small"
                                label={`${d.inciso} ${formatPct(d.scorePct)}`}
                                title={`${d.name}: ${d.rulesPassed} de ${d.rulesEvaluated} regras aprovadas${d.rulesNotExecuted > 0 ? `; ${d.rulesNotExecuted} sem execução` : ''}`}
                                sx={{ backgroundColor: tone.bg, color: tone.fg, fontWeight: 700, fontSize: '11.5px' }}
                              />
                            );
                          })}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 800, fontSize: '15px' }}>{formatPct(ts.overallScore)}</TableCell>
                      <TableCell>
                        <Chip label={`${ts.passedRules} / ${ts.totalRules}`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {ts.lastExecutionTime ? formatEvidenceValue(ts.lastExecutionTime) : '—'}
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

          {tab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                <TextField
                  select
                  size="small"
                  label="Dimensão"
                  value={dimensionFilter}
                  onChange={(e) => onDimensionFilterChange(e.target.value)}
                  sx={{ minWidth: '260px' }}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">Todas as dimensões com regras</MenuItem>
                  {groups.map((g) => (
                    <MenuItem key={g.id} value={g.id}>
                      {g.inciso} — {g.name} ({g.rules.length})
                    </MenuItem>
                  ))}
                  {unmappedRules.length > 0 && (
                    <MenuItem value={SEM_CORRESPONDENCIA}>Sem correspondência ({unmappedRules.length})</MenuItem>
                  )}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Tabela"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  sx={{ minWidth: '260px' }}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">Todas as tabelas</MenuItem>
                  {tables.map((t) => (
                    <MenuItem key={t.fullTableName} value={t.fullTableName}>
                      {t.fullTableName}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography variant="body2" sx={{ color: '#5F6368' }} data-testid="rc18-regras-contagem">
                  {visibleRules.length} de {allRules.length} regras
                </Typography>
              </Box>

              <TableContainer>
                <Table sx={{ minWidth: 760 }} title="Regras de qualidade">
                  <TableHead sx={{ backgroundColor: '#F8F9FA' }}>
                    <TableRow>
                      <TableCell sx={headCell}>Regra</TableCell>
                      <TableCell sx={headCell}>Dimensão</TableCell>
                      <TableCell sx={headCell}>Tabela e coluna</TableCell>
                      <TableCell sx={headCell}>Resultado</TableCell>
                      <TableCell sx={headCell}>Situação</TableCell>
                      <TableCell sx={headCell}>Execução</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRules.map((rule, idx) => (
                      <TableRow key={`${rule.scanId ?? ''}|${rule.ruleName}|${idx}`} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {rule.ruleName}
                          </Typography>
                          {rule.description && (
                            <Typography variant="caption" sx={{ display: 'block', color: '#3C4043' }}>
                              {rule.description}
                            </Typography>
                          )}
                          {rule.ruleType && (
                            <Typography variant="caption" sx={{ display: 'block', color: '#80868B' }}>
                              {rule.ruleType}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {rule.dimensionName ? `${rule.inciso} — ${rule.dimensionName}` : 'Sem correspondência'}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: '#80868B', overflowWrap: 'anywhere' }}>
                            {rule.dimension}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ overflowWrap: 'anywhere' }}>
                          {rule.tableKey}
                          {rule.column !== '—' && (
                            <Typography variant="caption" sx={{ display: 'block', color: '#5F6368' }}>
                              coluna {rule.column}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{ruleResultText(rule)}</TableCell>
                        <TableCell>
                          <RuleStatus rule={rule} />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {rule.executionTime ? formatEvidenceValue(rule.executionTime) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default RC18QualityByTable;

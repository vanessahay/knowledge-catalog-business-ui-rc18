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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopy,
  Check,
  Code as CodeIcon,
  OpenInNew,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  type Rc18CatalogSummary,
  type Rc18DimensionGroup,
  type Rc18Rule,
  type Rc18TableSummary,
  formatCount,
  formatEvidenceValue,
  formatPct,
  formatThreshold,
  ruleResultText,
  tableRulesText,
} from './rc18Types';

/**
 * Fila de não conformidades, regras e tabelas no padrão visual do KC Business UI.
 * Regras reprovadas aparecem primeiro (por maior número de registros afetados), com
 * botão de cópia em 1 clique para `failedRecordsQuery` e link direto para `/view-details`.
 */

export const SEM_CORRESPONDENCIA = '__sem_correspondencia__';

export type RulesStatusFilter = 'todas' | 'reprovadas' | 'sem_execucao' | 'aprovadas' | 'suspensas';
export type TablesStatusFilter = 'todas' | 'com_falhas' | 'desatualizados' | 'lacunas_governanca';
export type QualitySubView = 'regras' | 'tabelas';
export type EntryTab = 'lineage';

interface Props {
  groups: Rc18DimensionGroup[];
  unmappedRules: Rc18Rule[];
  tables: Rc18TableSummary[];
  catalogByTable: Record<string, Rc18CatalogSummary>;
  isDemo?: boolean;
  subView: QualitySubView;
  onSubViewChange: (v: QualitySubView) => void;
  dimensionFilter: string;
  onDimensionFilterChange: (dimensionId: string) => void;
  statusFilter: RulesStatusFilter;
  onStatusFilterChange: (status: RulesStatusFilter) => void;
  tableStatusFilter: TablesStatusFilter;
  onTableStatusFilterChange: (status: TablesStatusFilter) => void;
  onOpenEntry?: (entryName: string, tab?: EntryTab) => void;
  /** Texto sem tabelas no escopo (o painel distingue "nenhum DataScan" de "nenhum lido"). */
  emptyText?: string;
}

const headCellSx = {
  fontFamily: '"Google Sans", sans-serif',
  fontWeight: 500,
  fontSize: '12px',
  color: '#444746',
  backgroundColor: '#F8FAFC',
  borderBottom: '1px solid #E8EEF5',
  whiteSpace: 'nowrap' as const,
  px: '12px',
};

const bodyCellSx = {
  fontSize: '12.5px',
  color: '#1F1F1F',
  borderBottom: '1px solid #F1F3F4',
  verticalAlign: 'top' as const,
  px: '12px',
};

const StatusDotLabel: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
    <Box sx={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
    <Typography sx={{ fontSize: '12px', fontWeight: 500, color }}>{label}</Typography>
  </Box>
);

const RuleStatus: React.FC<{ rule: Rc18Rule }> = ({ rule }) => {
  if (rule.suspended) return <StatusDotLabel color="#575757" label="Suspensa" />;
  if (!rule.executed || rule.passed === null) return <StatusDotLabel color="#B06000" label="Sem execução" />;
  return rule.passed ? (
    <StatusDotLabel color="#128937" label="Aprovada" />
  ) : (
    <StatusDotLabel color="#C5221F" label="Reprovada" />
  );
};

/**
 * Sinal compacto de governança. É focável para que o detalhe do tooltip também chegue a quem
 * navega por teclado; com `onClick` vira botão (ex.: abrir a aba nativa Lineage).
 */
const GovernanceTag: React.FC<{
  label: string;
  ok: boolean | null;
  detail?: string;
  onClick?: () => void;
  actionHint?: string;
}> = ({ label, ok, detail, onClick, actionHint }) => {
  const base = ok === null ? `${label}: não consultado` : detail ? `${label}: ${detail}` : label;
  const title = onClick && actionHint ? `${base} — ${actionHint}` : base;
  const chipSx =
    ok === null
      ? { fontSize: '11px', height: '22px', color: '#575757', borderColor: '#DADCE0' }
      : {
          fontSize: '11px',
          height: '22px',
          fontWeight: 500,
          backgroundColor: ok ? '#E6F4EA' : '#FEF7E0',
          color: ok ? '#128937' : '#B06000',
        };
  return (
    <Tooltip title={title}>
      <Chip
        label={ok === null ? `${label}: —` : label}
        size="small"
        variant={ok === null ? 'outlined' : 'filled'}
        tabIndex={0}
        onClick={onClick}
        clickable={Boolean(onClick)}
        icon={onClick ? <OpenInNew sx={{ fontSize: '12px !important' }} /> : undefined}
        sx={chipSx}
      />
    </Tooltip>
  );
};

/** Insere pontos de quebra (<wbr>) após "." e "_" para nomes longos quebrarem só nos separadores. */
const breakableName = (name: string): React.ReactNode =>
  name.split(/(?<=[._])/).map((part, i) => (
    <React.Fragment key={`${i}-${part}`}>
      {i > 0 && <wbr />}
      {part}
    </React.Fragment>
  ));

const RC18QualityByTable: React.FC<Props> = ({
  groups,
  unmappedRules,
  tables,
  catalogByTable,
  isDemo = false,
  subView,
  onSubViewChange,
  dimensionFilter,
  onDimensionFilterChange,
  statusFilter,
  onStatusFilterChange,
  tableStatusFilter,
  onTableStatusFilterChange,
  onOpenEntry,
  emptyText = 'Nenhum DataScan de qualidade de dados encontrado para o filtro atual.',
}) => {
  const [tableFilter, setTableFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [copiedRuleKey, setCopiedRuleKey] = useState<string | null>(null);
  const [expandedSqlKeys, setExpandedSqlKeys] = useState<Set<string>>(new Set());

  const validDimensionIds = useMemo(() => {
    const ids = new Set(groups.map((g) => g.id));
    if (unmappedRules.length > 0) ids.add(SEM_CORRESPONDENCIA);
    return ids;
  }, [groups, unmappedRules.length]);

  const validTableKeys = useMemo(() => new Set(tables.map((t) => t.canonicalKey)), [tables]);

  // Limpa seleções órfãs quando o escopo muda (evita aviso de valor fora de faixa no MUI Select).
  useEffect(() => {
    if (dimensionFilter && !validDimensionIds.has(dimensionFilter)) {
      onDimensionFilterChange('');
    }
  }, [dimensionFilter, validDimensionIds, onDimensionFilterChange]);

  useEffect(() => {
    if (tableFilter && !validTableKeys.has(tableFilter)) {
      setTableFilter('');
    }
  }, [tableFilter, validTableKeys]);

  const allRules = useMemo(() => {
    const combined = [...groups.flatMap((g) => g.rules), ...unmappedRules];
    // Mantém reprovadas primeiro mesmo ao misturar dimensões diferentes.
    const prio = (r: Rc18Rule) => (r.suspended ? 3 : r.executed && r.passed === false ? 0 : !r.executed ? 1 : 2);
    const affected = (r: Rc18Rule) => r.failedCount ?? r.assertionRowCount ?? -1;
    return combined.sort((a, b) => {
      const diff = prio(a) - prio(b);
      if (diff !== 0) return diff;
      if (prio(a) === 0) {
        const rowsDiff = affected(b) - affected(a);
        if (rowsDiff !== 0) return rowsDiff;
      }
      const tbl = a.tableKey.localeCompare(b.tableKey);
      return tbl !== 0 ? tbl : a.ruleName.localeCompare(b.ruleName);
    });
  }, [groups, unmappedRules]);

  const visibleRules = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return allRules.filter((r) => {
      if (dimensionFilter) {
        const ok = dimensionFilter === SEM_CORRESPONDENCIA ? r.dimensionId === null : r.dimensionId === dimensionFilter;
        if (!ok) return false;
      }
      if (tableFilter && r.canonicalKey !== tableFilter) return false;
      if (statusFilter === 'reprovadas' && !(r.executed && r.passed === false && !r.suspended)) return false;
      if (statusFilter === 'sem_execucao' && !(!r.executed && !r.suspended)) return false;
      if (statusFilter === 'aprovadas' && !(r.executed && r.passed === true && !r.suspended)) return false;
      if (statusFilter === 'suspensas' && !r.suspended) return false;
      if (q) {
        const hay = `${r.ruleName} ${r.description ?? ''} ${r.tableKey} ${r.column} ${r.dimensionName ?? ''} ${r.dimension}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRules, dimensionFilter, tableFilter, statusFilter, searchText]);

  const visibleTables = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return tables.filter((t) => {
      if (tableStatusFilter === 'com_falhas' && t.failedRules === 0) return false;
      if (tableStatusFilter === 'desatualizados' && !t.isStale) return false;
      if (tableStatusFilter === 'lacunas_governanca' && catalogByTable[t.canonicalKey]?.lacunaGovernanca !== true) {
        return false;
      }
      if (q && !t.fullTableName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tables, tableStatusFilter, searchText, catalogByTable]);

  const toggleSqlExpand = (key: string) => {
    setExpandedSqlKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopySql = async (key: string, sql: string) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(sql);
        setCopiedRuleKey(key);
        window.setTimeout(() => setCopiedRuleKey((curr) => (curr === key ? null : curr)), 2000);
        return;
      }
    } catch {
      // Fallback: abre o bloco SQL para cópia manual.
    }
    setExpandedSqlKeys((prev) => new Set(prev).add(key));
  };

  // Nome completo sempre visível (sem reticências nem tooltip só de mouse): quebra após "." e "_".
  const renderTableLink = (label: string, entryName: string | null) => {
    const clickable = Boolean(entryName && !isDemo && onOpenEntry);
    const text = (
      <Box component="span" sx={{ overflowWrap: 'break-word', minWidth: 0 }}>
        {breakableName(label)}
      </Box>
    );
    if (!clickable) {
      return (
        <Typography component="div" sx={{ fontSize: '12.5px', fontWeight: 500, color: '#1F1F1F' }}>
          {text}
        </Typography>
      );
    }
    return (
      <Button
        size="small"
        onClick={() => onOpenEntry!(entryName!)}
        endIcon={<OpenInNew sx={{ fontSize: '13px !important', flexShrink: 0 }} />}
        sx={{
          p: 0,
          minWidth: 0,
          maxWidth: '100%',
          textTransform: 'none',
          justifyContent: 'flex-start',
          textAlign: 'left',
          fontFamily: '"Google Sans Text", sans-serif',
          fontSize: '12.5px',
          fontWeight: 500,
          color: '#0B57D0',
          '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' },
        }}
      >
        {text}
      </Button>
    );
  };

  if (tables.length === 0) {
    return (
      <Alert severity="info" sx={{ borderRadius: '10px' }}>
        {emptyText}
      </Alert>
    );
  }

  const safeDimensionValue = validDimensionIds.has(dimensionFilter) ? dimensionFilter : '';
  const safeTableValue = validTableKeys.has(tableFilter) ? tableFilter : '';

  return (
    <Box
      sx={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #ECEEF4',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Barra de controles */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '16px 20px',
          borderBottom: '1px solid #E8EEF5',
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={subView}
          onChange={(_, val: QualitySubView | null) => {
            if (val) onSubViewChange(val);
          }}
          aria-label="Modo de visualização"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 500,
              fontSize: '13px',
              px: '14px',
              borderColor: '#D6D9E8',
              color: '#444746',
              '&.Mui-selected': {
                backgroundColor: '#E8F0FE',
                color: '#0B57D0',
                '&:hover': { backgroundColor: '#D2E3FC' },
              },
            },
          }}
        >
          <ToggleButton value="regras">Regras ({allRules.length})</ToggleButton>
          <ToggleButton value="tabelas">Tabelas ({tables.length})</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: '1 1 320px', justifyContent: 'flex-end' }}>
          <TextField
            size="small"
            placeholder={subView === 'regras' ? 'Buscar regra, coluna ou tabela...' : 'Buscar tabela...'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: '220px' }, maxWidth: { sm: '280px' } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: '#575757' }} />
                </InputAdornment>
              ),
            }}
          />

          {subView === 'regras' ? (
            <>
              <TextField
                select
                size="small"
                label="Situação"
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value as RulesStatusFilter)}
                sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: '175px' } }}
              >
                <MenuItem value="todas">Todas</MenuItem>
                <MenuItem value="reprovadas">Somente reprovadas</MenuItem>
                <MenuItem value="sem_execucao">Sem execução</MenuItem>
                <MenuItem value="aprovadas">Aprovadas</MenuItem>
                <MenuItem value="suspensas">Suspensas</MenuItem>
              </TextField>

              <TextField
                select
                size="small"
                label="Dimensão"
                value={safeDimensionValue}
                onChange={(e) => onDimensionFilterChange(e.target.value)}
                sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: '190px' } }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Todas as dimensões</MenuItem>
                {groups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.name} ({g.rules.length})
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
                value={safeTableValue}
                onChange={(e) => setTableFilter(e.target.value)}
                sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: '190px' } }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Todas as tabelas</MenuItem>
                {tables.map((t) => (
                  <MenuItem key={t.canonicalKey} value={t.canonicalKey}>
                    {t.fullTableName}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <TextField
              select
              size="small"
              label="Filtro de tabelas"
              value={tableStatusFilter}
              onChange={(e) => onTableStatusFilterChange(e.target.value as TablesStatusFilter)}
              sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: '195px' } }}
            >
              <MenuItem value="todas">Todas</MenuItem>
              <MenuItem value="com_falhas">Com falhas</MenuItem>
              <MenuItem value="desatualizados">Desatualizados (&gt;30d)</MenuItem>
              <MenuItem value="lacunas_governanca">Com lacunas de governança</MenuItem>
            </TextField>
          )}
        </Box>
      </Box>

      {/* Sub-aba Regras */}
      {subView === 'regras' && (
        <Box>
          <Box sx={{ px: '20px', py: '8px', borderBottom: '1px solid #F1F3F4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '12px', color: '#575757' }} data-testid="rc18-regras-contagem">
              Exibindo {visibleRules.length} de {allRules.length} regra(s)
            </Typography>
          </Box>
          <TableContainer>
            <Table sx={{ minWidth: 760 }} size="small" title="Regras de qualidade">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Regra</TableCell>
                  <TableCell sx={headCellSx}>Dimensão</TableCell>
                  <TableCell sx={headCellSx}>Tabela e coluna</TableCell>
                  <TableCell sx={headCellSx}>Resultado</TableCell>
                  <TableCell sx={headCellSx}>Situação</TableCell>
                  <TableCell sx={headCellSx}>Execução</TableCell>
                  <TableCell sx={headCellSx}>SQL reprovados</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 4, textAlign: 'center', color: '#575757' }}>
                      Nenhuma regra encontrada com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRules.map((rule, idx) => {
                    const rowKey = `${rule.scanId ?? ''}|${rule.canonicalKey}|${rule.ruleName}|${idx}`;
                    const hasSql = Boolean(rule.failedRecordsQuery);
                    const expanded = expandedSqlKeys.has(rowKey);
                    const copied = copiedRuleKey === rowKey;
                    return (
                      <React.Fragment key={rowKey}>
                        <TableRow hover>
                          <TableCell sx={{ ...bodyCellSx, minWidth: '200px', maxWidth: '260px' }}>
                            <Typography sx={{ fontSize: '12.5px', fontWeight: 500, color: '#1F1F1F', overflowWrap: 'break-word' }}>
                              {rule.ruleName}
                            </Typography>
                            {rule.description && (
                              <Typography sx={{ fontSize: '11.5px', color: '#575757', mt: '2px', overflowWrap: 'break-word' }}>
                                {rule.description}
                              </Typography>
                            )}
                            <Typography sx={{ fontSize: '11px', color: '#70757A', mt: '2px' }}>
                              {rule.ruleType}
                              {rule.threshold !== null ? ` · Limiar ${formatThreshold(rule.threshold)}` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell sx={bodyCellSx}>
                            <Typography sx={{ fontSize: '12.5px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {rule.dimensionName ?? 'Sem correspondência'}
                            </Typography>
                            <Typography sx={{ fontSize: '11px', color: '#70757A', fontFamily: 'monospace' }}>
                              {rule.dimension}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ ...bodyCellSx, minWidth: '165px', maxWidth: '210px' }}>
                            {renderTableLink(rule.tableKey, rule.entryName)}
                            {rule.column !== '—' && (
                              <Typography sx={{ fontSize: '11.5px', color: '#575757', fontFamily: 'monospace', mt: '2px' }}>
                                {rule.column}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ ...bodyCellSx, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {ruleResultText(rule)}
                          </TableCell>
                          <TableCell sx={bodyCellSx}>
                            <RuleStatus rule={rule} />
                          </TableCell>
                          <TableCell sx={{ ...bodyCellSx, whiteSpace: 'nowrap' }}>
                            <Typography sx={{ fontSize: '12px', color: '#444746' }}>
                              {rule.executionTime ? formatEvidenceValue(rule.executionTime) : '—'}
                            </Typography>
                            {rule.isStale && (
                              <Chip
                                label={`Desatualizado (${formatCount(rule.daysSinceExecution)}d)`}
                                size="small"
                                sx={{ mt: '4px', height: '20px', fontSize: '10.5px', backgroundColor: '#FEF7E0', color: '#B06000', fontWeight: 500 }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ ...bodyCellSx, whiteSpace: 'nowrap' }}>
                            {hasSql ? (
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Tooltip title={copied ? 'SQL copiado' : 'Copiar query de registros reprovados'}>
                                  <IconButton
                                    size="small"
                                    aria-label={`Copiar SQL da regra ${rule.ruleName}`}
                                    onClick={() => handleCopySql(rowKey, rule.failedRecordsQuery)}
                                    sx={{ color: copied ? '#128937' : '#0B57D0' }}
                                  >
                                    {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={expanded ? 'Ocultar SQL' : 'Visualizar SQL'}>
                                  <IconButton
                                    size="small"
                                    aria-label={`Ver SQL da regra ${rule.ruleName}`}
                                    onClick={() => toggleSqlExpand(rowKey)}
                                    sx={{ color: expanded ? '#0B57D0' : '#575757' }}
                                  >
                                    <CodeIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ) : (
                              <Typography sx={{ fontSize: '12px', color: '#9AA0A6' }}>—</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                        {hasSql && (
                          <TableRow>
                            <TableCell colSpan={7} sx={{ p: 0, borderBottom: expanded ? '1px solid #E8EEF5' : 'none' }}>
                              <Collapse in={expanded} unmountOnExit>
                                <Box
                                  component="pre"
                                  data-testid={`rc18-sql-${rule.ruleName}`}
                                  sx={{
                                    m: 0,
                                    px: '20px',
                                    py: '12px',
                                    backgroundColor: '#F8FAFC',
                                    color: '#1F1F1F',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    overflowWrap: 'anywhere',
                                    maxWidth: '100%',
                                  }}
                                >
                                  {rule.failedRecordsQuery}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Sub-aba Tabelas */}
      {subView === 'tabelas' && (
        <TableContainer>
          <Table sx={{ minWidth: 760 }} size="small" title="Tabelas com regras de qualidade">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Tabela</TableCell>
                <TableCell sx={headCellSx}>Falhas / Regras</TableCell>
                <TableCell sx={headCellSx}>Dimensões com regras</TableCell>
                <TableCell sx={headCellSx}>Governança no catálogo</TableCell>
                <TableCell sx={headCellSx}>Última execução</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleTables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: '#575757' }}>
                    Nenhuma tabela encontrada com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                visibleTables.map((ts) => {
                  const cat = catalogByTable[ts.canonicalKey] || null;
                  const contactsOk = cat && cat.contactsCount !== null ? cat.contactsCount > 0 : null;
                  const descOk =
                    cat && cat.totalColumns !== null && cat.columnsWithDescription !== null
                      ? cat.totalColumns === 0 || cat.columnsWithDescription === cat.totalColumns
                      : null;
                  const glossaryOk = cat && cat.glossaryTermLinks !== null ? cat.glossaryTermLinks > 0 : null;
                  const lineageOk = cat ? cat.hasUpstream : null;

                  return (
                    <TableRow key={ts.canonicalKey} hover>
                      <TableCell sx={{ ...bodyCellSx, minWidth: '190px', maxWidth: '250px' }}>
                        {renderTableLink(ts.fullTableName, ts.entryName)}
                        {ts.ignoredDuplicates.length > 0 && (
                          <Typography sx={{ fontSize: '11px', color: '#575757', mt: '2px' }}>
                            Scan ativo: {ts.scanId} ({ts.ignoredDuplicates.length} duplicado(s) ignorado(s))
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: 'nowrap' }}>
                        {ts.failedRules > 0 ? (
                          <StatusDotLabel
                            color="#C5221F"
                            label={`${ts.failedRules} ${ts.failedRules === 1 ? 'falha' : 'falhas'}`}
                          />
                        ) : ts.status === 'Sem execução' ? (
                          <StatusDotLabel color="#B06000" label="Sem execução" />
                        ) : (
                          <StatusDotLabel color="#128937" label="Sem falhas" />
                        )}
                        <Typography sx={{ fontSize: '11.5px', color: '#575757', mt: '2px' }}>
                          {tableRulesText(ts)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {ts.dimensionScores.length === 0 ? (
                            <Typography sx={{ fontSize: '12px', color: '#575757' }}>Sem regras</Typography>
                          ) : (
                            ts.dimensionScores.map((d) => {
                              const hasFail = d.rulesFailed > 0;
                              const color = hasFail ? '#C5221F' : d.rulesEvaluated > 0 ? '#128937' : '#575757';
                              const bg = hasFail ? '#FCE8E6' : d.rulesEvaluated > 0 ? '#E6F4EA' : '#F1F3F4';
                              return (
                                <Chip
                                  key={d.id}
                                  size="small"
                                  label={`${d.name} ${formatPct(d.scorePct)}`}
                                  title={`${d.name}: ${d.rulesPassed} de ${d.rulesEvaluated} regras aprovadas`}
                                  sx={{ backgroundColor: bg, color, fontWeight: 500, fontSize: '11px', height: '22px' }}
                                />
                              );
                            })
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <GovernanceTag
                            label="Contatos"
                            ok={contactsOk}
                            detail={
                              cat && cat.found === false
                                ? 'sem entrada no catálogo'
                                : cat && cat.contactsCount !== null
                                ? `${cat.contactsCount} contato(s)`
                                : undefined
                            }
                          />
                          <GovernanceTag
                            label="Descrições"
                            ok={descOk}
                            detail={
                              cat && cat.totalColumns !== null
                                ? `${cat.columnsWithDescription} de ${cat.totalColumns} colunas`
                                : undefined
                            }
                          />
                          <GovernanceTag
                            label="Glossário"
                            ok={glossaryOk}
                            detail={
                              cat && cat.found === false
                                ? 'sem entrada no catálogo'
                                : cat && cat.glossaryTermLinks !== null
                                ? `${cat.glossaryTermLinks}${cat.glossaryLinksTruncated ? '+' : ''} vínculo(s)`
                                : undefined
                            }
                          />
                          <GovernanceTag
                            label="Linhagem"
                            ok={lineageOk}
                            detail={
                              cat && cat.upstreamCount !== null
                                ? `${cat.upstreamCount}${cat.upstreamTruncated ? '+' : ''} origem(ns)`
                                : undefined
                            }
                            onClick={
                              ts.entryName && !isDemo && onOpenEntry
                                ? () => onOpenEntry(ts.entryName!, 'lineage')
                                : undefined
                            }
                            actionHint="abrir a aba Lineage"
                          />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: '12px', color: '#444746' }}>
                          {ts.lastExecutionTime ? formatEvidenceValue(ts.lastExecutionTime) : '—'}
                        </Typography>
                        {ts.isStale && (
                          <Chip
                            label={`Desatualizado (${formatCount(ts.daysSinceExecution)}d)`}
                            size="small"
                            sx={{ mt: '4px', height: '20px', fontSize: '10.5px', backgroundColor: '#FEF7E0', color: '#B06000', fontWeight: 500 }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default RC18QualityByTable;

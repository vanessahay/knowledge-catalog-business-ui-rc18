import React from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Link, Typography } from '@mui/material';
import {
  type Rc18Coleta,
  type Rc18Dimension,
  type Rc18DimensionsReport,
  type Rc18Estado,
  formatEvidenceValue,
  formatIsoDate,
  formatPct,
} from './rc18Types';

/**
 * Visão geral das 12 dimensões de qualidade da informação (art. 2º, § 2º, da Resolução
 * Conjunta nº 18/2025). Mostra apenas o que foi medido; dimensões sem coleta aparecem como
 * "não medido automaticamente" — nunca com um percentual presumido.
 */

const ESTADO_STYLE: Record<Rc18Estado, { label: string; bg: string; fg: string }> = {
  // Azul (e não verde): "medido" significa que há indicador, não que o resultado é bom.
  medido: { label: 'Medido', bg: '#E8F0FE', fg: '#174EA6' },
  sem_dados: { label: 'Sem dados no escopo', bg: '#FEF7E0', fg: '#B06000' },
  nao_medido: { label: 'Não medido automaticamente', bg: '#F1F3F4', fg: '#5F6368' },
};

const COLETA_LABEL: Record<Rc18Coleta, string> = {
  automatica: 'Coleta: regras de qualidade (DataScans)',
  parcial: 'Coleta: indicador técnico parcial',
  declaratoria: 'Coleta: sem coletor nesta versão (evidência a cargo da instituição)',
};

const MAX_EVIDENCES = 3;

const DimensionCard: React.FC<{ dimension: Rc18Dimension }> = ({ dimension: d }) => {
  const estado = ESTADO_STYLE[d.estado];
  return (
    <Card
      data-testid={`rc18-dimensao-${d.id}`}
      sx={{ height: '100%', borderRadius: '16px', border: '1px solid #E0E0E0', boxShadow: 'none' }}
    >
      <CardContent sx={{ padding: '20px' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', mb: 1 }}>
          <Typography variant="caption" sx={{ color: '#5F6368', fontWeight: 700 }}>
            Inciso {d.inciso}
          </Typography>
          <Chip
            label={estado.label}
            size="small"
            sx={{ backgroundColor: estado.bg, color: estado.fg, fontWeight: 700 }}
          />
        </Box>

        <Typography variant="h6" component="h3" sx={{ fontWeight: 700, color: '#1F1F1F' }}>
          {d.nome}
        </Typography>
        <Typography variant="body2" sx={{ color: '#5F6368', fontStyle: 'italic', fontSize: '12.5px', mt: 0.5, mb: 1.5 }}>
          “{d.definicao}”
        </Typography>

        {d.indicadores.map((ind) => (
          <Box key={ind.id} sx={{ mb: 1.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1F1F1F', lineHeight: 1.1 }}>
              {formatPct(ind.valorPct)}
            </Typography>
            <Typography variant="caption" sx={{ color: '#5F6368' }}>
              {ind.numerador} de {ind.denominador} {ind.unidade} — {ind.rotulo}
            </Typography>
          </Box>
        ))}

        {d.indicadores.length === 0 && (
          <Typography variant="body2" sx={{ color: '#3C4043', fontSize: '13px', mb: 1.5 }}>
            {d.estado === 'sem_dados'
              ? `Sem indicador no escopo consultado. ${d.comoEMedido ?? ''}`
              : d.lacuna}
          </Typography>
        )}

        {d.estado === 'nao_medido' && d.dqDimensions.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', color: '#3C4043', mb: 1 }}>
            Para incluir um indicador: marque regras de DataScan com a dimensão personalizada{' '}
            <strong>{d.dqDimensions[d.dqDimensions.length - 1]}</strong>.
          </Typography>
        )}

        {d.regras.naoExecutadas > 0 && (
          <Typography variant="caption" sx={{ display: 'block', color: '#B06000', mb: 1 }}>
            {d.regras.naoExecutadas} regra(s) configurada(s) sem execução — fora do cálculo.
          </Typography>
        )}

        {d.evidencias.slice(0, MAX_EVIDENCES).map((ev, idx) => (
          <Typography key={idx} variant="caption" sx={{ display: 'block', color: '#5F6368', overflowWrap: 'anywhere' }}>
            {ev.rotulo}: {formatEvidenceValue(ev.valor)}
          </Typography>
        ))}
        {d.evidencias.length > MAX_EVIDENCES && (
          <Typography variant="caption" sx={{ display: 'block', color: '#5F6368' }}>
            e mais {d.evidencias.length - MAX_EVIDENCES} item(ns).
          </Typography>
        )}

        <Box sx={{ borderTop: '1px solid #F1F3F4', mt: 1.5, pt: 1.5 }}>
          <Typography variant="caption" sx={{ display: 'block', color: '#5F6368' }}>
            {COLETA_LABEL[d.coleta]}
            {d.fontes.length > 0 ? ` • ${d.fontes.join('; ')}` : ''}
          </Typography>
          {d.indicadores.length > 0 && (
            <Typography variant="caption" sx={{ display: 'block', color: '#5F6368', mt: 0.5 }}>
              Limite do indicador: {d.lacuna}
            </Typography>
          )}
          <Typography variant="caption" sx={{ display: 'block', color: '#80868B', mt: 0.5 }}>
            Dimensões de DataScan agregadas: {d.dqDimensions.join(', ')}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

const RC18DimensionsOverview: React.FC<{ report: Rc18DimensionsReport }> = ({ report }) => {
  const { norma, escopo, resumo } = report;
  return (
    <Box>
      <Alert severity="info" sx={{ marginBottom: '16px', borderRadius: '8px' }}>
        <strong>{norma.nome}</strong> — {norma.dispositivoDimensoes}. {norma.aviso}{' '}
        Prazo de adequação: {formatIsoDate(norma.prazoAdequacao)} (art. 12).{' '}
        <Link href={norma.url} target="_blank" rel="noopener noreferrer">
          Texto do normativo
        </Link>
      </Alert>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <Chip label={`${resumo.medidas} com indicador`} size="small" sx={{ backgroundColor: '#E8F0FE', color: '#174EA6', fontWeight: 700 }} />
        <Chip label={`${resumo.semDados} sem dados no escopo`} size="small" sx={{ backgroundColor: '#FEF7E0', color: '#B06000', fontWeight: 700 }} />
        <Chip label={`${resumo.naoMedidas} não medida(s) automaticamente`} size="small" sx={{ backgroundColor: '#F1F3F4', color: '#5F6368', fontWeight: 700 }} />
      </Box>

      <Typography variant="body2" sx={{ color: '#5F6368', fontSize: '13px', marginBottom: '16px' }}>
        Escopo: {escopo.tabelas.length} tabela(s) — {escopo.criterio}. DataScans de qualidade lidos:{' '}
        {escopo.scansLidos} de {escopo.scansDeQualidade}
        {escopo.truncado ? ' (lista truncada pelo limite do painel)' : ''}.
      </Typography>

      {escopo.tabelas.length === 0 && (
        <Alert severity="warning" sx={{ marginBottom: '16px', borderRadius: '8px' }}>
          Nenhum DataScan de qualidade de dados foi encontrado neste projeto e localização. Sem escopo, nenhuma
          dimensão pode ser medida.
        </Alert>
      )}

      {report.regrasSemMapeamento.length > 0 && (
        <Alert severity="info" sx={{ marginBottom: '16px', borderRadius: '8px' }}>
          Regras com dimensão de DataScan sem correspondência (fora dos indicadores):{' '}
          {report.regrasSemMapeamento.map((r) => `${r.dqDimension} (${r.quantidade})`).join(', ')}.
        </Alert>
      )}

      <Grid container spacing={2}>
        {report.dimensoes.map((d) => (
          <Grid key={d.id} size={{ xs: 12, md: 6, lg: 4 }}>
            <DimensionCard dimension={d} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default RC18DimensionsOverview;

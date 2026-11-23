import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Link, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  type Rc18Coleta,
  type Rc18Dimension,
  type Rc18DimensionsReport,
  type Rc18Estado,
  type Rc18Indicator,
  formatCount,
  formatEvidenceValue,
  formatIsoDate,
  formatPct,
} from './rc18Types';

/**
 * Visão geral das 12 dimensões de qualidade da informação da Resolução Conjunta nº 18/2025.
 *
 * À vista ficam só o nome, a situação e o indicador de cada dimensão — nunca um percentual
 * presumido. O que é medido, a coleta, o limite do indicador, as evidências e como medir no
 * Google Cloud ficam em "Ver detalhes": um elemento <details> nativo, fechado por padrão, cujo
 * conteúdo continua na página (acessível por teclado e pela busca do navegador).
 *
 * A tela não reproduz o texto da Resolução nem cita artigos; o link do aviso leva ao normativo.
 */

const ESTADO_STYLE: Record<Rc18Estado, { label: string; bg: string; fg: string }> = {
  // Azul (e não verde): "medido" significa que há indicador, não que o resultado é bom.
  medido: { label: 'Medido', bg: '#E8F0FE', fg: '#174EA6' },
  sem_dados: { label: 'Sem dados no escopo', bg: '#FEF7E0', fg: '#B06000' },
  nao_medido: { label: 'Não medido automaticamente', bg: '#F1F3F4', fg: '#5F6368' },
};

const COLETA_LABEL: Record<Rc18Coleta, string> = {
  automatica: 'Regras de qualidade (DataScans)',
  parcial: 'Indicador técnico parcial',
  declaratoria: 'Regras de DataScan marcadas com a dimensão personalizada (nenhuma executada no escopo)',
};
const COLETA_REGRAS_PERSONALIZADAS = 'Regras de DataScan marcadas com a dimensão personalizada';

const MAX_EVIDENCES = 3;

/** Legenda curta do indicador, por exemplo "64 de 69 regras aprovadas". */
const indicatorCaption = (ind: Rc18Indicator): string =>
  `${formatCount(ind.numerador)} de ${formatCount(ind.denominador)} ${ind.rotuloCurto ?? `${ind.unidade} — ${ind.rotulo}`}`;

const captionRowSx = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '8px' } as const;

const textButtonSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: '12px',
  lineHeight: 1.66,
  padding: 0,
  minWidth: 0,
} as const;

const detailsSx = {
  mt: 1.5,
  '& > summary': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    cursor: 'pointer',
    listStyle: 'none',
    color: '#1A73E8',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '4px',
    userSelect: 'none',
    '&::-webkit-details-marker': { display: 'none' },
    '&:hover': { textDecoration: 'underline' },
    '&:focus-visible': { outline: '2px solid #1A73E8', outlineOffset: '2px' },
  },
  '& > summary .rc18-seta': {
    fontSize: '18px',
    transition: 'transform 150ms ease',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  },
  '&[open] > summary .rc18-seta': { transform: 'rotate(180deg)' },
  // O rótulo acompanha o estado aberto/fechado sem JavaScript.
  '&[open] > summary .rc18-ao-fechado, &:not([open]) > summary .rc18-ao-aberto': { display: 'none' },
} as const;

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Typography variant="caption" component="div" sx={{ color: '#3C4043', fontWeight: 700 }}>
      {label}
    </Typography>
    <Typography variant="caption" component="div" sx={{ color: '#5F6368', overflowWrap: 'anywhere' }}>
      {children}
    </Typography>
  </Box>
);

const DimensionCard: React.FC<{ dimension: Rc18Dimension; onShowRules?: (dimensionId: string) => void }> = ({
  dimension: d,
  onShowRules,
}) => {
  const estado = ESTADO_STYLE[d.estado];
  const medicao = d.medicao ?? [];
  const semIndicador = d.indicadores.length === 0;
  const temIndicadorDeRegras = d.indicadores.some((ind) => ind.id === 'regras_dq');
  const rulesButton =
    d.regras.total > 0 && onShowRules ? (
      <Button size="small" onClick={() => onShowRules(d.id)} aria-label={`Ver regras de ${d.nome}`} sx={textButtonSx}>
        Ver regras
      </Button>
    ) : null;

  return (
    <Card
      data-testid={`rc18-dimensao-${d.id}`}
      sx={{ borderRadius: '16px', border: '1px solid #E0E0E0', boxShadow: 'none' }}
    >
      <CardContent sx={{ padding: '20px', '&:last-child': { paddingBottom: '20px' } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', mb: 0.5 }}>
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

        {d.indicadores.map((ind) => (
          <Box key={ind.id} sx={{ mt: 1.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1F1F1F', lineHeight: 1.1 }}>
              {formatPct(ind.valorPct)}
            </Typography>
            <Box sx={captionRowSx}>
              <Typography variant="caption" sx={{ color: '#5F6368' }}>
                {indicatorCaption(ind)}
                {ind.id === 'regras_dq' && d.regras.naoExecutadas > 0 ? ` · ${d.regras.naoExecutadas} sem execução` : ''}
              </Typography>
              {ind.id === 'regras_dq' && rulesButton}
            </Box>
          </Box>
        ))}

        {semIndicador && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="h4" aria-hidden="true" sx={{ fontWeight: 800, color: '#BDC1C6', lineHeight: 1.1 }}>
              —
            </Typography>
            <Typography variant="caption" sx={{ color: '#5F6368' }}>
              Sem indicador
            </Typography>
          </Box>
        )}

        {/* Regras configuradas e ainda não executadas, quando não há indicador de regras. */}
        {!temIndicadorDeRegras && d.regras.total > 0 && (
          <Box sx={{ ...captionRowSx, mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#B06000' }}>
              {d.regras.naoExecutadas} regra(s) sem execução
            </Typography>
            {rulesButton}
          </Box>
        )}

        <Box component="details" data-testid={`rc18-detalhes-${d.id}`} sx={detailsSx}>
          <summary>
            <span className="rc18-ao-fechado">Ver detalhes</span>
            <span className="rc18-ao-aberto">Ocultar detalhes</span>
            <ExpandMoreIcon className="rc18-seta" aria-hidden="true" />
          </summary>

          <Box sx={{ display: 'grid', gap: '10px', mt: 1.5, pt: 1.5, borderTop: '1px solid #F1F3F4' }}>
            {semIndicador ? (
              <DetailItem label="Por que não há indicador">
                {d.estado === 'sem_dados' ? `Sem indicador no escopo consultado. ${d.comoEMedido ?? ''}`.trim() : d.lacuna}
                {d.estado === 'nao_medido' && d.dqDimensions.length > 0 && (
                  <>
                    {' '}
                    Para incluir um indicador: marque regras de DataScan com a dimensão personalizada{' '}
                    <strong>{d.dqDimensions[d.dqDimensions.length - 1]}</strong>.
                  </>
                )}
              </DetailItem>
            ) : (
              <DetailItem label="O que é medido">
                {d.indicadores.map((ind) => (
                  <Box key={ind.id}>{ind.rotulo}</Box>
                ))}
                {d.regras.naoExecutadas > 0 && (
                  <Box sx={{ color: '#B06000' }}>
                    {d.regras.naoExecutadas} regra(s) configurada(s) sem execução — fora do cálculo.
                  </Box>
                )}
              </DetailItem>
            )}

            <DetailItem label="Coleta">
              {d.porRegrasPersonalizadas ? COLETA_REGRAS_PERSONALIZADAS : COLETA_LABEL[d.coleta]}
              {d.fontes.length > 0 ? ` • ${d.fontes.join('; ')}` : ''}
            </DetailItem>

            {!semIndicador && <DetailItem label="Limite do indicador">{d.lacuna}</DetailItem>}

            {d.evidencias.length > 0 && (
              <DetailItem label="Evidências">
                {d.evidencias.slice(0, MAX_EVIDENCES).map((ev, idx) => (
                  <Box key={idx}>
                    {ev.rotulo}: {formatEvidenceValue(ev.valor)}
                  </Box>
                ))}
                {d.evidencias.length > MAX_EVIDENCES && <Box>e mais {d.evidencias.length - MAX_EVIDENCES} item(ns).</Box>}
              </DetailItem>
            )}

            <DetailItem label="Dimensões de DataScan agregadas">{d.dqDimensions.join(', ')}</DetailItem>

            {medicao.length > 0 && (
              <DetailItem label="Como medir no Google Cloud">
                <Box component="ul" data-testid={`rc18-medicao-${d.id}`} sx={{ margin: '2px 0 4px', paddingLeft: '18px' }}>
                  {medicao.map((m) => (
                    <li key={m.recurso}>
                      <strong>{m.recurso}:</strong> {m.acao}
                    </li>
                  ))}
                </Box>
                Regras e comandos de exemplo: pasta rc18-kit do repositório.
              </DetailItem>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const RC18DimensionsOverview: React.FC<{
  report: Rc18DimensionsReport;
  /** Abre a lista de regras de uma dimensão (visão "Qualidade por tabela"). */
  onShowRules?: (dimensionId: string) => void;
}> = ({ report, onShowRules }) => {
  const { norma, escopo, resumo } = report;
  return (
    <Box>
      <Alert severity="info" sx={{ marginBottom: '16px', borderRadius: '8px' }}>
        <strong>{norma.nome}.</strong> {norma.aviso} Prazo de adequação: {formatIsoDate(norma.prazoAdequacao)}.{' '}
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

      <Box
        data-testid="rc18-dimensoes-grade"
        sx={{
          display: 'grid',
          gap: '16px',
          // Cabem tantos cartões por linha quanto a largura permitir (quatro em telas largas).
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
          // Os cartões de uma linha têm a mesma altura; com algum "Ver detalhes" aberto, cada um
          // fica com a própria altura, para o cartão aberto não esticar os vizinhos.
          '&:has(details[open])': { alignItems: 'start' },
        }}
      >
        {report.dimensoes.map((d) => (
          <DimensionCard key={d.id} dimension={d} onShowRules={onShowRules} />
        ))}
      </Box>
    </Box>
  );
};

export default RC18DimensionsOverview;

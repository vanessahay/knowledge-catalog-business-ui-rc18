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

import React from 'react';
import { Box, Button, Divider, Drawer, IconButton, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import {
  SITUACAO_STYLE,
  type Rc18Coleta,
  type Rc18Dimension,
  formatCount,
  formatEvidenceValue,
  formatIndicatorPct,
} from './rc18Types';

/**
 * Gaveta lateral de detalhes de uma dimensão RC 18 no padrão do KC Business UI
 * (equivalente ao `ConfigurationsPanel` de Data Quality).
 */

const COLETA_LABEL: Record<Rc18Coleta, string> = {
  automatica: 'Regras de qualidade (DataScans)',
  parcial: 'Indicador técnico parcial',
  declaratoria: 'Regras de DataScan marcadas com a dimensão personalizada (nenhuma executada no escopo)',
};
const COLETA_REGRAS_PERSONALIZADAS = 'Regras de DataScan marcadas com a dimensão personalizada';
const DRAWER_TITLE_ID = 'rc18-drawer-title';

interface Props {
  dimension: Rc18Dimension | null;
  onClose: () => void;
  onShowRules?: (dimensionId: string, onlyFailed: boolean) => void;
  /** `false` quando a listagem ou parte dos DataScans não pôde ser lida: nada é afirmado sobre regras. */
  escopoLido?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <Typography
      sx={{
        fontFamily: '"Google Sans", sans-serif',
        fontSize: '12px',
        fontWeight: 500,
        color: '#444746',
        letterSpacing: '0.2px',
        textTransform: 'uppercase',
      }}
    >
      {title}
    </Typography>
    <Box sx={{ fontSize: '13px', color: '#1F1F1F', lineHeight: 1.5, wordBreak: 'break-word' }}>
      {children}
    </Box>
  </Box>
);

const RC18DimensionDrawer: React.FC<Props> = ({ dimension: d, onClose, onShowRules, escopoLido = true }) => {
  const tone = d ? SITUACAO_STYLE[d.situacao] : null;
  const hasRules = d ? d.regras.total + d.regras.suspensas > 0 : false;
  const semIndicador = d ? d.indicadores.length === 0 : true;
  // Regras da dimensão que existem no escopo mas não foram executadas (sem execução ou suspensas).
  const regrasInativas = d ? d.regras.naoExecutadas + d.regras.suspensas : 0;

  return (
    <Drawer
      anchor="right"
      open={Boolean(d)}
      onClose={onClose}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': DRAWER_TITLE_ID,
        sx: {
          width: { xs: '100%', sm: '30rem' },
          backgroundColor: '#FFFFFF',
          boxShadow: '-0.25rem 0rem 0.75rem rgba(0, 0, 0, 0.08)',
        },
      }}
    >
      {d && tone && (
        <Box
          data-testid="rc18-dimension-drawer"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '20px 24px',
            boxSizing: 'border-box',
            gap: '16px',
          }}
        >
          {/* Cabeçalho */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Typography
                id={DRAWER_TITLE_ID}
                component="h2"
                sx={{
                  fontFamily: '"Google Sans", sans-serif',
                  fontSize: '18px',
                  fontWeight: 500,
                  color: '#1F1F1F',
                  lineHeight: 1.3,
                }}
              >
                {d.nome}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    px: '10px',
                    py: '2px',
                    borderRadius: '12px',
                    backgroundColor: tone.bg,
                  }}
                >
                  <Box
                    sx={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: tone.color,
                    }}
                  />
                  <Typography sx={{ fontSize: '12px', fontWeight: 500, color: tone.color }}>
                    {d.situacao === 'com_falhas'
                      ? `${d.regras.reprovadas} ${d.regras.reprovadas === 1 ? 'falha' : 'falhas'}`
                      : tone.label}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '12px', color: '#575757' }}>
                  {d.categoria === 'dados' ? 'Qualidade dos dados' : 'Governança no catálogo'}
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={onClose} aria-label="Fechar detalhes" size="small" sx={{ color: '#444746' }}>
              <Close fontSize="small" />
            </IconButton>
          </Box>

          <Divider sx={{ borderColor: '#E8EEF5' }} />

          {/* Corpo com rolagem */}
          <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', pr: '4px' }}>
            {semIndicador ? (
              <Section title="Por que não há indicador">
                <Typography sx={{ fontSize: '13px', color: '#444746' }}>
                  {d.estado === 'sem_dados' && regrasInativas === 0 && escopoLido
                    ? `Sem indicador no escopo consultado. ${d.comoEMedido ?? ''}`.trim()
                    : d.lacuna}
                </Typography>
                {d.estado === 'nao_medido' && regrasInativas === 0 && escopoLido && d.dqDimensions.length > 0 && (
                  <Typography sx={{ fontSize: '13px', color: '#444746', mt: 1 }}>
                    Para incluir um indicador: marque regras de DataScan com a dimensão personalizada{' '}
                    <strong>{d.dqDimensions[d.dqDimensions.length - 1]}</strong>.
                  </Typography>
                )}
              </Section>
            ) : (
              <Section title="O que é medido">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {d.indicadores.map((ind) => (
                    <Box
                      key={ind.id}
                      sx={{
                        p: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #E8EEF5',
                        backgroundColor: '#F8FAFC',
                      }}
                    >
                      <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1F1F1F' }}>
                        {formatIndicatorPct(ind)} ({formatCount(ind.numerador)} de {formatCount(ind.denominador)}{' '}
                        {ind.rotuloCurto ?? ind.unidade}
                        {ind.naoVerificadas ? ` · ${ind.naoVerificadas} tabela(s) não verificada(s)` : ''})
                      </Typography>
                      <Typography sx={{ fontSize: '12px', color: '#575757', mt: '2px' }}>
                        {ind.rotulo}
                      </Typography>
                    </Box>
                  ))}
                  {d.regras.naoExecutadas > 0 && (
                    <Typography sx={{ fontSize: '12px', color: '#B06000' }}>
                      {d.regras.naoExecutadas} regra(s) configurada(s) sem execução — fora do cálculo.
                    </Typography>
                  )}
                  {d.regras.suspensas > 0 && (
                    <Typography sx={{ fontSize: '12px', color: '#575757' }}>
                      {d.regras.suspensas} regra(s) suspensa(s) — fora do cálculo.
                    </Typography>
                  )}
                </Box>
              </Section>
            )}

            <Section title="Coleta e fontes">
              <Typography sx={{ fontSize: '13px', color: '#444746' }}>
                {d.porRegrasPersonalizadas || (!escopoLido && d.coleta === 'declaratoria')
                  ? COLETA_REGRAS_PERSONALIZADAS
                  : COLETA_LABEL[d.coleta]}
                {d.fontes.length > 0 ? ` • ${d.fontes.join('; ')}` : ''}
              </Typography>
            </Section>

            {!semIndicador && (
              <Section title="Limite do indicador">
                <Typography sx={{ fontSize: '13px', color: '#444746' }}>{d.lacuna}</Typography>
              </Section>
            )}

            {d.evidencias.length > 0 && (
              <Section title="Evidências coletadas">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {d.evidencias.map((ev, idx) => (
                    <Typography key={idx} sx={{ fontSize: '12px', color: '#444746' }}>
                      <strong>{ev.rotulo}:</strong> {formatEvidenceValue(ev.valor)}
                    </Typography>
                  ))}
                </Box>
              </Section>
            )}

            <Section title="Dimensões de DataScan agregadas">
              <Typography sx={{ fontSize: '12px', fontFamily: 'monospace', color: '#444746' }}>
                {d.dqDimensions.join(', ')}
              </Typography>
            </Section>

            {(d.medicao ?? []).length > 0 && (
              <Section title="Como medir no Google Cloud">
                <Box component="ul" sx={{ m: 0, pl: '18px', color: '#444746', fontSize: '12.5px' }}>
                  {(d.medicao ?? []).map((m) => (
                    <li key={m.recurso} style={{ marginBottom: '6px' }}>
                      <strong>{m.recurso}:</strong> {m.acao}
                    </li>
                  ))}
                </Box>
                <Typography sx={{ fontSize: '12px', color: '#575757', mt: '4px' }}>
                  Regras e comandos de exemplo: pasta rc18-kit do repositório.
                </Typography>
              </Section>
            )}
          </Box>

          {/* Rodapé */}
          {hasRules && onShowRules && (
            <>
              <Divider sx={{ borderColor: '#E8EEF5' }} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => {
                    onShowRules(d.id, d.regras.reprovadas > 0);
                    onClose();
                  }}
                  sx={{
                    backgroundColor: '#0B57D0',
                    textTransform: 'none',
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 500,
                    borderRadius: '8px',
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#0842A0', boxShadow: 'none' },
                  }}
                >
                  {d.regras.reprovadas > 0 ? `Ver ${d.regras.reprovadas} falha(s)` : 'Ver regras'}
                </Button>
              </Box>
            </>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default RC18DimensionDrawer;

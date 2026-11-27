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

import React, { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Typography } from '@mui/material';
import RC18DimensionDrawer from './RC18DimensionDrawer';
import {
  SITUACAO_STYLE,
  type Rc18Dimension,
  type Rc18Indicator,
  type Rc18OverviewResponse,
  escopoVazioTexto,
  formatCount,
  formatIndicatorPct,
  scansSemLeitura,
} from './rc18Types';

/**
 * Visão geral das 12 dimensões RC 18 no padrão visual do Knowledge Catalog Business UI:
 *  - Faixa superior de não conformidades em aberto (4 KPIs clicáveis);
 *  - Separação clara entre "Qualidade dos dados" (8 dimensões) e "Governança no catálogo" (4);
 *  - Cartões enxutos sem referências a artigos/incisos e sem parágrafos (detalhes na gaveta lateral).
 */

interface Props {
  overview: Rc18OverviewResponse;
  onShowDimensionRules: (dimensionId: string, onlyFailed: boolean) => void;
  onJumpToFailedRules: () => void;
  onJumpToFailedTables: () => void;
  onJumpToStaleTables: () => void;
  onJumpToGovernanceGaps: () => void;
}

const indicatorCaption = (ind: Rc18Indicator): string =>
  `${formatCount(ind.numerador)} de ${formatCount(ind.denominador)} ${ind.rotuloCurto ?? ind.unidade}${
    ind.naoVerificadas ? ` · ${ind.naoVerificadas} tabela(s) não verificada(s)` : ''
  }`;

// Cores dos KPIs: vermelho/laranja para falhas e lacunas, verde para zero verificado e cinza quando
// o valor não pôde ser lido ou verificado (o KPI mostra "—").
const TOM_VERMELHO = { accentColor: '#C5221F', dotShadow: '0px 0px 0px 2px #FCE8E6' };
const TOM_LARANJA = { accentColor: '#E37400', dotShadow: '0px 0px 0px 2px #FEF7E0' };
const TOM_VERDE = { accentColor: '#128937', dotShadow: '0px 0px 0px 2px #E6F4EA' };
const TOM_NEUTRO = { accentColor: '#575757', dotShadow: '0px 0px 0px 2px #F1F3F4' };

const KpiTile: React.FC<{
  label: string;
  /** `null` quando o valor não pôde ser lido: exibido como "—". */
  value: number | null;
  sublabel: string;
  accentColor: string;
  dotShadow: string;
  testId: string;
  onClick: () => void;
}> = ({ label, value, sublabel, accentColor, dotShadow, testId, onClick }) => (
  <ButtonBase
    data-testid={testId}
    onClick={onClick}
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      textAlign: 'left',
      padding: '12px 16px',
      borderRadius: '10px',
      border: '1px solid #E9EEF6',
      backgroundColor: '#FFFFFF',
      minWidth: 0,
      width: '100%',
      transition: 'border-color 150ms ease, background-color 150ms ease',
      '&:hover': { borderColor: '#0B57D0', backgroundColor: '#F8FAFD' },
      '&:focus-visible': { outline: '2px solid #0B57D0', outlineOffset: '2px' },
    }}
  >
    <Typography
      sx={{
        fontFamily: '"Google Sans", sans-serif',
        fontSize: '12px',
        fontWeight: 500,
        color: '#575757',
        lineHeight: '18px',
      }}
    >
      {label}
    </Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '4px' }}>
      <Box
        data-testid={`${testId}-ponto`}
        sx={{
          width: '8px',
          height: '8px',
          borderRadius: '4px',
          backgroundColor: accentColor,
          boxShadow: dotShadow,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontFamily: '"Google Sans", sans-serif',
          fontSize: '20px',
          fontWeight: 500,
          color: value !== null && value > 0 ? accentColor : '#1F1F1F',
          lineHeight: '26px',
        }}
      >
        {formatCount(value)}
      </Typography>
    </Box>
    <Typography sx={{ fontSize: '12px', color: '#575757', mt: '2px', lineHeight: 1.3 }}>
      {sublabel}
    </Typography>
  </ButtonBase>
);

const DimensionCard: React.FC<{
  dimension: Rc18Dimension;
  onShowRules: (dimensionId: string, onlyFailed: boolean) => void;
  onOpenDetails: (dimension: Rc18Dimension) => void;
}> = ({ dimension: d, onShowRules, onOpenDetails }) => {
  const tone = SITUACAO_STYLE[d.situacao];
  const primary = d.indicadores[0] || null;
  const secondary = d.indicadores.length > 1 ? d.indicadores[1] : null;
  const hasFailedRules = d.regras.reprovadas > 0;
  const hasAnyRules = d.regras.total + d.regras.suspensas > 0;

  const badgeText = hasFailedRules
    ? `${d.regras.reprovadas} ${d.regras.reprovadas === 1 ? 'falha' : 'falhas'}`
    : tone.label;

  return (
    <Box
      data-testid={`rc18-dimensao-${d.id}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        border: hasFailedRules ? '1px solid #F6AEA9' : '1px solid #E8EEF5',
        borderRadius: '12px',
        padding: '16px 18px',
        gap: '12px',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <Box>
        {/* Nome e situação factual */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <Typography
            component="h3"
            sx={{
              fontFamily: '"Google Sans", sans-serif',
              fontSize: '15px',
              fontWeight: 500,
              color: '#1F1F1F',
              lineHeight: 1.3,
            }}
          >
            {d.nome}
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              px: '8px',
              py: '2px',
              borderRadius: '12px',
              backgroundColor: tone.bg,
              flexShrink: 0,
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
            <Typography sx={{ fontSize: '11.5px', fontWeight: 500, color: tone.color, whiteSpace: 'nowrap' }}>
              {badgeText}
            </Typography>
          </Box>
        </Box>

        {/* Indicador principal */}
        {primary ? (
          <Box sx={{ mt: '12px' }}>
            <Typography
              sx={{
                fontFamily: '"Google Sans", sans-serif',
                fontSize: '26px',
                fontWeight: 500,
                color: hasFailedRules ? '#C5221F' : '#1F1F1F',
                lineHeight: 1.15,
              }}
            >
              {formatIndicatorPct(primary)}
            </Typography>
            <Typography sx={{ fontSize: '12px', color: '#575757', mt: '4px', lineHeight: 1.4 }}>
              {indicatorCaption(primary)}
              {primary.id === 'regras_dq' && d.regras.naoExecutadas > 0
                ? ` · ${d.regras.naoExecutadas} sem execução`
                : ''}
              {primary.id === 'regras_dq' && d.regras.suspensas > 0
                ? ` · ${d.regras.suspensas} suspensa(s)`
                : ''}
            </Typography>
            {secondary && (
              <Typography sx={{ fontSize: '11.5px', color: '#575757', mt: '4px', lineHeight: 1.35 }}>
                {secondary.id === 'tabelas_com_termo_de_glossario' ? 'Glossário: ' : ''}
                {formatIndicatorPct(secondary)} ({indicatorCaption(secondary)})
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: '12px' }}>
            <Typography
              aria-hidden="true"
              sx={{
                fontFamily: '"Google Sans", sans-serif',
                fontSize: '26px',
                fontWeight: 500,
                color: '#BDC1C6',
                lineHeight: 1.15,
              }}
            >
              —
            </Typography>
            <Typography sx={{ fontSize: '12px', color: '#575757', mt: '4px' }}>
              {d.regras.naoExecutadas > 0
                ? `${d.regras.naoExecutadas} regra(s) sem execução`
                : d.regras.suspensas > 0
                ? `${d.regras.suspensas} regra(s) suspensa(s)`
                : 'Sem indicador no escopo'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Ações discretas */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', pt: '4px' }}>
        {hasAnyRules ? (
          <Button
            size="small"
            onClick={() => onShowRules(d.id, hasFailedRules)}
            aria-label={hasFailedRules ? `Ver falhas de ${d.nome}` : `Ver regras de ${d.nome}`}
            sx={{
              textTransform: 'none',
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 500,
              fontSize: '12.5px',
              color: hasFailedRules ? '#C5221F' : '#0B57D0',
              p: 0,
              minWidth: 0,
              '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' },
            }}
          >
            {hasFailedRules ? 'Ver falhas' : 'Ver regras'}
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="small"
          onClick={() => onOpenDetails(d)}
          aria-label={`Detalhes de ${d.nome}`}
          sx={{
            textTransform: 'none',
            fontFamily: '"Google Sans", sans-serif',
            fontWeight: 500,
            fontSize: '12.5px',
            color: '#0B57D0',
            p: 0,
            minWidth: 0,
            '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' },
          }}
        >
          Detalhes
        </Button>
      </Box>
    </Box>
  );
};

const gridSx = {
  display: 'grid',
  gap: '14px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(265px, 100%), 1fr))',
} as const;

const RC18DimensionsOverview: React.FC<Props> = ({
  overview,
  onShowDimensionRules,
  onJumpToFailedRules,
  onJumpToFailedTables,
  onJumpToStaleTables,
  onJumpToGovernanceGaps,
}) => {
  const [selectedDimension, setSelectedDimension] = useState<Rc18Dimension | null>(null);
  const { escopo, resumoNaoConformidades: nc, dimensoes, regrasSemMapeamento } = overview;
  // Listagem não lida, ou DataScans encontrados sem nenhum lido: os KPIs não podem afirmar zero ("—" em cinza).
  const semLeitura = scansSemLeitura(escopo);
  // Escopo não lido por inteiro (scans não lidos, listagem incompleta ou corte): zero não é "verificado".
  const leituraParcial = !semLeitura && !escopo.lidoPorInteiro;
  const escopoLido = escopo.lidoPorInteiro;
  const govNaoVerificada = nc.governancaNaoVerificada;
  const govSemVerificacao =
    semLeitura ||
    (escopo.tabelas.length > 0 && nc.lacunasGovernanca === 0 && govNaoVerificada >= escopo.tabelas.length);

  const dataDimensions = dimensoes.filter((d) => d.categoria === 'dados');
  const governanceDimensions = dimensoes.filter((d) => d.categoria === 'governanca');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Faixa de não conformidades em aberto (4 KPIs clicáveis) */}
      <Box
        data-testid="rc18-resumo-nao-conformidades"
        sx={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E8EEF5',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <Typography
            sx={{
              fontFamily: '"Google Sans", sans-serif',
              fontSize: '15px',
              fontWeight: 500,
              color: '#1F1F1F',
            }}
          >
            Não conformidades em aberto
          </Typography>
          <Typography sx={{ fontSize: '12px', color: '#575757' }}>
            {escopo.listagemLida
              ? `${escopo.tabelas.length} tabela(s) no escopo · ${escopo.scansAtivos} scan(s) ativo(s)`
              : 'Listagem de DataScans não lida'}
            {escopo.scansNaoLidos > 0 ? ` · ${escopo.scansNaoLidos} scan(s) não lido(s)` : ''}
            {escopo.scansDuplicadosIgnorados.length > 0
              ? ` · ${escopo.scansDuplicadosIgnorados.length} duplicado(s) ignorado(s)`
              : ''}
            {escopo.truncado ? ' · lista truncada' : ''}
            {leituraParcial && escopo.scansNaoLidos === 0 && !escopo.truncado ? ' · listagem incompleta' : ''}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))',
          }}
        >
          <KpiTile
            testId="rc18-kpi-regras-reprovadas"
            label="Regras reprovadas"
            value={semLeitura ? null : nc.totalRegrasReprovadas}
            sublabel={
              nc.regrasSemExecucao > 0
                ? `${nc.regrasSemExecucao} sem execução`
                : nc.regrasSuspensas > 0
                ? `${nc.regrasSuspensas} suspensa(s)`
                : 'Ver fila de falhas'
            }
            {...(semLeitura ? TOM_NEUTRO : nc.totalRegrasReprovadas > 0 ? TOM_VERMELHO : leituraParcial ? TOM_NEUTRO : TOM_VERDE)}
            onClick={onJumpToFailedRules}
          />
          <KpiTile
            testId="rc18-kpi-tabelas-afetadas"
            label="Tabelas afetadas"
            value={semLeitura ? null : nc.tabelasComFalhas}
            sublabel={semLeitura ? 'Escopo não lido' : `de ${escopo.tabelas.length} tabela(s) no escopo`}
            {...(semLeitura ? TOM_NEUTRO : nc.tabelasComFalhas > 0 ? TOM_VERMELHO : leituraParcial ? TOM_NEUTRO : TOM_VERDE)}
            onClick={onJumpToFailedTables}
          />
          <KpiTile
            testId="rc18-kpi-scans-desatualizados"
            label="Scans desatualizados (>30d)"
            value={semLeitura ? null : nc.scansDesatualizados}
            sublabel="Última execução há mais de 30 dias"
            {...(semLeitura ? TOM_NEUTRO : nc.scansDesatualizados > 0 ? TOM_LARANJA : leituraParcial ? TOM_NEUTRO : TOM_VERDE)}
            onClick={onJumpToStaleTables}
          />
          <KpiTile
            testId="rc18-kpi-lacunas-governanca"
            label="Lacunas de governança"
            value={govSemVerificacao ? null : nc.lacunasGovernanca}
            sublabel={`Tabelas sem contato, sem origem ou com colunas sem descrição${
              !semLeitura && govNaoVerificada > 0 ? ` · ${govNaoVerificada} não verificada(s)` : ''
            }`}
            {...(nc.lacunasGovernanca > 0
              ? TOM_LARANJA
              : semLeitura || leituraParcial || govNaoVerificada > 0
              ? TOM_NEUTRO
              : TOM_VERDE)}
            onClick={onJumpToGovernanceGaps}
          />
        </Box>
      </Box>

      {escopo.tabelas.length === 0 && (
        <Alert severity="warning" sx={{ borderRadius: '10px' }}>
          {escopoVazioTexto(escopo)}
        </Alert>
      )}

      {regrasSemMapeamento.length > 0 && (
        <Alert severity="info" sx={{ borderRadius: '10px' }}>
          Regras com dimensão de DataScan sem correspondência (fora dos cartões, incluídas na aba de regras):{' '}
          {regrasSemMapeamento.map((r) => `${r.dqDimension} (${r.quantidade})`).join(', ')}.
        </Alert>
      )}

      {/* Seção 1: Qualidade dos dados (8 dimensões) */}
      <Box component="section" aria-labelledby="rc18-titulo-dados">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <Typography
            id="rc18-titulo-dados"
            component="h2"
            sx={{
              fontFamily: '"Google Sans", sans-serif',
              fontSize: '15px',
              fontWeight: 500,
              color: '#1F1F1F',
            }}
          >
            Qualidade dos dados ({dataDimensions.length})
          </Typography>
          <Typography sx={{ fontSize: '12px', color: '#575757' }}>
            Controles sobre registros, prazos, revisões e integridade
          </Typography>
        </Box>
        <Box data-testid="rc18-dimensoes-dados" sx={gridSx}>
          {dataDimensions.map((d) => (
            <DimensionCard
              key={d.id}
              dimension={d}
              onShowRules={onShowDimensionRules}
              onOpenDetails={setSelectedDimension}
            />
          ))}
        </Box>
      </Box>

      {/* Seção 2: Governança no catálogo (4 dimensões) */}
      <Box component="section" id="rc18-secao-governanca" aria-labelledby="rc18-titulo-governanca">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <Typography
            id="rc18-titulo-governanca"
            component="h2"
            sx={{
              fontFamily: '"Google Sans", sans-serif',
              fontSize: '15px',
              fontWeight: 500,
              color: '#1F1F1F',
            }}
          >
            Governança no catálogo ({governanceDimensions.length})
          </Typography>
          <Typography sx={{ fontSize: '12px', color: '#575757' }}>
            Contatos, dicionário de dados, linhagem e uso no Knowledge Catalog
          </Typography>
        </Box>
        <Box data-testid="rc18-dimensoes-governanca" sx={gridSx}>
          {governanceDimensions.map((d) => (
            <DimensionCard
              key={d.id}
              dimension={d}
              onShowRules={onShowDimensionRules}
              onOpenDetails={setSelectedDimension}
            />
          ))}
        </Box>
      </Box>

      <RC18DimensionDrawer
        dimension={selectedDimension}
        onClose={() => setSelectedDimension(null)}
        onShowRules={onShowDimensionRules}
        escopoLido={escopoLido}
      />
    </Box>
  );
};

export default RC18DimensionsOverview;

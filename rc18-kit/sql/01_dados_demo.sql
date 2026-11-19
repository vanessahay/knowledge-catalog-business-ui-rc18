-- Kit RC 18 — dados SINTÉTICOS de demonstração.
-- Nada aqui é dado real: os valores são gerados por fórmula. O script só cria o que não existe
-- (CREATE ... IF NOT EXISTS) e não apaga nada.
--
-- Variáveis substituídas por envsubst: ${PROJECT_ID}, ${DS_ORIGEM}, ${DS}, ${BQ_LOCATION}

CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.${DS_ORIGEM}`
OPTIONS (
  location = '${BQ_LOCATION}',
  description = 'Kit RC 18 — dados sintéticos de demonstração (camada de origem).',
  labels = [('rc18-kit', 'demo')]
);

CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.${DS}`
OPTIONS (
  location = '${BQ_LOCATION}',
  description = 'Kit RC 18 — dados sintéticos de demonstração (informação preparada para remessa, versão informada, tabelas de referência e de controle).',
  labels = [('rc18-kit', 'demo')]
);

-- 1. Origem: 50 operações em 12 datas-base mensais (últimos 12 meses fechados).
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS_ORIGEM}.operacoes_credito_bruto` (
  id_operacao STRING OPTIONS (description = 'Identificador sintético da operação.'),
  data_base DATE OPTIONS (description = 'Data-base da posição (último dia do mês).'),
  codigo_modalidade STRING OPTIONS (description = 'Código da modalidade, como veio do sistema de origem.'),
  uf STRING OPTIONS (description = 'Unidade da Federação da agência.'),
  moeda STRING OPTIONS (description = 'Moeda do saldo (ISO 4217).'),
  valor_saldo NUMERIC OPTIONS (description = 'Saldo devedor na data-base.'),
  data_extracao TIMESTAMP OPTIONS (description = 'Momento da extração do sistema de origem.')
)
OPTIONS (
  description = 'Kit RC 18 — extração sintética do sistema de origem. Dados fictícios.',
  labels = [('rc18-kit', 'demo')]
)
AS
SELECT
  FORMAT('OP-%05d', n) AS id_operacao,
  data_base,
  -- A operação 50 traz um código fora da tabela de referência (desvio proposital).
  IF(n = 50, '9999', ['0101', '0202', '0203', '0211', '0401'][OFFSET(MOD(n, 5))]) AS codigo_modalidade,
  ['DF', 'GO', 'SP', 'MG', 'BA', 'RS'][OFFSET(MOD(n, 6))] AS uf,
  'BRL' AS moeda,
  CAST(1000 + MOD(n * 7919 + EXTRACT(MONTH FROM data_base) * 104729, 90000) AS NUMERIC) + CAST(MOD(n, 100) AS NUMERIC) / 100 AS valor_saldo,
  -- Extração 5 dias após a data-base; o lote de 4 meses atrás atrasou 15 dias (desvio proposital).
  TIMESTAMP_ADD(
    TIMESTAMP(data_base),
    INTERVAL (IF(data_base = LAST_DAY(DATE_SUB(CURRENT_DATE(), INTERVAL 4 MONTH)), 15, 5) * 24 + MOD(n, 12)) HOUR
  ) AS data_extracao
FROM
  UNNEST(GENERATE_ARRAY(1, 50)) AS n,
  UNNEST(ARRAY(
    SELECT LAST_DAY(DATE_SUB(CURRENT_DATE(), INTERVAL k MONTH))
    FROM UNNEST(GENERATE_ARRAY(1, 12)) AS k
  )) AS data_base;

-- 2. Tabelas de referência (domínios padronizados).
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.ref_modalidade` (
  codigo STRING OPTIONS (description = 'Código padronizado da modalidade.'),
  descricao STRING OPTIONS (description = 'Descrição da modalidade.')
)
OPTIONS (description = 'Kit RC 18 — domínio padronizado de modalidades (fictício).', labels = [('rc18-kit', 'demo')])
AS
SELECT * FROM UNNEST([
  STRUCT('0101' AS codigo, 'Adiantamento a depositantes' AS descricao),
  ('0202', 'Crédito pessoal'),
  ('0203', 'Crédito consignado'),
  ('0211', 'Capital de giro'),
  ('0401', 'Financiamento de veículos')
]);

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.ref_uf` (
  sigla STRING OPTIONS (description = 'Sigla da Unidade da Federação.'),
  nome STRING OPTIONS (description = 'Nome da Unidade da Federação.')
)
OPTIONS (description = 'Kit RC 18 — domínio padronizado de Unidades da Federação (parcial, fictício).', labels = [('rc18-kit', 'demo')])
AS
SELECT * FROM UNNEST([
  STRUCT('DF' AS sigla, 'Distrito Federal' AS nome),
  ('GO', 'Goiás'), ('SP', 'São Paulo'), ('MG', 'Minas Gerais'), ('BA', 'Bahia'), ('RS', 'Rio Grande do Sul')
]);

-- 3. Informação preparada para remessa. O CTAS registra a linhagem origem -> posicao_credito.
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.posicao_credito` (
  id_operacao STRING OPTIONS (description = 'Identificador da operação.'),
  data_base DATE OPTIONS (description = 'Data-base da posição (último dia do mês).'),
  codigo_modalidade STRING OPTIONS (description = 'Código da modalidade (domínio em ref_modalidade).'),
  uf STRING OPTIONS (description = 'Unidade da Federação (domínio em ref_uf).'),
  moeda STRING OPTIONS (description = 'Moeda do saldo (ISO 4217).'),
  valor_saldo NUMERIC OPTIONS (description = 'Saldo devedor na data-base, na moeda indicada.'),
  data_carga TIMESTAMP OPTIONS (description = 'Momento em que a posição ficou disponível nesta tabela.'),
  hash_registro STRING OPTIONS (description = 'SHA-256 do conteúdo do registro, calculado na carga.')
)
OPTIONS (
  description = 'Kit RC 18 — posição de operações de crédito preparada para remessa. Dados fictícios.',
  labels = [('rc18-kit', 'demo')]
)
AS
SELECT
  id_operacao,
  data_base,
  codigo_modalidade,
  uf,
  moeda,
  valor_saldo,
  TIMESTAMP_ADD(data_extracao, INTERVAL 24 HOUR) AS data_carga,
  TO_HEX(SHA256(CONCAT(id_operacao, '|', CAST(data_base AS STRING), '|', codigo_modalidade, '|', uf, '|', moeda, '|', CAST(valor_saldo AS STRING)))) AS hash_registro
FROM `${PROJECT_ID}.${DS_ORIGEM}.operacoes_credito_bruto`;

-- 4. Versão informada: snapshot somente leitura tirado no momento da remessa.
CREATE SNAPSHOT TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.posicao_credito_informada`
CLONE `${PROJECT_ID}.${DS}.posicao_credito`
OPTIONS (
  description = 'Kit RC 18 — versão informada (snapshot da posição no momento da remessa). Dados fictícios.',
  labels = [('rc18-kit', 'demo')]
);

-- 5. Revisões autorizadas (trilha das alterações feitas depois da remessa).
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.revisoes_autorizadas` (
  id_operacao STRING OPTIONS (description = 'Operação revisada.'),
  data_base DATE OPTIONS (description = 'Data-base revisada.'),
  motivo STRING OPTIONS (description = 'Motivo da revisão.'),
  autorizado_por STRING OPTIONS (description = 'Área que autorizou a revisão.'),
  data_autorizacao TIMESTAMP OPTIONS (description = 'Momento da autorização.')
)
OPTIONS (description = 'Kit RC 18 — registro das revisões autorizadas após a remessa (fictício).', labels = [('rc18-kit', 'demo')]);

-- 6. Testes de geração de informação sob demanda (evidência de adaptabilidade).
CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DS}.testes_geracao_sob_demanda` (
  informacao STRING OPTIONS (description = 'Informação testada (nome da tabela ou do documento).'),
  cenario STRING OPTIONS (description = 'demanda_nao_periodica, mudanca_regulamentar ou contingencia.'),
  data_solicitacao TIMESTAMP OPTIONS (description = 'Início do teste (recebimento da demanda simulada).'),
  data_entrega TIMESTAMP OPTIONS (description = 'Entrega da informação no formato pedido.'),
  prazo_horas INT64 OPTIONS (description = 'Prazo definido pela instituição para o cenário, em horas.'),
  resultado STRING OPTIONS (description = 'sucesso ou falha.'),
  observacao STRING OPTIONS (description = 'Descrição resumida do teste.')
)
OPTIONS (description = 'Kit RC 18 — registro dos testes de geração de informação sob demanda (fictício).', labels = [('rc18-kit', 'demo')]);

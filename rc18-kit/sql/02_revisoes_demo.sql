-- Kit RC 18 — eventos SINTÉTICOS posteriores à remessa (revisões e testes).
-- Idempotente: os valores revisados são calculados a partir da origem, e os registros de controle
-- só são inseridos se a tabela estiver vazia. Nada é apagado.
--
-- Variáveis substituídas por envsubst: ${PROJECT_ID}, ${DS_ORIGEM}, ${DS}

DECLARE ultima_data_base DATE DEFAULT (SELECT MAX(data_base) FROM `${PROJECT_ID}.${DS}.posicao_credito`);

-- R1: revisão autorizada de +1% (abaixo do desvio relevante declarado na regra, 5%).
UPDATE `${PROJECT_ID}.${DS}.posicao_credito` AS p
SET
  valor_saldo = ROUND(o.valor_saldo * 1.01, 2),
  hash_registro = TO_HEX(SHA256(CONCAT(p.id_operacao, '|', CAST(p.data_base AS STRING), '|', p.codigo_modalidade, '|', p.uf, '|', p.moeda, '|', CAST(ROUND(o.valor_saldo * 1.01, 2) AS STRING))))
FROM `${PROJECT_ID}.${DS_ORIGEM}.operacoes_credito_bruto` AS o
WHERE p.id_operacao = o.id_operacao AND p.data_base = o.data_base
  AND p.id_operacao = 'OP-00003' AND p.data_base = ultima_data_base;

-- R2: revisão autorizada de +12% (acima do desvio relevante declarado: a regra de confiabilidade reprova).
UPDATE `${PROJECT_ID}.${DS}.posicao_credito` AS p
SET
  valor_saldo = ROUND(o.valor_saldo * 1.12, 2),
  hash_registro = TO_HEX(SHA256(CONCAT(p.id_operacao, '|', CAST(p.data_base AS STRING), '|', p.codigo_modalidade, '|', p.uf, '|', p.moeda, '|', CAST(ROUND(o.valor_saldo * 1.12, 2) AS STRING))))
FROM `${PROJECT_ID}.${DS_ORIGEM}.operacoes_credito_bruto` AS o
WHERE p.id_operacao = o.id_operacao AND p.data_base = o.data_base
  AND p.id_operacao = 'OP-00007' AND p.data_base = ultima_data_base;

-- R3: alteração SEM autorização e sem recalcular o hash (as regras de integridade reprovam).
UPDATE `${PROJECT_ID}.${DS}.posicao_credito` AS p
SET valor_saldo = ROUND(o.valor_saldo * 1.005, 2)
FROM `${PROJECT_ID}.${DS_ORIGEM}.operacoes_credito_bruto` AS o
WHERE p.id_operacao = o.id_operacao AND p.data_base = o.data_base
  AND p.id_operacao = 'OP-00011' AND p.data_base = ultima_data_base;

INSERT INTO `${PROJECT_ID}.${DS}.revisoes_autorizadas` (id_operacao, data_base, motivo, autorizado_por, data_autorizacao)
SELECT id_operacao, ultima_data_base, motivo, 'Área de controles internos (fictícia)', CURRENT_TIMESTAMP()
FROM UNNEST([
  STRUCT('OP-00003' AS id_operacao, 'Correção de encargos' AS motivo),
  ('OP-00007', 'Reclassificação após conciliação')
])
WHERE NOT EXISTS (SELECT 1 FROM `${PROJECT_ID}.${DS}.revisoes_autorizadas`);

-- Testes de geração sob demanda: há teste bem-sucedido para demanda não periódica e para mudança
-- regulamentar; o de contingência falhou (a regra de adaptabilidade correspondente reprova).
INSERT INTO `${PROJECT_ID}.${DS}.testes_geracao_sob_demanda`
  (informacao, cenario, data_solicitacao, data_entrega, prazo_horas, resultado, observacao)
SELECT
  'posicao_credito',
  cenario,
  TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL dias_atras DAY),
  TIMESTAMP_ADD(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL dias_atras DAY), INTERVAL horas_ate_entrega HOUR),
  prazo_horas,
  resultado,
  observacao
FROM UNNEST([
  STRUCT('demanda_nao_periodica' AS cenario, 20 AS dias_atras, 6 AS horas_ate_entrega, 24 AS prazo_horas, 'sucesso' AS resultado, 'Recorte por UF e modalidade pedido fora do calendário.' AS observacao),
  ('mudanca_regulamentar', 45, 30, 72, 'sucesso', 'Inclusão de campo novo no leiaute antes da vigência.'),
  ('contingencia', 30, 50, 48, 'falha', 'Geração a partir do ambiente de contingência não concluída no prazo.')
])
WHERE NOT EXISTS (SELECT 1 FROM `${PROJECT_ID}.${DS}.testes_geracao_sob_demanda`);

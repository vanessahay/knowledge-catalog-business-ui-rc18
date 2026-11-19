'use strict';

/**
 * Visão complementar de dados sensíveis (LGPD / sigilo bancário).
 *
 * IMPORTANTE: esta visão NÃO é uma das 12 dimensões da Resolução Conjunta nº 18/2025 e NÃO é
 * uma inspeção de conteúdo do Sensitive Data Protection (Cloud DLP). O que ela mostra:
 *   - fato: quais colunas das tabelas do escopo possuem Policy Tag (metadado do BigQuery);
 *   - heurística: colunas cujo NOME sugere dado pessoal ou sob sigilo.
 * Funções puras.
 */

const COLUMN_NAME_RULES = [
  [/(^|_)(cpf)(_|$)/, 'CPF', 'CPF (identificação de pessoa física)', 'Dado pessoal', 'Alta'],
  [/(^|_)(cnpj)(_|$)/, 'CNPJ', 'CNPJ (identificação de pessoa jurídica)', 'Identificação empresarial', 'Média'],
  [/(cartao|card_number|(^|_)pan(_|$)|cc_num)/, 'CARTAO', 'Número de cartão', 'Sigilo bancário / dados de cartão', 'Alta'],
  [/(cvv|cvc|track_number)/, 'CODIGO_SEGURANCA', 'Código de segurança de cartão', 'Sigilo bancário / dados de cartão', 'Alta'],
  [/(pix)/, 'CHAVE_PIX', 'Chave Pix', 'Sigilo bancário', 'Alta'],
  [/(conta_corrente|numero_conta|bank_account|iban|agencia|saldo|renda)/, 'DADO_BANCARIO', 'Dado bancário ou financeiro', 'Sigilo bancário', 'Alta'],
  [/(email|e_mail)/, 'EMAIL', 'Endereço de e-mail', 'Dado pessoal (contato)', 'Média'],
  [/(telefone|celular|phone|whatsapp|msisdn)/, 'TELEFONE', 'Telefone', 'Dado pessoal (contato)', 'Média'],
  [/(^|_)(nome|nome_cliente|nome_completo|customer_name|person_name|endereco|address)(_|$)/, 'NOME_ENDERECO', 'Nome ou endereço', 'Dado pessoal', 'Média'],
];

/** Classifica uma coluna pelo nome; devolve `null` quando o nome não sugere nada. */
function classifyColumnName(columnName) {
  const lower = String(columnName || '').toLowerCase();
  for (const [re, infoType, displayName, category, sensitivity] of COLUMN_NAME_RULES) {
    if (re.test(lower)) return { infoType, displayName, category, sensitivity };
  }
  return null;
}

/** Gera os achados a partir dos metadados de tabela já coletados (sem novas chamadas de API). */
function findingsFromTableMetadata(tableMetadata = []) {
  const findings = [];
  for (const meta of tableMetadata) {
    if (!meta.ok) continue;
    for (const col of meta.columns || []) {
      const hasPolicyTag = Array.isArray(col.policyTags) && col.policyTags.length > 0;
      const byName = classifyColumnName(col.name);
      if (!byName && !hasPolicyTag) continue;
      const cls = byName || {
        infoType: 'COM_POLICY_TAG',
        displayName: 'Coluna com Policy Tag',
        category: 'Coluna governada por Policy Tag',
        sensitivity: 'Alta',
      };
      findings.push({
        dataset: meta.dataset,
        table: meta.table,
        fullTableName: meta.key,
        column: col.name,
        infoType: cls.infoType,
        infoTypeDisplayName: cls.displayName,
        category: cls.category,
        likelihood: byName ? 'HEURISTICA_NOME_DE_COLUNA' : 'POLICY_TAG',
        estimatedOccurrences: null,
        sensitivity: cls.sensitivity,
        policyTagApplied: hasPolicyTag,
        policyTagName: hasPolicyTag ? col.policyTags[0] : undefined,
        recommendation: hasPolicyTag ? 'Policy Tag aplicada.' : 'Sem Policy Tag: avaliar a classificação da coluna.',
      });
    }
  }
  return findings;
}

function buildSensitiveDataReport(findings, tablesInspected) {
  const byInfoType = new Map();
  const byTable = new Map();

  for (const f of findings) {
    if (!byInfoType.has(f.infoType)) {
      byInfoType.set(f.infoType, { infoType: f.infoType, displayName: f.infoTypeDisplayName, count: 0, category: f.category });
    }
    byInfoType.get(f.infoType).count += 1;

    if (!byTable.has(f.fullTableName)) {
      byTable.set(f.fullTableName, {
        dataset: f.dataset,
        table: f.table,
        fullTableName: f.fullTableName,
        totalSensitiveColumns: 0,
        highSensitivityColumns: 0,
        tagged: 0,
        detectedInfoTypes: new Set(),
        categories: new Set(),
      });
    }
    const t = byTable.get(f.fullTableName);
    t.totalSensitiveColumns += 1;
    if (f.sensitivity === 'Alta') t.highSensitivityColumns += 1;
    if (f.policyTagApplied) t.tagged += 1;
    t.detectedInfoTypes.add(f.infoTypeDisplayName);
    t.categories.add(f.category);
  }

  const tableRiskProfiles = [...byTable.values()].map((t) => {
    const coveragePct = Math.round((t.tagged / Math.max(t.totalSensitiveColumns, 1)) * 100);
    return {
      dataset: t.dataset,
      table: t.table,
      fullTableName: t.fullTableName,
      totalSensitiveColumns: t.totalSensitiveColumns,
      highSensitivityColumns: t.highSensitivityColumns,
      detectedInfoTypes: [...t.detectedInfoTypes],
      categories: [...t.categories],
      maskingCoveragePct: coveragePct,
      taggedColumns: t.tagged,
      // Descrição factual: não é avaliação de risco nem de adequação.
      complianceStatus: coveragePct === 100 ? 'Todas as colunas com Policy Tag' : 'Há colunas sem Policy Tag',
    };
  });

  const tagged = findings.filter((f) => f.policyTagApplied).length;
  const pending = tableRiskProfiles.filter((t) => t.maskingCoveragePct < 100).length;

  return {
    summary: {
      totalTablesScanned: tablesInspected,
      tablesWithSensitiveData: tableRiskProfiles.length,
      totalPiiFieldsDetected: findings.length,
      bankingSecrecyFields: findings.filter((f) => f.category.includes('Sigilo')).length,
      highSensitivityFieldsCount: findings.filter((f) => f.sensitivity === 'Alta').length,
      protectedWithPolicyTagsCount: tagged,
      overallProtectionCoveragePct: findings.length > 0 ? Math.round((tagged / findings.length) * 100) : null,
      highRiskTablesCount: pending,
      complianceLevel:
        tablesInspected === 0
          ? 'Nenhuma tabela inspecionada'
          : pending === 0
          ? 'Nenhuma coluna candidata sem Policy Tag'
          : 'Há colunas candidatas sem Policy Tag',
    },
    infoTypeDistribution: [...byInfoType.values()].sort((a, b) => b.count - a.count),
    findings,
    tableRiskProfiles,
  };
}

module.exports = { classifyColumnName, findingsFromTableMetadata, buildSensitiveDataReport };

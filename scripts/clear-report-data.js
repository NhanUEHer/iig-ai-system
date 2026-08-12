const db = require('../src/config/db');

const transactionTables = [
  'report_entry_audit_logs',
  'report_manual_submissions',
  'report_notes',
  'report_kpi_values',
  'report_revenue_details',
  'report_ads_channel_details',
  'report_ads_product_details',
  'report_social_details',
  'report_trade_details',
  'report_training_details',
  'report_product_details',
  'report_import_table_logs',
  'report_data_versions',
  'report_imports',
  'report_periods',
];

const configurationTables = [
  'report_kpi_definition_audit_logs',
  'report_detail_row_templates',
  'report_kpi_definitions',
];

async function countRows(client) {
  const counts = {};
  for (const table of transactionTables) {
    const result = await client.query(`SELECT COUNT(*)::integer AS count FROM ${table}`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function main() {
  if (process.env.CONFIRM_CLEAR_REPORT_DATA !== 'yes') {
    throw new Error('Set CONFIRM_CLEAR_REPORT_DATA=yes to clear report transaction data.');
  }

  const result = await db.transaction(async client => {
    const before = await countRows(client);
    await client.query('UPDATE report_periods SET current_version_id = NULL');
    await client.query(`TRUNCATE TABLE ${transactionTables.join(', ')} RESTART IDENTITY CASCADE`);
    if (process.env.CLEAR_REPORT_CONFIG === 'yes') {
      await client.query(`TRUNCATE TABLE ${configurationTables.join(', ')} RESTART IDENTITY CASCADE`);
    }
    const after = await countRows(client);
    const master = await client.query(`SELECT
      (SELECT COUNT(*)::integer FROM report_teams) AS teams,
      (SELECT COUNT(*)::integer FROM report_kpi_definitions WHERE is_active) AS active_kpis,
      (SELECT COUNT(*)::integer FROM report_lookup_values WHERE is_active) AS lookup_values`);
    return { before, after, configurationCleared: process.env.CLEAR_REPORT_CONFIG === 'yes', master: master.rows[0] };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());

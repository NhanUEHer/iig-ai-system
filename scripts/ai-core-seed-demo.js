const db = require('../src/config/db');

async function seedDemo() {
  await db.transaction(async client => {
    const connection = await client.query(
      `INSERT INTO aic_connections (
         provider, name, api_key_ciphertext, api_key_iv, api_key_tag,
         api_key_last4, key_version, status
       ) VALUES ('gemini', 'AI Core demo (fake adapter)', decode('00','hex'),
                 decode(repeat('00', 12),'hex'), decode(repeat('00', 16),'hex'),
                 'fake', 1, 'active')
       ON CONFLICT (name) DO UPDATE SET status='active', updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO aic_models (
         provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
         context_window, status
       ) VALUES ('gemini', 'fake-demo', 0, 0, 0, 8192, 'active')
       ON CONFLICT (provider, model) DO UPDATE SET status='active'`,
    );
    const agent = await client.query(
      `INSERT INTO aic_agents (key, name, description, feature, status)
       VALUES ('demo.echo', 'Demo echo', 'Local AI Core fake-adapter demo', 'demo', 'active')
       ON CONFLICT (key) DO UPDATE SET status='active', updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO aic_agent_versions (
         agent_id, version, status, connection_id, model, system_prompt, user_template,
         variables, output_schema, max_input_tokens, max_output_tokens, repair_invalid_json
       ) SELECT $1, 1, 'published', $2, 'fake-demo', 'Return JSON only.',
                'Echo this text: {{text}}',
                '[{"name":"text","required":true}]'::jsonb,
                '{"type":"object","required":["text"],"properties":{"text":{"type":"string"}},"additionalProperties":false}'::jsonb,
                4096, 512, true
        WHERE NOT EXISTS (
          SELECT 1 FROM aic_agent_versions WHERE agent_id=$1 AND status='published'
        )
       ON CONFLICT (agent_id, version) DO NOTHING`,
      [agent.rows[0].id, connection.rows[0].id],
    );
    await client.query(
      `UPDATE aic_agents a
          SET published_version_id=COALESCE(
                a.published_version_id,
                (SELECT id FROM aic_agent_versions
                  WHERE agent_id=a.id AND status='published'
                  ORDER BY version DESC LIMIT 1)
              ),
              updated_at=CURRENT_TIMESTAMP
        WHERE a.id=$1`,
      [agent.rows[0].id],
    );
  });
  console.log('Seeded demo.echo. Run it with AI_CORE_PROVIDER_OVERRIDE=fake.');
}

if (require.main === module) {
  seedDemo()
    .catch(_error => {
      console.error('Failed to seed demo.echo.');
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { seedDemo };

const db = require('../src/config/db');
const secrets = require('../src/modules/ai-core/providers/secrets');

async function rotateMasterKeys(database = db, secretStore = secrets) {
  return database.transaction(async client => {
    const result = await client.query(
      `SELECT id, api_key_ciphertext, api_key_iv, api_key_tag, key_version, updated_at
       FROM aic_connections
       ORDER BY id
       FOR UPDATE`,
    );

    for (const row of result.rows) {
      const plaintext = secretStore.decrypt(row);
      const encrypted = secretStore.encrypt(plaintext);
      await client.query(
        `UPDATE aic_connections
         SET api_key_ciphertext=$2, api_key_iv=$3, api_key_tag=$4,
             api_key_last4=$5, key_version=$6, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [
          row.id,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          encrypted.last4,
          encrypted.keyVersion,
        ],
      );
    }

    secretStore.clearCache();
    return result.rowCount;
  });
}

async function main() {
  try {
    const count = await rotateMasterKeys();
    console.log(`Rotated ${count} AI Core connection key(s).`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('AI Core master-key rotation failed.');
    process.exitCode = 1;
  });
}

module.exports = { rotateMasterKeys };

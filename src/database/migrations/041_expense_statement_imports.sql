CREATE TABLE IF NOT EXISTS expense_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bank_code VARCHAR(24) NOT NULL,
  account_name VARCHAR(160) NOT NULL, account_number_masked VARCHAR(64) NOT NULL,
  account_number_hash VARCHAR(64), account_type VARCHAR(24) NOT NULL DEFAULT 'credit_card',
  currency VARCHAR(3) NOT NULL DEFAULT 'VND', department_code VARCHAR(64), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT expense_bank_code CHECK (bank_code IN ('TECHCOMBANK','TPBANK','VPBANK','VIB'))
);

CREATE TABLE IF NOT EXISTS expense_statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bank_code VARCHAR(24) NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES expense_bank_accounts(id), original_filename TEXT NOT NULL,
  storage_key TEXT, file_checksum VARCHAR(64) NOT NULL, file_size BIGINT NOT NULL, page_count INTEGER,
  statement_date DATE, period_from DATE, period_to DATE, opening_balance NUMERIC(20,2), closing_balance NUMERIC(20,2),
  statement_total_debit NUMERIC(20,2), statement_total_credit NUMERIC(20,2), parsed_total_debit NUMERIC(20,2),
  parsed_total_credit NUMERIC(20,2), transaction_count INTEGER NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL,
  parser_version VARCHAR(24), warnings JSONB NOT NULL DEFAULT '[]', raw_metadata JSONB NOT NULL DEFAULT '{}', note TEXT,
  revision INTEGER NOT NULL DEFAULT 1, created_by UUID NOT NULL REFERENCES users(id), committed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMPTZ, CONSTRAINT expense_import_status CHECK (status IN
  ('uploaded','processing','ready_for_review','committed','invalid_file','parser_failed','reconciliation_failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS expense_statement_active_checksum ON expense_statement_imports(file_checksum)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS expense_statement_draft_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_id UUID NOT NULL REFERENCES expense_statement_imports(id) ON DELETE CASCADE,
  transaction_date DATE, posting_date DATE, description TEXT NOT NULL, normalized_description TEXT NOT NULL,
  original_amount NUMERIC(20,2) NOT NULL DEFAULT 0, original_currency VARCHAR(3) NOT NULL DEFAULT 'VND',
  debit_amount NUMERIC(20,2) NOT NULL DEFAULT 0, credit_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(20,2) NOT NULL DEFAULT 0, reference_number TEXT, source_page INTEGER, source_row INTEGER,
  warnings JSONB NOT NULL DEFAULT '[]', raw_data JSONB NOT NULL DEFAULT '{}', is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_id UUID NOT NULL REFERENCES expense_statement_imports(id),
  bank_account_id UUID NOT NULL REFERENCES expense_bank_accounts(id), transaction_date DATE NOT NULL, posting_date DATE,
  description TEXT NOT NULL, normalized_description TEXT NOT NULL, original_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  original_currency VARCHAR(3) NOT NULL DEFAULT 'VND', debit_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(20,2) NOT NULL DEFAULT 0, fee_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  reference_number TEXT, fingerprint VARCHAR(64) NOT NULL, classification_source VARCHAR(24) DEFAULT 'unclassified',
  reconciliation_status VARCHAR(24) DEFAULT 'unreviewed', review_status VARCHAR(24) DEFAULT 'pending',
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE, raw_data JSONB NOT NULL DEFAULT '{}', source_page INTEGER, source_row INTEGER,
  created_by UUID REFERENCES users(id), updated_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS expense_transaction_fingerprint_idx ON expense_transactions(fingerprint);

CREATE TABLE IF NOT EXISTS expense_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_type VARCHAR(48) NOT NULL, entity_id UUID NOT NULL,
  action VARCHAR(48) NOT NULL, before_data JSONB, after_data JSONB, user_id UUID REFERENCES users(id),
  request_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE roles SET permissions = permissions || '["expenses.view","expenses.import","expenses.classify","expenses.reconcile","expenses.review","expenses.config","expenses.manage"]'::jsonb
WHERE slug = 'admin';

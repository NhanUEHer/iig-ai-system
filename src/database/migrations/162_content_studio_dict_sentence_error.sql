-- Keep why dictionary extraction failed, so the UI can show it instead of an empty list.
ALTER TABLE cs_dict_sentences ADD COLUMN IF NOT EXISTS error TEXT;

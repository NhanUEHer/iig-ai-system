UPDATE dictionary_entries
SET
  example_en = COALESCE(NULLIF(example_en, ''), raw_response #>> '{usage,example,en}', ''),
  example_vi = COALESCE(NULLIF(example_vi, ''), raw_response #>> '{usage,example,vn}', ''),
  collocations = CASE
    WHEN collocations = '[]'::jsonb AND jsonb_typeof(raw_response #> '{usage,collocations}') = 'array'
      THEN raw_response #> '{usage,collocations}'
    ELSE collocations
  END,
  synonyms = CASE
    WHEN synonyms = '[]'::jsonb AND jsonb_typeof(raw_response #> '{usage,synonyms}') = 'array'
      THEN raw_response #> '{usage,synonyms}'
    ELSE synonyms
  END,
  word_family = COALESCE(NULLIF(word_family, ''), raw_response #>> '{usage,word_family}', ''),
  updated_at = CURRENT_TIMESTAMP
WHERE raw_response ? 'usage';

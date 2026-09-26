ALTER TABLE content_trends
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

UPDATE content_trends trend
SET created_by = owner.created_by
FROM (
  SELECT member.trend_id, MIN(source.created_by::text)::uuid AS created_by
  FROM content_trend_members member
  JOIN content_sources source ON source.id = member.source_id
  GROUP BY member.trend_id
) owner
WHERE trend.id = owner.trend_id
  AND trend.created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS content_trends_owner_key
  ON content_trends(created_by, cluster_key);

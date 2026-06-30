-- Required Postgres extensions.
--   pgcrypto    → gen_random_uuid()
--   btree_gist  → lets the availability exclusion constraint mix `=` (unit_id)
--                 with `&&` (range overlap) in one GiST index
--   vector      → pgvector, for KB embedding search
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

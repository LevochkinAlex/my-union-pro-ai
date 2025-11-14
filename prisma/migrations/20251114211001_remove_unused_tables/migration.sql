-- Remove unused tables from old software
-- Drop News table (marked as "for future functionality")
DROP TABLE IF EXISTS "News" CASCADE;

-- Drop Discount table (marked as "for future functionality")
DROP TABLE IF EXISTS "Discount" CASCADE;

-- Note: AiTrainingSample was already commented out in schema, so no table exists


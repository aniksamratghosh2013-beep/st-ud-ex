
-- Step 1: Add 'founder' to the enum (must be committed separately)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';

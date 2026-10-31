-- Run this first in the Supabase SQL Editor to verify the exact tenant.
-- The seed script will only proceed when exactly one matching shop exists.
SELECT id AS shop_id, name AS shop_name, slug, owner_id
FROM public.shops
WHERE name ILIKE '%Rodge Redge%'
ORDER BY name;


UPDATE posts 
SET type = 'podcast' 
WHERE metadata->>'transistor_embed_code' IS NOT NULL 
  AND metadata->>'transistor_embed_code' != '';

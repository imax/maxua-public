-- add support for articles

ALTER TABLE posts DROP CONSTRAINT posts_type_check;

ALTER TABLE posts 
ADD CONSTRAINT posts_type_check CHECK (type IN ('text', 'quote', 'link', 'article'));


ALTER TABLE posts ADD COLUMN content_html TEXT;

COMMENT ON COLUMN posts.content_html IS 'Rendered HTML content for articles and other formatted posts';

-- Item photos live in object storage, not in the database.
--
-- The column holds the STORAGE KEY, never a URL. A URL from a content service
-- is signed and time-limited, so persisting one stores a value that expires
-- while the row it describes does not — the key is the durable half, and the
-- viewable URL is minted per request from it.
--
-- `image_url` stays for photos hosted elsewhere (a supplier's CDN). A row may
-- have either, and the read path prefers the uploaded one.
ALTER TABLE item ADD COLUMN photo_key TEXT;

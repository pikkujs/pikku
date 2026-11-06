-- A shopper's photo of an item that arrived damaged. Like `item.photo_key`, the
-- column holds the storage key, never a URL: a read URL is signed and expires,
-- so it is minted per request from the key.
ALTER TABLE "order" ADD COLUMN damage_photo_key TEXT;
ALTER TABLE "order" ADD COLUMN damage_photo_type TEXT;

---
'@pikku/cli': patch
'@pikku/core': patch
---

A collection create or update now checks the stored file behind an image key before the record takes it. The file is read as a stream, which stops just past the field's `maxBytes`, and has to be a complete PNG, JPEG, WebP, GIF or AVIF of the type its key says, by how it begins and by its closing marker or stated length. A key of any other kind is refused. The image is not decoded, so this does not show that all of it is sound or harmless. A refused file stays in storage, and an upload URL can replace its file until it expires.

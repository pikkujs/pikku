---
'@pikku/cli': patch
---

Generated collections relations and images. A relation gets a search function that answers ids and titles behind the read of both collections, and a write that links needs the target's read before the target is looked up. An image field gets an upload function whose URL takes the file straight to storage: it re-reads the grant of what the upload is for, builds the key, and allows only the declared types and sizes. A record takes only the key of an uploaded file, and `get` answers signed preview links.

---
'@pikku/n8n-import': patch
---

Map n8n convertToFile's `toBinary` operation to `binary:moveBinaryData`
(jsonToBinary mode). It writes the item's JSON into a binary property — the same
JSON→binary shuttle as moveBinaryData — so it becomes a runnable @pikku/addon-binary
call instead of a throwing stub. convertToFile now maps toBinary/toText/toJson
(dep-free binary addon) and xlsx (spreadsheet addon).

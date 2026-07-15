---
'@pikku/n8n-import': patch
---

Map the dep-free `extractFromFile` / `convertToFile` / `moveBinaryData` file
operations onto the new `@pikku/addon-binary` addon instead of throwing stubs.
`extractFromFile` `text` → `binary:extractText` and `fromJson` →
`binary:extractJson` (base64 read from the item's `binaryPropertyName`);
`convertToFile` `toText` → `binary:toTextFile` (text read from the node's
`sourceProperty`) and `toJson` → `binary:toJsonFile`; and the previously
unmapped `moveBinaryData` node → `binary:moveBinaryData`, with `mode` pinned as
a const selecting the direction. The heavy formats keep routing to their own
addons (`read-pdf`, `spreadsheet`); `binaryToProperty` / `toBinary` (raw base64
passthroughs) and `xml` (wants decoded text) stay stubs.

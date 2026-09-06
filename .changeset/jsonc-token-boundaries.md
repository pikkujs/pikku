---
'@pikku/cli': patch
---

Read JSONC by tokens, so a comment or a comma in a string cannot change the value

`readJsonSafe` stripped comments by deleting them, which joined the tokens on
either side: `{"value": 1/* why */2}` parsed as `12`. Trailing commas were swept
with a regular expression that could not see string boundaries, so
`{"value": ",}"}` lost the comma inside its own string. And an unterminated
block comment silently discarded everything after it, letting a truncated file
parse as though it were whole.

A comment is now replaced by whitespace, trailing commas are recognised during
the scan rather than after it, and an unterminated block comment is reported
with its position.

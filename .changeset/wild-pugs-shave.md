---
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/skills': patch
---

fix(emails): escape substituted values in the generated email renderer

`renderEmailTemplate` spliced values into HTML unescaped and looped substitution
until it reached a fixed point, so a value containing `"` broke out of the
attribute it landed in, a value containing markup was injected verbatim, and a
value containing `{{...}}` was re-expanded as a template on the next pass. An
ordinary CSS font stack from `theme.json` was enough to corrupt the document.

Rendering is now layered by trust. Partials are inlined first; `theme.*` and
`t.*` are expanded next as template-author input; caller `data` is substituted in
a single pass that is never rescanned. Values are HTML-escaped in `.html` output
and left raw in `.subject.txt` / `.text.txt`. `{{content}}` and partials stay
raw, and `{{{value}}}` is a new opt-in raw form. The console's email preview uses
the same renderer, so previews match what is sent.

---
'@pikku/console': patch
---

The console now looks like Fabric's. `@pikku/mantine/theme` takes Fabric's typography (Geist for copy and headings, Geist Mono for code), its type and radius scale, its cooler surface ramp, Mantine's light variants mixed from each colour, and its Badge, Button, Card, Paper, Alert, Switch and form-field overrides — sentence-case sans badges and labels instead of uppercase mono. The console self-hosts Geist and Geist Mono through `@fontsource`, so the bundle the CLI serves needs no network to render them, and drops its 18px root font size and its own Badge and label overrides.

---
'@pikku/mantine': patch
---

Add `original` to the inputs, marking a value that no longer matches the one it came from. Pass what a field started as and it borders itself orange once it differs — a runtime row against what the repository declares, a form field against what it held when it loaded, a setting against its seeded default. All the same comparison, so nothing about where the other value came from reaches the component.

On every control that carries a value, so wiring `original` through is never a question of whether this particular input supports it, and `modifiedStyles` is exported for anything doing its own rendering. Toggles read `checked` and hide the input they would otherwise be drawn on, so `Switch` marks its track and `Radio` its circle. `FileInput` is left out: its value is a `File`, and every `File` compares equal.

These are the package's first runtime wrappers on inputs — the other overrides are type-only casts — so they forward refs explicitly. A control given no `original`, or styling its own input with a `styles` function, behaves exactly as Mantine's does.

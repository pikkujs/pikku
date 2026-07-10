---
'@pikku/mantine': patch
---

Extend the i18n type gate to more `@mantine/core` components. `@pikku/mantine/core` already re-exports every Mantine component via `export *`; this adds branded (`I18nString`/`I18nNode`) prop overrides for text-bearing components that previously slipped through the gate and accepted raw strings:

- Leaf/prose text: `Highlight`, `Blockquote`, `Mark`, `Pill`
- Accessibility text: `Avatar` (`alt`), `Image` (`alt`), `Burger` (`aria-label`)
- Input wrapper: `PillsInput` (`label`/`description`/`error`) and `PillsInput.Field` (`placeholder`)
- Compound: `List.Item`, `Timeline.Item` (`title`), `Combobox.Option`/`Combobox.Empty`, and `Input.Wrapper`/`Input.Label`/`Input.Description`/`Input.Error`/`Input.Placeholder`

Components whose only visible text is a numeric value formatter (`Slider`, `RingProgress`, `SemiCircleProgress`, `AngleSlider`), non-linguistic content (`Code`, `Kbd`), or a `data[]` option array (`SegmentedControl`, `Tree`) are intentionally left ungated, matching how the existing `Select`/`MultiSelect` overrides leave option `data` untouched.

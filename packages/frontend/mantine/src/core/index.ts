// @pikku/mantine/core — a drop-in for `@mantine/core` with i18n-tightened types.
//
// The VALUES below are the untouched Mantine components — this package adds ZERO
// runtime. We only re-cast each component's TYPE so that string-bearing props
// (children, label, placeholder, title, aria-label…) accept the branded
// `I18nString` / `I18nNode` from `@pikku/react` instead of a bare `string`.
//
// Aliasing `@mantine/core` -> `@pikku/mantine/core` over code written against
// plain Mantine (`<Button>Save</Button>`) is therefore a STRICT GATE: untranslated
// raw strings fail to compile. Pass text through `t()` / `asI18n()`.

export * from '@mantine/core'

import {
  // polymorphic (children)
  Button as MantineButton,
  Anchor as MantineAnchor,
  Badge as MantineBadge,
  Text as MantineText,
  // polymorphic (aria-label only)
  ActionIcon as MantineActionIcon,
  CloseButton as MantineCloseButton,
  // polymorphic (label/description)
  NavLink as MantineNavLink,
  // polymorphic (input)
  InputBase as MantineInputBase,
  // plain (children)
  Chip as MantineChip,
  Title as MantineTitle,
  // plain (single label-ish prop)
  Tooltip as MantineTooltip,
  Divider as MantineDivider,
  Indicator as MantineIndicator,
  Progress as MantineProgress,
  Fieldset as MantineFieldset,
  Breadcrumbs as MantineBreadcrumbs,
  Spoiler as MantineSpoiler,
  // plain (title + children body)
  Modal as MantineModal,
  Drawer as MantineDrawer,
  Alert as MantineAlert,
  Notification as MantineNotification,
  // plain (inputs)
  TextInput as MantineTextInput,
  PasswordInput as MantinePasswordInput,
  Textarea as MantineTextarea,
  NumberInput as MantineNumberInput,
  Select as MantineSelect,
  MultiSelect as MantineMultiSelect,
  Checkbox as MantineCheckbox,
  Switch as MantineSwitch,
  Radio as MantineRadio,
  Autocomplete as MantineAutocomplete,
  TagsInput as MantineTagsInput,
  NativeSelect as MantineNativeSelect,
  FileInput as MantineFileInput,
  JsonInput as MantineJsonInput,
  ColorInput as MantineColorInput,
  PinInput as MantinePinInput,
  // compound
  Menu as MantineMenu,
  Tabs as MantineTabs,
  Stepper as MantineStepper,
  // factories (top-level components)
  type ButtonFactory,
  type AnchorFactory,
  type BadgeFactory,
  type TextFactory,
  type TitleFactory,
  type ActionIconFactory,
  type CloseButtonFactory,
  type NavLinkFactory,
  type InputBaseFactory,
  type ChipFactory,
  type TooltipFactory,
  type DividerFactory,
  type IndicatorFactory,
  type ProgressFactory,
  type FieldsetFactory,
  type BreadcrumbsFactory,
  type SpoilerFactory,
  type ModalFactory,
  type DrawerFactory,
  type AlertFactory,
  type NotificationFactory,
  type TextInputFactory,
  type PasswordInputFactory,
  type TextareaFactory,
  type NumberInputFactory,
  type SelectFactory,
  type MultiSelectFactory,
  type CheckboxFactory,
  type SwitchFactory,
  type RadioFactory,
  type AutocompleteFactory,
  type TagsInputFactory,
  type NativeSelectFactory,
  type FileInputFactory,
  type JsonInputFactory,
  type ColorInputFactory,
  type PinInputFactory,
  // props for sub-components (their factories aren't root-exported)
  type MenuItemProps,
  type MenuLabelProps,
  type TabsTabProps,
  type StepperStepProps,
} from '@mantine/core'

import type { I18nNode, I18nString } from '@pikku/react'
import type { OverrideFactory, OverridePoly, WithStatics } from './helpers.js'

// shared override shapes
type Children = { children?: I18nNode }
type AriaLabel = { 'aria-label'?: I18nString }
type Input = {
  label?: I18nNode
  placeholder?: I18nString
  description?: I18nNode
}

// ── Polymorphic: children ────────────────────────────────────────────────────
export const Button = MantineButton as OverridePoly<ButtonFactory, Children>
export const Anchor = MantineAnchor as OverridePoly<AnchorFactory, Children>
export const Badge = MantineBadge as OverridePoly<BadgeFactory, Children>
export const Text = MantineText as OverridePoly<TextFactory, Children>

// ── Polymorphic: icon-only buttons (aria-label is the only visible text) ──────
export const ActionIcon = MantineActionIcon as OverridePoly<
  ActionIconFactory,
  AriaLabel
>
export const CloseButton = MantineCloseButton as OverridePoly<
  CloseButtonFactory,
  AriaLabel
>

// ── Polymorphic: label + description ──────────────────────────────────────────
export const NavLink = MantineNavLink as OverridePoly<
  NavLinkFactory,
  { label?: I18nNode; description?: I18nNode }
>

// ── Polymorphic: generic input wrapper ───────────────────────────────────────
export const InputBase = MantineInputBase as OverridePoly<InputBaseFactory, Input>

// ── Plain: children ───────────────────────────────────────────────────────────
export const Chip = MantineChip as OverrideFactory<ChipFactory, Children>
export const Title = MantineTitle as OverrideFactory<TitleFactory, Children>

// ── Plain: single label-ish prop ─────────────────────────────────────────────
export const Tooltip = MantineTooltip as OverrideFactory<
  TooltipFactory,
  { label: I18nNode }
>
export const Divider = MantineDivider as OverrideFactory<
  DividerFactory,
  { label?: I18nNode }
>
export const Indicator = MantineIndicator as OverrideFactory<
  IndicatorFactory,
  { label?: I18nNode }
>
export const Progress = MantineProgress as OverrideFactory<
  ProgressFactory,
  { label?: I18nString }
>
export const Fieldset = MantineFieldset as OverrideFactory<
  FieldsetFactory,
  { legend?: I18nNode }
>
export const Breadcrumbs = MantineBreadcrumbs as OverrideFactory<
  BreadcrumbsFactory,
  { separator?: I18nNode }
>
export const Spoiler = MantineSpoiler as OverrideFactory<
  SpoilerFactory,
  { showLabel: I18nNode; hideLabel: I18nNode }
>

// ── Plain: title + structural children body ──────────────────────────────────
export const Modal = MantineModal as OverrideFactory<
  ModalFactory,
  { title?: I18nNode }
>
export const Drawer = MantineDrawer as OverrideFactory<
  DrawerFactory,
  { title?: I18nNode }
>
export const Alert = MantineAlert as OverrideFactory<
  AlertFactory,
  { title?: I18nNode; children?: I18nNode }
>
export const Notification = MantineNotification as OverrideFactory<
  NotificationFactory,
  { title?: I18nNode; children?: I18nNode }
>

// ── Plain: inputs (label / placeholder / description, plus extras) ────────────
export const TextInput = MantineTextInput as OverrideFactory<TextInputFactory, Input>
export const PasswordInput = MantinePasswordInput as OverrideFactory<
  PasswordInputFactory,
  Input
>
export const Textarea = MantineTextarea as OverrideFactory<TextareaFactory, Input>
export const JsonInput = MantineJsonInput as OverrideFactory<JsonInputFactory, Input>
export const NativeSelect = MantineNativeSelect as OverrideFactory<
  NativeSelectFactory,
  Input
>
export const NumberInput = MantineNumberInput as OverrideFactory<
  NumberInputFactory,
  Input & { prefix?: I18nString; suffix?: I18nString }
>
export const Select = MantineSelect as OverrideFactory<
  SelectFactory,
  Input & { nothingFoundMessage?: I18nNode }
>
export const MultiSelect = MantineMultiSelect as OverrideFactory<
  MultiSelectFactory,
  Input & { nothingFoundMessage?: I18nNode }
>
export const Autocomplete = MantineAutocomplete as OverrideFactory<
  AutocompleteFactory,
  Input & { nothingFoundMessage?: I18nNode }
>
export const TagsInput = MantineTagsInput as OverrideFactory<
  TagsInputFactory,
  Input & { nothingFoundMessage?: I18nNode }
>
export const ColorInput = MantineColorInput as OverrideFactory<
  ColorInputFactory,
  Input & { swatchesLabel?: I18nString }
>
export const FileInput = MantineFileInput as OverrideFactory<
  FileInputFactory,
  { label?: I18nNode; placeholder?: I18nNode; description?: I18nNode }
>
export const PinInput = MantinePinInput as OverrideFactory<
  PinInputFactory,
  { placeholder?: I18nString }
>
export const Checkbox = MantineCheckbox as OverrideFactory<
  CheckboxFactory,
  { label?: I18nNode; description?: I18nNode }
>
export const Switch = MantineSwitch as OverrideFactory<
  SwitchFactory,
  { label?: I18nNode; description?: I18nNode }
>
export const Radio = MantineRadio as OverrideFactory<
  RadioFactory,
  { label?: I18nNode; description?: I18nNode }
>

// ── Compound components ───────────────────────────────────────────────────────
// Override the text-bearing statics; WithStatics preserves every OTHER static
// (Menu.Divider, Menu.Sub, Tabs.List, Tabs.Panel, Stepper.Completed…) and the
// parent's own call signature automatically.
export const Menu = MantineMenu as unknown as WithStatics<
  typeof MantineMenu,
  {
    Item: OverridePoly<
      {
        props: MenuItemProps
        defaultComponent: 'button'
        defaultRef: HTMLButtonElement
      },
      Children
    >
    Label: OverrideFactory<{ props: MenuLabelProps }, Children>
  }
>

export const Tabs = MantineTabs as unknown as WithStatics<
  typeof MantineTabs,
  {
    Tab: OverridePoly<
      {
        props: TabsTabProps
        defaultComponent: 'button'
        defaultRef: HTMLButtonElement
      },
      Children
    >
  }
>

export const Stepper = MantineStepper as unknown as WithStatics<
  typeof MantineStepper,
  {
    Step: OverrideFactory<
      { props: StepperStepProps },
      { label?: I18nNode; description?: I18nNode }
    >
  }
>

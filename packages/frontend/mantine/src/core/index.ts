// @pikku/mantine/core — a drop-in for `@mantine/core` with i18n-tightened types.
//
// Most exports below are the untouched Mantine components. `Text` gets a tiny
// runtime wrapper so `lineBreaks` can map to CSS without call-site boilerplate.
// The type overrides keep string-bearing props (children, label, placeholder,
// title, aria-label…) on branded `I18nString` / `I18nNode` values instead of
// bare `string`.
//
// Aliasing `@mantine/core` -> `@pikku/mantine/core` over code written against
// plain Mantine (`<Button>Save</Button>`) is therefore a STRICT GATE: untranslated
// raw strings fail to compile. Pass text through `t()` / `asI18n()`.

export * from '@mantine/core'
import { createElement, forwardRef } from 'react'
import type { CSSProperties } from 'react'
import { modifiedStyles } from './original.js'

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
  // plain (leaf text / prose)
  Highlight as MantineHighlight,
  Blockquote as MantineBlockquote,
  Mark as MantineMark,
  Pill as MantinePill,
  Burger as MantineBurger,
  // polymorphic (alt / a11y text)
  Avatar as MantineAvatar,
  Image as MantineImage,
  // plain (input wrapper)
  PillsInput as MantinePillsInput,
  // compound
  Menu as MantineMenu,
  Tabs as MantineTabs,
  Stepper as MantineStepper,
  List as MantineList,
  Timeline as MantineTimeline,
  Combobox as MantineCombobox,
  Input as MantineInput,
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
  type HighlightFactory,
  type BlockquoteFactory,
  type MarkFactory,
  type PillFactory,
  type BurgerFactory,
  type AvatarFactory,
  type ImageFactory,
  type PillsInputFactory,
  // props for sub-components (their factories aren't root-exported)
  type MenuItemProps,
  type MenuLabelProps,
  type TabsTabProps,
  type StepperStepProps,
  type ListItemProps,
  type TimelineItemProps,
  type ComboboxOptionProps,
  type ComboboxEmptyProps,
  type InputWrapperProps,
  type InputLabelProps,
  type InputDescriptionProps,
  type InputErrorProps,
  type InputPlaceholderProps,
  type PillsInputFieldProps,
} from '@mantine/core'

import type { I18nNode, I18nString } from '@pikku/react'
import type { OverrideFactory, OverridePoly, WithStatics } from './helpers.js'

// shared override shapes
type Children = { children?: I18nNode }
type TextChildren = { children?: I18nNode | number }
type TextProps = TextChildren &
  Labelled & {
    lineBreaks?: boolean
    style?: CSSProperties
  }
type AriaLabel = { 'aria-label'?: I18nString }
// Global string attributes present on every host element that still carry
// user-visible text. Both are native DOM string attributes, so I18nString —
// never I18nNode (they can't hold elements).
type Labelled = { 'aria-label'?: I18nString; title?: I18nString }
type Input = {
  label?: I18nNode
  placeholder?: I18nString
  description?: I18nNode
}

// ── Polymorphic: children (+ branded aria-label / title) ─────────────────────
export const Button = MantineButton as OverridePoly<
  ButtonFactory,
  Children & Labelled
>
export const Anchor = MantineAnchor as OverridePoly<
  AnchorFactory,
  Children & Labelled
>
export const Badge = MantineBadge as OverridePoly<
  BadgeFactory,
  Children & Labelled
>
export const Text = (({ lineBreaks, style, children, ...props }: TextProps) => {
  const shouldPreserveLineBreaks =
    lineBreaks && (typeof children === 'string' || typeof children === 'number')

  const resolvedStyle = shouldPreserveLineBreaks
    ? { ...style, whiteSpace: 'pre-line' as const }
    : style

  return createElement(
    MantineText as any,
    { ...props, style: resolvedStyle },
    children
  )
}) as unknown as OverridePoly<TextFactory, TextProps>

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
export const InputBase = MantineInputBase as OverridePoly<
  InputBaseFactory,
  Input
>

// ── Plain: children ───────────────────────────────────────────────────────────
export const Chip = MantineChip as OverrideFactory<ChipFactory, Children>
export const Title = MantineTitle as OverrideFactory<TitleFactory, Children>
export const Mark = MantineMark as OverrideFactory<MarkFactory, Children>
export const Pill = MantinePill as OverrideFactory<PillFactory, Children>
// Highlight renders its `children` string with the matched substring wrapped —
// children is a required `string`, so brand it as I18nString, not I18nNode.
export const Highlight = MantineHighlight as OverridePoly<
  HighlightFactory,
  { children: I18nString }
>
export const Blockquote = MantineBlockquote as OverrideFactory<
  BlockquoteFactory,
  { children?: I18nNode; cite?: I18nNode }
>

// ── Polymorphic: alt / a11y text is the only visible copy ─────────────────────
export const Avatar = MantineAvatar as OverridePoly<
  AvatarFactory,
  { alt?: I18nString }
>
export const Image = MantineImage as OverridePoly<
  ImageFactory,
  { alt?: I18nString }
>
export const Burger = MantineBurger as OverrideFactory<BurgerFactory, AriaLabel>

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

/**
 * An input's value alongside the one it started as. See {@link modifiedStyles}
 * — the two may be a runtime row against its declaration, or simply a field
 * against what it held when the form loaded.
 *
 * On every control that carries a value, so that wiring `original` through is
 * never a question of whether this particular input supports it. A control
 * without an `original` behaves exactly as Mantine's does.
 *
 * Controlled fields only: the comparison reads the value off props, so a field
 * left uncontrolled with `defaultValue` has nothing to compare and stays
 * unmarked.
 */
type Original = { original?: unknown }

/**
 * A caller's own `styles` wins. Mantine also accepts a function there, which
 * cannot be merged into without calling it with a theme this layer does not
 * have — so a call styling its input by hand keeps its own border and simply
 * does not get the mark.
 *
 * `from` and `part` differ per control: a toggle's value is `checked`, and it
 * hides the input it would otherwise be drawn on, painting a track or a circle
 * instead. Bordering the hidden element marks nothing visible.
 */
const withOriginal = (
  Component: any,
  from: 'value' | 'checked' = 'value',
  part = 'input'
) =>
  forwardRef<any, any>(({ original, styles, ...props }, ref) => {
    const modified = modifiedStyles(props[from], original, part)
    const merged =
      !modified.styles || typeof styles === 'function'
        ? styles
        : {
            ...styles,
            [part]: { ...(styles as any)?.[part], ...modified.styles[part] },
          }
    return createElement(Component, { ...props, ref, styles: merged })
  })

export const TextInput = withOriginal(MantineTextInput) as OverrideFactory<
  TextInputFactory,
  Input & Original
>
export const PasswordInput = withOriginal(
  MantinePasswordInput
) as OverrideFactory<PasswordInputFactory, Original & Input>
export const Textarea = withOriginal(MantineTextarea) as OverrideFactory<
  TextareaFactory,
  Input & Original
>
export const JsonInput = withOriginal(MantineJsonInput) as OverrideFactory<
  JsonInputFactory,
  Original & Input
>
export const NativeSelect = withOriginal(
  MantineNativeSelect
) as OverrideFactory<NativeSelectFactory, Original & Input>
export const NumberInput = withOriginal(MantineNumberInput) as OverrideFactory<
  NumberInputFactory,
  Input & Original & { prefix?: I18nString; suffix?: I18nString }
>
export const Select = withOriginal(MantineSelect) as OverrideFactory<
  SelectFactory,
  Input & Original & { nothingFoundMessage?: I18nNode }
>
export const MultiSelect = withOriginal(MantineMultiSelect) as OverrideFactory<
  MultiSelectFactory,
  Input & Original & { nothingFoundMessage?: I18nNode }
>
export const Autocomplete = withOriginal(
  MantineAutocomplete
) as OverrideFactory<
  AutocompleteFactory,
  Original & Input & { nothingFoundMessage?: I18nNode }
>
export const TagsInput = withOriginal(MantineTagsInput) as OverrideFactory<
  TagsInputFactory,
  Input & Original & { nothingFoundMessage?: I18nNode }
>
export const ColorInput = withOriginal(MantineColorInput) as OverrideFactory<
  ColorInputFactory,
  Original & Input & { swatchesLabel?: I18nString }
>
export const FileInput = MantineFileInput as OverrideFactory<
  FileInputFactory,
  { label?: I18nNode; placeholder?: I18nNode; description?: I18nNode }
>
export const PinInput = withOriginal(MantinePinInput) as OverrideFactory<
  PinInputFactory,
  Original & { placeholder?: I18nString }
>
export const Checkbox = withOriginal(
  MantineCheckbox,
  'checked',
  'input'
) as OverrideFactory<
  CheckboxFactory,
  Original & { label?: I18nNode; description?: I18nNode }
>
export const Switch = withOriginal(
  MantineSwitch,
  'checked',
  'track'
) as OverrideFactory<
  SwitchFactory,
  Original & { label?: I18nNode; description?: I18nNode }
>
export const Radio = withOriginal(
  MantineRadio,
  'checked',
  'radio'
) as OverrideFactory<
  RadioFactory,
  Original & { label?: I18nNode; description?: I18nNode }
>
// PillsInput is an Input wrapper (label/description/error live on the root); its
// `.Field` static carries the placeholder. Gate both via a composed factory.
export const PillsInput = MantinePillsInput as unknown as WithStatics<
  OverrideFactory<
    PillsInputFactory,
    { label?: I18nNode; description?: I18nNode; error?: I18nNode }
  >,
  {
    Field: OverrideFactory<
      { props: PillsInputFieldProps },
      { placeholder?: I18nString }
    >
  }
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

export const List = MantineList as unknown as WithStatics<
  typeof MantineList,
  { Item: OverrideFactory<{ props: ListItemProps }, Children> }
>

export const Timeline = MantineTimeline as unknown as WithStatics<
  typeof MantineTimeline,
  {
    Item: OverrideFactory<
      { props: TimelineItemProps },
      { title?: I18nNode; children?: I18nNode }
    >
  }
>

export const Combobox = MantineCombobox as unknown as WithStatics<
  typeof MantineCombobox,
  {
    Option: OverrideFactory<{ props: ComboboxOptionProps }, Children>
    Empty: OverrideFactory<{ props: ComboboxEmptyProps }, Children>
  }
>

// Input is the low-level primitive (InputBase is the common wrapper). Gate the
// text-bearing statics: the wrapper's label/description/error and the leaf
// Label/Description/Error/Placeholder children.
export const Input = MantineInput as unknown as WithStatics<
  typeof MantineInput,
  {
    Wrapper: OverrideFactory<
      { props: InputWrapperProps },
      { label?: I18nNode; description?: I18nNode; error?: I18nNode }
    >
    Label: OverrideFactory<{ props: InputLabelProps }, Children>
    Description: OverrideFactory<{ props: InputDescriptionProps }, Children>
    Error: OverrideFactory<{ props: InputErrorProps }, Children>
    Placeholder: OverrideFactory<{ props: InputPlaceholderProps }, Children>
  }
>

export { modifiedStyles } from './original.js'

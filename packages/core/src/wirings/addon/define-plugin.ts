/**
 * Where an addon screen shows in Studio's navigation. Leave it out and the
 * screen is routed but not listed.
 */
export type StudioNav = {
  area: 'rail' | 'team' | 'project' | 'account'
  /** The icon's name. */
  icon: string
  order: number
  /** Names a function of the addon that returns a count shown on the entry. */
  badge?: string
}

type StudioScreenBase = {
  /** The route path, under the prefix its `scope` gives it. */
  path: string
  /** A message key in the addon's catalog, `messages/{locale}.json`. It is also the nav label. */
  title: string
  nav?: StudioNav
  /** Takes over the core screen at the same path. Only first-party addons may use it. */
  replaces?: boolean
  /** `'bare'` renders the screen without the shell. */
  layout?: 'bare'
  /** Hides the screen and its nav for viewers without access. The addon's functions must enforce the same scopes: hiding a screen is not access control. */
  scopes?: string[]
  /**
   * The agent that answers in Studio's chat panel while this screen is open.
   * `'studio:<name>'` names an agent Studio ships (e.g. `'studio:knowledge'`);
   * `pikku all` only checks its format. A bare name is an agent the addon ships:
   * it resolves to `agents/<name>.md` in the addon package: the agent's
   * instructions, which name the skills it follows. Its frontmatter has a
   * `title` and a `description`, both message keys in the addon's catalog.
   * Lowercase letters, digits and hyphens, starting with a letter. Leave it out and the chat is unchanged.
   */
  agent?: string
  /**
   * Whether Studio's general Chat tab shows on this screen, beside the
   * screen's agent tab. Defaults to `true`. `false` hides it; with no `agent`
   * the screen then has no chat at all.
   */
  defaultChat?: boolean
} & (
  | {
      /** `'studio'` gives `/<path>`, `'team'` gives `/<team>/<path>`. */
      scope: 'studio' | 'team'
      needsApp?: never
    }
  | {
      /** `/<team>/<project>[/<target>]/<path>`. */
      scope: 'project'
      /** The screen needs the project's app running. Defaults to `false`. */
      needsApp?: boolean
    }
)

/** A screen rendered by the host from the addon's source. */
export type StudioComponentScreen = StudioScreenBase & {
  component: () => Promise<{ default: unknown }>
}

/** A static program the host serves in a sandboxed iframe. */
export type StudioAppScreen = StudioScreenBase & {
  /** Directory of the built program, relative to the addon package. */
  app: string
}

/** One screen an addon ships: either a component the host renders or a static app it serves in a sandboxed iframe. */
export type StudioScreen = StudioComponentScreen | StudioAppScreen

/**
 * The core widgets a host ships, by id, each mapped to the data it draws.
 * Empty here: the host's widget package fills it by module augmentation,
 * `declare module '@pikku/core/addon' { interface WidgetRegistry { ... } }`.
 * A slot may name any id in it, or one of the addon's own `widgets`.
 */
export interface WidgetRegistry {}

/** How much room a widget has: the whole lane, a tile, or a one-line chip. */
export type StudioWidgetState = 'full' | 'tile' | 'chip'
/** What a widget can ask its host to do. The host performs every action. */
export type StudioWidgetActionType =
  'open' | 'run' | 'scope' | 'submit' | 'link' | 'input' | 'event'
/** Where a widget is drawn: at a desk, or on a headset. */
export type StudioSkin = 'desk' | 'headset'
/** How many lanes a slot takes. */
export type StudioSpan = 'full' | 'wide' | 'half'
/** What a slot becomes when its screen has one lane: kept whole, folded to a one-line tile, or left out. Defaults to `'tile'`. */
export type StudioCompact = 'full' | 'tile' | 'hide'

/** A widget the addon ships. Its key in `widgets` is its id, which may not reuse a core widget's id. */
export type StudioWidget<Key extends string = string> = {
  /** A message key in the addon's catalog. */
  title: Key
  /** A message key in the addon's catalog: one plain sentence saying what it shows. */
  description: Key
  states: readonly StudioWidgetState[]
  actions: readonly StudioWidgetActionType[]
  /** Defaults to both. */
  skins?: readonly StudioSkin[]
  component: () => Promise<{ default: unknown }>
}

/**
 * A raw value a source returns for the host to format: a string that is not
 * the addon's to translate (a name, a raw error message, what a user typed),
 * a number, or an ISO 8601 time. The host formats numbers, counts, dates and
 * relative times with `Intl` in the viewer's locale.
 */
export type StudioValue = string | number

/**
 * What a source returns where the host shows words: data, never words.
 * `variant` picks the wording the declaration gives in `copy`, and `values`
 * fills that wording's `{placeholders}`. A value that is itself
 * `{ variant, values? }` takes words that depend on the data (why something
 * failed): it is worded by the same copy's `$` text for that variant before
 * it fills the placeholder.
 */
export type StudioVariantData<Variant extends string = string> = {
  variant: Variant
  values?: Record<string, StudioValue | StudioVariantData>
}

/** A raw number and what it measures, which the host writes with `Intl` in the viewer's locale. */
export type StudioAmount = { n: number; unit: 'count' | 'ms' | 'percent' }

/**
 * One figure of a head (a verdict's or a thing card's): data, never words.
 * Its `variant` picks the wording in the same `copy`, `{ label, note?,
 * value? }`; `value` is a raw amount, or worded by the copy's `value` when
 * there is no number to show.
 */
export type StudioFigure<Variant extends string = string> =
  StudioVariantData<Variant> & { value?: StudioAmount }

/**
 * The wording of one variant of a slot: each text the widget shows, named as
 * the widget names it, mapped to a message key in the addon's catalog,
 * `messages/{locale}.json`. A deeper text nests (`status: { text }`, `empty:
 * { title, text }`, a list's item `tags: { 0: key }`). `$` is the text of a
 * value that names this variant. The host resolves the keys, filling their
 * `{placeholders}` from the data's `values`, and hands the widget the
 * resolved strings.
 */
export type StudioSlotCopy<Key extends string = string> = {
  readonly [text: string]: Key | StudioSlotCopy<Key>
}

/**
 * Every variant's wording: each variant the data names (`Required`) must be
 * worded; other entries are allowed for the variants of list items, figures
 * and values the types cannot see. Any string when the variants are unknown.
 */
export type StudioCopy<
  Required extends string = string,
  Entry = StudioSlotCopy,
  Key extends string = string,
> = (string extends Required ? {} : { readonly [V in Required]: Entry }) & {
  readonly [variant: string]: Entry | StudioSlotCopy<Key>
}

/** One widget placed on an arranged screen or a thing's card. */
export type StudioSlot<
  WidgetId extends string = string,
  From extends string = string,
  Variant extends string = string,
  Key extends string = string,
> = {
  /** A core widget's id or one of the addon's own; never another addon's. */
  widget: WidgetId
  /** A key of the source function's output that feeds this widget. A missing or null value hides the slot. */
  from: From
  span?: StudioSpan
  compact?: StudioCompact
  /** The wording of every variant the data at `from` can name, its figures' included. */
  copy?: StudioCopy<Variant, StudioSlotCopy<Key>, Key>
}

/**
 * The head of a thing's card, which the thing's source returns as `head`:
 * data, never words. Its `variant` picks the wording the thing declares in
 * `copy`.
 */
export type StudioCardHead<
  Variant extends string = string,
  FigureVariant extends string = string,
> = StudioVariantData<Variant> & {
  state?: 'wrong' | 'slow' | 'fine' | 'empty' | 'new'
  tone?: 'bad' | 'warn' | 'good' | 'idle'
  /**
   * The one obvious next step, worded by the variant's `copy.primary`.
   * `action` names one of the thing's `actions`, or is `go:/<path>`.
   */
  primary?: { action?: string }
  /** Up to three figures, the strip under the lead, each worded by its own variant in `copy`. */
  figures?: readonly StudioFigure<FigureVariant>[]
}

/**
 * The wording of one variant of a thing's card head: message keys in the
 * addon's catalog, whose `{placeholders}` the host fills from the head's
 * `values`.
 */
export type StudioThingCopy<Key extends string = string> =
  StudioSlotCopy<Key> & {
    name: Key
    lead?: Key
    /** The tile and chip line. */
    compact: Key
    /** `draft` is written into the chat box, never sent. */
    primary?: { label: Key; draft?: Key }
  }

/**
 * A function of the user's project rather than of the addon, by its RPC name,
 * `<namespace>:<function>`, such as `'console:listAgents'` or
 * `'admin:listUsers'`. The host calls it from the browser with the same
 * project client the addon's screens use. Its output is not typed here, so
 * the `from` keys and variants of a slot it feeds are any string.
 */
export type StudioRpcRef = `${string}:${string}`

/**
 * An action that opens another screen or thing by its path instead of
 * running a function, such as `'go:/health-next'`. A widget's button or a
 * head's `primary.action` may name one too.
 */
export type StudioGoRef = `go:/${string}`

/**
 * Something a person can do from a thing's card or an arranged screen: `run`
 * calls a function of the addon or a project RPC, or `go:/<path>` opens
 * another screen or thing. A destructive action needs a
 * `confirm`, a message key whose `{placeholders}` the host fills from the
 * data's `values`; the host asks before it runs.
 */
export type StudioAction<
  Fn extends string = string,
  Key extends string = string,
> = {
  run: Fn | StudioRpcRef | StudioGoRef
  /** A message key in the addon's catalog. */
  label: Key
} & (
  { destructive: true; confirm: Key } | { destructive?: false; confirm?: Key }
)

/**
 * How often the host calls an arranged screen's source again, in
 * milliseconds. `{ fast, slow }` backs off: `fast` while the data keeps
 * changing, `slow` once it has settled.
 */
export type StudioPoll = number | { fast: number; slow: number }

/** What the host calls every source function with. */
export type StudioSourceInput = {
  projectKey: string
  stage: string | null
  range?: string
  /** Set for a thing's source: which thing. */
  subject?: { kind: string; id: string }
}

/**
 * Something an addon can open as a card beside a screen. Its key in `things`
 * is its kind. `source` names a function of the addon, called with
 * `StudioSourceInput` and its `subject`, that returns `{ head: StudioCardHead }`
 * and one key per part. `copy` words each variant the head can name.
 */
export type StudioThing<
  WidgetId extends string = string,
  Kind extends string = string,
  From extends string = string,
  Fn extends string = string,
  Variant extends string = string,
  Key extends string = string,
  Parts = readonly StudioSlot<WidgetId, From, string, Key>[],
  FigureVariant extends string = string,
> = {
  /** A message key in the addon's catalog. */
  label: Key
  source: Fn | StudioRpcRef
  /**
   * The head's wording by variant; the same copy words the head's figures
   * (`{ label, note?, value? }`) and the values that name a variant (`$`).
   */
  copy: StudioCopy<Variant, StudioThingCopy<Key>, Key> &
    StudioCopy<FigureVariant, StudioSlotCopy<Key>, Key>
  /** The card's body under its head, in reading order. */
  parts: Parts
  /** The addon's own kinds this card can open beside itself. */
  related?: readonly Kind[]
  /** What a person can do from the card, by id. */
  actions?: { readonly [id: string]: StudioAction<Fn, Key> }
  alwaysFull?: boolean
  measure?: 'narrow' | 'normal' | 'fill'
}

/**
 * A screen the host lays out from widgets. Its key in `arrangedScreens` is its
 * id. `source` names a function of the addon, called with
 * `StudioSourceInput`, whose output has one key per slot's `from`.
 */
export type StudioArrangedScreen<
  WidgetId extends string = string,
  Kind extends string = string,
  From extends string = string,
  Fn extends string = string,
  Key extends string = string,
  Slots = readonly StudioSlot<WidgetId, From, string, Key>[],
  Variant extends string = string,
  Target extends string = string,
> = StudioScreenBase & {
  /** A message key in the addon's catalog. It is also the nav label. */
  title: Key
  /** A message key in the addon's catalog. */
  about?: Key
  source: Fn | StudioRpcRef
  slots: Slots
  /** The addon's own thing kinds this screen shows. */
  shows?: readonly Kind[]
  /** The most lanes the screen pours into. Defaults to 4. */
  lanes?: 1 | 2 | 3 | 4 | 5 | 6
  chat?: 'collapse'
  /** Shows the place-and-time picker. */
  scoped?: boolean
  /** What a person can do from the screen, by id. */
  actions?: { readonly [id: string]: StudioAction<Fn, Key> }
  /**
   * Sends the viewer elsewhere when the source's `variant` is one of these:
   * to another of the addon's arranged screens, by id, or to a path.
   */
  redirect?: { readonly [V in Variant]?: Target }
  /** Calls the source again on a timer. Off by default. */
  poll?: StudioPoll
}

/**
 * The manifest passed to `definePlugin`: the addon's title, a message key, its
 * screens, and optionally the widgets, things and arranged screens it ships.
 */
export type StudioManifest = {
  title: string
  screens: StudioScreen[]
  widgets?: Record<string, StudioWidget>
  things?: Record<string, StudioThing>
  arrangedScreens?: Record<string, StudioArrangedScreen>
}

/** The functions a typed `definePlugin` checks `source` and `from` against: `#pikku/screens` passes the addon's own. */
export type StudioFunctionMap = Record<string, { input: any; output: any }>

type CoreWidgetId = Extract<keyof WidgetRegistry, string>
type WidgetIdOf<W> = Extract<keyof (W & WidgetRegistry), string>
type SourceOf<T> = T extends { source: infer S } ? S : never
type OutputOf<Fns extends StudioFunctionMap, Source> = Source extends keyof Fns
  ? NonNullable<Fns[Source]['output']>
  : unknown
type OutputKey<Fns extends StudioFunctionMap, Source> = Source extends keyof Fns
  ? Extract<keyof OutputOf<Fns, Source>, string>
  : string
type VariantOf<Data> = Data extends { variant: infer V }
  ? Extract<V, string>
  : string
type FigureVariantOf<Data> = Data extends {
  figures?: readonly (infer F)[]
}
  ? F extends { variant: infer V }
    ? Extract<V, string>
    : never
  : never
type DataAt<Output, Slot> = Slot extends { from: infer F }
  ? F extends keyof Output
    ? NonNullable<Output[F]>
    : unknown
  : unknown
type CheckedSlots<Output, WidgetId extends string, Key extends string, S> = {
  readonly [I in keyof S]: StudioSlot<
    WidgetId,
    Output extends unknown ? Extract<keyof Output, string> : never,
    VariantOf<DataAt<Output, S[I]>> | FigureVariantOf<DataAt<Output, S[I]>>,
    Key
  >
}
type PartsOf<T> = T extends { parts: infer P } ? P : never
type SlotsOf<T> = T extends { slots: infer S } ? S : never

type CheckedWidgets<W, Key extends string> = {
  [K in keyof W]: K extends CoreWidgetId ? never : StudioWidget<Key>
}
type CheckedThings<Fns extends StudioFunctionMap, W, T, Key extends string> = {
  [K in keyof T]: StudioThing<
    WidgetIdOf<W>,
    Extract<keyof T, string>,
    OutputKey<Fns, SourceOf<T[K]>>,
    Extract<keyof Fns, string>,
    VariantOf<
      OutputOf<Fns, SourceOf<T[K]>> extends { head: infer H } ? H : unknown
    >,
    Key,
    CheckedSlots<
      SourceOf<T[K]> extends keyof Fns
        ? OutputOf<Fns, SourceOf<T[K]>>
        : Record<string, unknown>,
      WidgetIdOf<W>,
      Key,
      PartsOf<T[K]>
    >,
    FigureVariantOf<
      OutputOf<Fns, SourceOf<T[K]>> extends { head: infer H } ? H : unknown
    >
  >
}
type CheckedArrangedScreens<
  Fns extends StudioFunctionMap,
  W,
  T,
  A,
  Key extends string,
> = {
  [K in keyof A]: StudioArrangedScreen<
    WidgetIdOf<W>,
    Extract<keyof T, string>,
    OutputKey<Fns, SourceOf<A[K]>>,
    Extract<keyof Fns, string>,
    Key,
    CheckedSlots<
      SourceOf<A[K]> extends keyof Fns
        ? OutputOf<Fns, SourceOf<A[K]>>
        : Record<string, unknown>,
      WidgetIdOf<W>,
      Key,
      SlotsOf<A[K]>
    >,
    VariantOf<OutputOf<Fns, SourceOf<A[K]>>>,
    Extract<keyof A, string> | `/${string}`
  >
}

/**
 * `definePlugin`, checked against the addon's functions and message keys. A
 * slot's `widget` must be one of the addon's own `widgets` or a core widget in
 * `WidgetRegistry`; `related` and `shows` name the addon's own thing kinds;
 * `source` names one of `Fns`, and `from` a key of that function's output, or
 * a project RPC (`StudioRpcRef`), whose output is not checked;
 * the `copy` of a slot or a thing words every `variant` its data can name; and
 * the message keys of widgets, things and arranged screens are `Key`s. With
 * the defaults, `source`, `from`, variants and keys are any string.
 */
export type DefinePlugin<
  Fns extends StudioFunctionMap = StudioFunctionMap,
  Key extends string = string,
> = <
  const W extends CheckedWidgets<W, Key> = {},
  const T extends CheckedThings<Fns, W, T, Key> = {},
  const A extends CheckedArrangedScreens<Fns, W, T, A, Key> = {},
>(manifest: {
  title: string
  screens: StudioScreen[]
  widgets?: W
  things?: T
  arrangedScreens?: A
}) => StudioManifest

/**
 * Declares the screens and nav an addon brings to Pikku Studio. Read
 * statically by `pikku all`, so every field must be a literal. Titles are
 * message keys in the addon's own catalog, `messages/{locale}.json`: a key
 * missing from `messages/en.json` fails the build.
 *
 * Import it from `#pikku/screens` to have `source`, `from`, the variants a
 * `copy` words and the message keys checked against the addon's own functions
 * and catalog.
 */
export const definePlugin: DefinePlugin = (manifest) =>
  manifest as StudioManifest

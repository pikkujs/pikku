// Type-level tests. A clean `tsc --noEmit` over this file proves both that the
// brand is enforced (negatives fail) and that polymorphism + statics survive.
// Run standalone — it is excluded from the package build.

import {
  Button,
  Text,
  Title,
  ActionIcon,
  TextInput,
  Select,
  Modal,
  Tooltip,
  Menu,
  Tabs,
  Stepper,
  Highlight,
  Blockquote,
  Mark,
  Pill,
  Avatar,
  Image,
  Burger,
  PillsInput,
  List,
  Timeline,
  Combobox,
  Input,
} from './index.js'
import { asI18n } from '@pikku/react'
import type { I18nString } from '@pikku/react'

declare const t: (k: string) => I18nString

// ── Paraglide brand parity ───────────────────────────────────────────────────
// I18nString must stay structurally identical to Paraglide JS's `LocalizedString`
// brand so a `m()` message satisfies the gate with no wrapper. If Paraglide ever
// renames the brand literal, the assignments below break loudly here.
type ParaglideLocalizedString = string & { readonly __brand: 'LocalizedString' }
declare const m: (args?: Record<string, never>) => ParaglideLocalizedString
const _brand_ltr: I18nString = m() // LocalizedString → I18nString
const _brand_rtl: ParaglideLocalizedString = asI18n('x') // I18nString → LocalizedString
const _ok_paraglide_child = <Text>{m()}</Text> // flows through the gate natively
// @ts-expect-error — a different brand literal must NOT satisfy I18nString
const _bad_brand: I18nString = '' as string & { readonly __brand: 'Other' }

// ── positives: branded text + JSX structure compile ──────────────────────────
const _ok_button = <Button onClick={() => {}}>{t('save')}</Button>
const _ok_button_jsx = (
  <Button leftSection={<span />} variant="filled">
    {t('save')}
  </Button>
)
// polymorphism preserved — component="a" + anchor-only href
const _ok_poly = (
  <Button component="a" href="/x" target="_blank">
    {t('go')}
  </Button>
)
// mixed / multiple children allowed (array I18nNode), bare string still not
const _ok_mixed = (
  <Button>
    <span />
    {t('save')}
  </Button>
)
const _ok_text = <Text>{t('greeting')}</Text>
const _ok_text_number = <Text>{1}</Text>
const _ok_text_breaks = <Text lineBreaks>{t('line1\nline2')}</Text>
// Text is polymorphic too
const _ok_text_poly = <Text component="span">{t('greeting')}</Text>
// aria-label / title on children components are branded too
const _ok_button_attrs = (
  <Button aria-label={t('save')} title={t('save')}>
    {t('save')}
  </Button>
)
const _ok_title = <Title order={2}>{t('page.title')}</Title>
const _ok_icon = <ActionIcon aria-label={t('close')} />
const _ok_input = (
  <TextInput label={t('email')} placeholder={asI18n('you@x.com')} />
)
const _ok_select = (
  <Select data={[]} label={t('country')} nothingFoundMessage={t('none')} />
)
const _ok_modal = (
  <Modal opened onClose={() => {}} title={t('confirm')}>
    <span>structural body is fine</span>
  </Modal>
)
const _ok_tooltip = (
  <Tooltip label={t('hint')}>
    <span />
  </Tooltip>
)
const _ok_menu = (
  <Menu>
    <Menu.Target>
      <Button>{t('open')}</Button>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label>{t('section')}</Menu.Label>
      <Menu.Item onClick={() => {}}>{t('rename')}</Menu.Item>
      {/* preserved static we never overrode */}
      <Menu.Divider />
    </Menu.Dropdown>
  </Menu>
)
const _ok_tabs = (
  <Tabs defaultValue="a">
    <Tabs.List>
      <Tabs.Tab value="a">{t('first')}</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="a">
      <span />
    </Tabs.Panel>
  </Tabs>
)
const _ok_stepper = (
  <Stepper active={0}>
    <Stepper.Step label={t('step1')} />
    <Stepper.Completed>
      <span />
    </Stepper.Completed>
  </Stepper>
)

// ── positives: newly-gated components ────────────────────────────────────────
const _ok_highlight = <Highlight highlight="a">{asI18n('abc')}</Highlight>
const _ok_blockquote = <Blockquote cite={t('src')}>{t('quote')}</Blockquote>
const _ok_mark = <Mark>{t('marked')}</Mark>
const _ok_pill = <Pill>{t('tag')}</Pill>
const _ok_avatar = <Avatar alt={t('user.avatar')} />
const _ok_image = <Image alt={t('hero')} />
const _ok_burger = <Burger aria-label={t('menu')} />
const _ok_pillsinput = (
  <PillsInput label={t('recipients')}>
    <Pill>{t('tag')}</Pill>
    <PillsInput.Field placeholder={asI18n('add…')} />
  </PillsInput>
)
const _ok_list = (
  <List>
    <List.Item>{t('first')}</List.Item>
  </List>
)
const _ok_timeline = (
  <Timeline active={0}>
    <Timeline.Item title={t('shipped')}>{t('detail')}</Timeline.Item>
  </Timeline>
)
const _ok_combobox = (
  <Combobox>
    <Combobox.Options>
      <Combobox.Option value="a">{t('opt')}</Combobox.Option>
      <Combobox.Empty>{t('none')}</Combobox.Empty>
    </Combobox.Options>
  </Combobox>
)
const _ok_input_parts = (
  <Input.Wrapper label={t('email')} description={t('hint')}>
    <Input.Label>{t('email')}</Input.Label>
    <span />
  </Input.Wrapper>
)

// ── negatives: raw unbranded strings MUST fail ───────────────────────────────
// @ts-expect-error — raw string child
const _bad_button = <Button>Save</Button>
// @ts-expect-error — raw string expression child
const _bad_button2 = <Button>{'Save'}</Button>
// prettier-ignore
// @ts-expect-error — raw string child on polymorphic usage
const _bad_poly = <Button component="a" href="/x">Go</Button>;
// @ts-expect-error — raw string aria-label on a children component
const _bad_button_aria = <Button aria-label="save">{t('save')}</Button>
// @ts-expect-error — raw string title on a children component
const _bad_button_title = <Button title="save">{t('save')}</Button>
// @ts-expect-error — raw string child on Text
const _bad_text = <Text>Hello</Text>
// @ts-expect-error — raw string child on Title
const _bad_title = <Title order={1}>Page</Title>
// @ts-expect-error — raw string aria-label
const _bad_icon = <ActionIcon aria-label="close" />
// @ts-expect-error — raw string label
const _bad_input = <TextInput label="Email" />
// @ts-expect-error — raw string title
const _bad_modal = <Modal opened onClose={() => {}} title="Confirm" />
// @ts-expect-error — raw string child on Menu.Item
const _bad_menu_item = <Menu.Item>Rename</Menu.Item>
// @ts-expect-error — raw string child on Tabs.Tab
const _bad_tab = <Tabs.Tab value="a">First</Tabs.Tab>
// @ts-expect-error — raw string child on Highlight
const _bad_highlight = <Highlight highlight="a">abc</Highlight>
// @ts-expect-error — raw string child on Blockquote
const _bad_blockquote = <Blockquote>Quote</Blockquote>
// @ts-expect-error — raw string child on Mark
const _bad_mark = <Mark>marked</Mark>
// @ts-expect-error — raw string child on Pill
const _bad_pill = <Pill>tag</Pill>
// @ts-expect-error — raw string alt on Avatar
const _bad_avatar = <Avatar alt="user avatar" />
// @ts-expect-error — raw string alt on Image
const _bad_image = <Image alt="hero" />
// @ts-expect-error — raw string aria-label on Burger
const _bad_burger = <Burger aria-label="menu" />
// @ts-expect-error — raw string label on PillsInput
const _bad_pillsinput = <PillsInput label="Recipients" />
// @ts-expect-error — raw string placeholder on PillsInput.Field
const _bad_pillsinput_field = <PillsInput.Field placeholder="add…" />
// @ts-expect-error — raw string child on List.Item
const _bad_list_item = <List.Item>First</List.Item>
// @ts-expect-error — raw string title on Timeline.Item
const _bad_timeline = <Timeline.Item title="Shipped" />
// @ts-expect-error — raw string child on Combobox.Option
const _bad_combobox_option = <Combobox.Option value="a">opt</Combobox.Option>
const _bad_input_wrapper = (
  // @ts-expect-error — raw string label on Input.Wrapper
  <Input.Wrapper label="Email">
    <span />
  </Input.Wrapper>
)

void [
  _brand_ltr,
  _brand_rtl,
  _ok_paraglide_child,
  _bad_brand,
  _ok_button,
  _ok_button_jsx,
  _ok_poly,
  _ok_mixed,
  _ok_text,
  _ok_text_number,
  _ok_text_breaks,
  _ok_text_poly,
  _ok_button_attrs,
  _ok_title,
  _ok_icon,
  _ok_input,
  _ok_select,
  _ok_modal,
  _ok_tooltip,
  _ok_menu,
  _ok_tabs,
  _ok_stepper,
  _bad_button,
  _bad_button2,
  _bad_poly,
  _bad_button_aria,
  _bad_button_title,
  _bad_text,
  _bad_title,
  _bad_icon,
  _bad_input,
  _bad_modal,
  _bad_menu_item,
  _bad_tab,
  _ok_highlight,
  _ok_blockquote,
  _ok_mark,
  _ok_pill,
  _ok_avatar,
  _ok_image,
  _ok_burger,
  _ok_pillsinput,
  _ok_list,
  _ok_timeline,
  _ok_combobox,
  _ok_input_parts,
  _bad_highlight,
  _bad_blockquote,
  _bad_mark,
  _bad_pill,
  _bad_avatar,
  _bad_image,
  _bad_burger,
  _bad_pillsinput,
  _bad_pillsinput_field,
  _bad_list_item,
  _bad_timeline,
  _bad_combobox_option,
  _bad_input_wrapper,
]

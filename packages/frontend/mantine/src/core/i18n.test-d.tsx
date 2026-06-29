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
} from './index.js'
import { asI18n } from '@pikku/react'
import type { I18nString } from '@pikku/react'

declare const t: (k: string) => I18nString

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
const _ok_input = <TextInput label={t('email')} placeholder={asI18n('you@x.com')} />
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

void [
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
]

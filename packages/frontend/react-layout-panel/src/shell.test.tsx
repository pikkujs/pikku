import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Panel } from './Panel.js'
import { Shell, ShellRow, Stage } from './Shell.js'
import {
  MOBILE_QUERY,
  Sheet,
  TabBar,
  mediaQueryMatches,
  shouldFollowLinkInRouter,
  subscribeMediaQuery,
  usePhone,
  type MediaQueryTarget,
} from './mobile.js'

test('the shell renders its stages and panels', () => {
  const html = renderToStaticMarkup(
    <Shell>
      <ShellRow>
        <Panel title="Muscles">psoas major</Panel>
        <Stage>canvas</Stage>
      </ShellRow>
    </Shell>
  )
  assert.match(html, /pk-shell/)
  assert.match(html, /pk-shell-row/)
  assert.match(html, /pk-panel/)
  assert.match(html, /pk-shell-stage/)
  assert.match(html, /psoas major/)
})

test('a panel takes its edge, width and footer', () => {
  const html = renderToStaticMarkup(
    <Panel title="Muscles" side="end" width={300} footer={<span>footer</span>}>
      body
    </Panel>
  )
  assert.match(html, /pk-panel--end/)
  assert.match(html, /width:300px/)
  assert.match(html, /pk-panel-footer/)
  assert.match(html, /footer/)
})

test('a collapsed panel renders as its named rail', () => {
  const html = renderToStaticMarkup(
    <Panel title="Muscles" collapsed onCollapse={() => {}}>
      collapsed-body
    </Panel>
  )
  assert.match(html, /pk-rail/)
  assert.match(html, /pk-rail-label/)
  assert.doesNotMatch(html, /collapsed-body/)
})

test('a collapsed panel takes its rail name from the title, or an explicit label', () => {
  const fromTitle = renderToStaticMarkup(
    <Panel title="Muscles" collapsed onCollapse={() => {}}>
      body
    </Panel>
  )
  assert.match(fromTitle, /aria-label="Muscles"/)

  const explicit = renderToStaticMarkup(
    <Panel
      title={<span>Muscles</span>}
      railLabel="Muscle map"
      collapsed
      onCollapse={() => {}}
    >
      body
    </Panel>
  )
  assert.match(explicit, /aria-label="Muscle map"/)
})

test('the sheet renders nothing when closed and a dialog when open', () => {
  assert.equal(
    renderToStaticMarkup(
      <Sheet opened={false} onClose={() => {}}>
        body
      </Sheet>
    ),
    ''
  )
  const html = renderToStaticMarkup(
    <Sheet opened onClose={() => {}} label="Details">
      body
    </Sheet>
  )
  assert.match(html, /role="dialog"/)
  assert.match(html, /body/)
})

test('a filling sheet takes the full height', () => {
  const html = renderToStaticMarkup(
    <Sheet opened fill onClose={() => {}}>
      body
    </Sheet>
  )
  assert.match(html, /pk-sheet--fill/)
})

test('the tab bar marks the active tab and the breakpoint is declared once', () => {
  const html = renderToStaticMarkup(
    <TabBar
      label="Sections"
      tabs={[
        {
          key: 'body',
          label: 'Body',
          icon: null,
          onSelect: () => {},
          active: true,
        },
      ]}
    />
  )
  assert.match(html, /pk-tabbar/)
  assert.match(html, /pk-tab--active/)
  assert.equal(MOBILE_QUERY, '(max-width: 48em)')
})

test('a tab can carry a waiting dot and say whether it is a destination or a toggle', () => {
  const destination = renderToStaticMarkup(
    <TabBar
      label="Sections"
      tabs={[
        {
          key: 'body',
          label: 'Body',
          icon: null,
          indicator: true,
          destination: true,
          active: true,
          onSelect: () => {},
        },
      ]}
    />
  )
  assert.match(destination, /aria-hidden="true"/)
  assert.match(destination, /aria-current="page"/)
  assert.doesNotMatch(destination, /aria-pressed/)

  const toggle = renderToStaticMarkup(
    <TabBar
      label="Sections"
      tabs={[
        {
          key: 'body',
          label: 'Body',
          icon: null,
          active: true,
          onSelect: () => {},
        },
      ]}
    />
  )
  assert.match(toggle, /aria-pressed="true"/)
  assert.doesNotMatch(toggle, /aria-current/)
})

test('only a plain left click on a tab link is routed in-app', () => {
  const click = (
    over: Partial<Parameters<typeof shouldFollowLinkInRouter>[0]> = {}
  ) => ({
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    ...over,
  })

  assert.equal(shouldFollowLinkInRouter(click()), true)
  assert.equal(shouldFollowLinkInRouter(click({ metaKey: true })), false)
  assert.equal(shouldFollowLinkInRouter(click({ ctrlKey: true })), false)
  assert.equal(shouldFollowLinkInRouter(click({ shiftKey: true })), false)
  assert.equal(shouldFollowLinkInRouter(click({ altKey: true })), false)
  assert.equal(shouldFollowLinkInRouter(click({ button: 1 })), false)
  assert.equal(shouldFollowLinkInRouter(click({ defaultPrevented: true })), false)
})

test('the media-query helpers read and unsubscribe through matchMedia', () => {
  let removed = 0
  const target = {
    matchMedia: () => ({
      matches: true,
      media: MOBILE_QUERY,
      addEventListener: () => {},
      removeEventListener: () => {
        removed += 1
      },
    }),
  } as unknown as MediaQueryTarget

  assert.equal(mediaQueryMatches(MOBILE_QUERY, target), true)

  const unsubscribe = subscribeMediaQuery(MOBILE_QUERY, () => {}, target)
  unsubscribe()
  assert.equal(removed, 1)
})

test('usePhone answers false on the server so hydration has nothing to correct', () => {
  const PhoneProbe = () => <span>{String(usePhone())}</span>
  assert.equal(renderToStaticMarkup(<PhoneProbe />), '<span>false</span>')
})

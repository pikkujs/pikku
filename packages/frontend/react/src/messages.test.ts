/**
 * Run: node --test packages/frontend/react/src/messages.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { asI18n } from './i18n-types.ts'
import { createMessages, mergeMessages } from './messages.ts'

const defaults = {
  loop: () => 'Loop',
  elif: ({ n }: { n: number }) => `elif ${n}`,
}

const render = (node: ReactNode): string => renderToStaticMarkup(node as any)

test('defaultM returns the English defaults', () => {
  const { defaultM } = createMessages(defaults)
  assert.equal(defaultM.loop(), 'Loop')
})

test('params flow through to the default', () => {
  const { defaultM } = createMessages(defaults)
  assert.equal(defaultM.elif({ n: 3 }), 'elif 3')
})

test('mergeMessages: a partial override wins, the rest stays English', () => {
  const { defaultM } = createMessages(defaults)
  const german: string = 'Schleife'
  const merged = mergeMessages(defaultM, { loop: () => asI18n(german) })
  assert.equal(merged.loop(), 'Schleife')
  assert.equal(merged.elif({ n: 1 }), 'elif 1')
  assert.equal(mergeMessages(defaultM), defaultM)
})

test('useM outside a provider gives the defaults', () => {
  const { useM } = createMessages(defaults)
  const C = () => createElement('i', null, useM().loop())
  assert.equal(render(createElement(C)), '<i>Loop</i>')
})

test('MessagesProvider overrides a key and params still reach it', () => {
  const { MessagesProvider, useM } = createMessages(defaults)
  const C = () => {
    const m = useM()
    return createElement('i', null, `${m.loop()}|${m.elif({ n: 2 })}`)
  }
  const out = render(
    createElement(
      MessagesProvider,
      {
        messages: {
          elif: ({ n }) => {
            const text: string = `sonst ${n}`
            return asI18n(text)
          },
        },
      },
      createElement(C)
    )
  )
  assert.equal(out, '<i>Loop|sonst 2</i>')
})

test('two factories do not share a context', () => {
  const a = createMessages({ hi: () => 'A' })
  const b = createMessages({ hi: () => 'B' })
  const C = () => createElement('i', null, `${a.useM().hi()}${b.useM().hi()}`)
  const out = render(
    createElement(
      a.MessagesProvider,
      {
        messages: {
          hi: () => {
            const text: string = 'A2'
            return asI18n(text)
          },
        },
      },
      createElement(C)
    )
  )
  assert.equal(out, '<i>A2B</i>')
})

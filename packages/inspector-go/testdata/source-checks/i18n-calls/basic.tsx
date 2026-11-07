import { asI18n } from '@pikku/react'

declare const x: string
declare const a: { b: { c: string } }
declare const maybe: { b?: string } | undefined

export const Basic = () => {
  const items = [
    asI18n('literal'),
    asI18n(`no substitution`),
    asI18n(`with ${x} substitution`),
    asI18n(compute(x)),
    asI18n('a' + x),
    asI18n(x + 'a'),
    asI18n(x ? 'yes' : 'no'),
    asI18n(x || 'fallback'),
    asI18n(x),
    asI18n(a.b.c),
    asI18n(maybe?.b),
    asI18n(maybe!.b),
    asI18n((x)),
    asI18n(x as string),
    asI18n(x satisfies string),
    asI18n(...[x]),
    asI18n(),
    asI18n(x, 'second ignored'),
    asI18n('lit' as string),
    asI18n(('paren literal')),
    asI18n(a['b']),
    asI18n(x[0]),
    asI18n(1),
    asI18n(null),
    asI18n(`tag`.length),
    asI18n(tag`tagged`),
    asI18n(x!),
    asI18n(new String(x)),
  ]
  return <div>{items}</div>
}

declare function compute(x: string): string
declare function tag(s: TemplateStringsArray): string

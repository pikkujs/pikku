import { asI18nStub, asI18nStub as stub } from '@pikku/react'
declare const x: string
export const Stubs = () => (
  <div>
    {asI18nStub('Hello world')}
    {asI18nStub(`template ${x} copy`)}
    {asI18nStub(`no substitution template`)}
    {asI18nStub(x)}
    {asI18nStub()}
    {asI18nStub(...[x])}
    {asI18nStub('a very long piece of stub copy that is certainly longer than sixty characters in total')}
    {asI18nStub('multiple    spaces\n\tand escapes\u00a0nbsp')}
    {asI18nStub(x + ' concat')}
    {asI18nStub(`multi
line
template`)}
    {stub('aliased   stub')}
    {asI18nStub('Héllo wörld — ünïcode 日本語')}
    {asI18nStub('😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 emoji run')}
    {asI18nStub(x ? 'yes' : 'no')}
  </div>
)

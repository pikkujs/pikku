import { sep, sep as s, type sep as ts } from '@pikku/react'
import * as R from '@pikku/react/i18n'
import * as Sub from '@pikku/react/deep/path'
import { sep as foreign } from 'other-lib'
import { sep as nearly } from '@pikku/reactive'
import Default, { sep as afterDefault } from '@pikku/react'
import Def2 from '@pikku/react'
import '@pikku/react'
declare const x: string

export const Seps = () => (
  <div>
    {sep(' · ')}
    {sep('')}
    {sep('abc')}
    {sep('•')}
    {sep('a')}
    {sep('1')}
    {sep('é')}
    {sep('日本')}
    {sep('——')}
    {sep(`|`)}
    {sep(`${x}`)}
    {sep(x)}
    {sep()}
    {sep(...[' '])}
    {sep((' ') as string)}
    {sep(' ' satisfies string)}
    {sep(x!)}
    {s('--')}
    {s('word')}
    {ts('word')}
    {R.sep('///')}
    {R.sep('sep word')}
    {Sub.sep(`word`)}
    {Sub.other('word')}
    {foreign('word')}
    {nearly('word')}
    {afterDefault('word')}
    {R.sep.call(null, 'word')}
    {separate('word')}
    {asI18nSep('word')}
    {sepFoo('word')}
    {other.sep('word')}
  </div>
)
declare function separate(x: string): string
declare function asI18nSep(x: string): string
declare function sepFoo(x: string): string
declare const other: any

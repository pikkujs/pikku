import { thing } from './thing'
import type { Other } from 'some module name'
import 'side effect module'
import eq = require('equals module name')
export { thing as renamed } from 'reexport module name'
export * from 'star module name'
export type { Other } from 'type module name'

declare const x: string, n: number, cond: boolean, obj: any, arr: any[]
declare function fn(...a: any[]): any
declare function say(x: string): void
declare const toast: any

type TypeAlias = 'Hello type alias'
interface Shape { 'Hello interface key': string; kind: 'Hello literal type' }
const typed: 'Hello literal annotation' = 'Hello literal annotation'
type Tpl = `Hello ${string} template type`
function generic<T extends 'Hello constraint'>(a: T): T { return a }
function typeofGuard(a: string): a is 'Hello predicate' { return true }
declare const imported: import('some module name').Foo

export const objectLiteral = {
  title: 'Hello object title',
  'quoted key': 'Hello quoted key value',
  'data-title': 'Hello data attribute',
  'aria-label': 'Hello aria label value',
  'aria-hidden': 'Hello aria hidden value',
  'aria-description': 'Hello aria description value',
  className: 'Hello class name value',
  id: 'Hello identifier value',
  nameX: 'Hello suffixed name',
  buttonClass: 'Hello suffixed class',
  iconName: 'Hello icon name',
  [x]: 'Hello computed key value',
  ['computed literal key']: 'Hello computed literal value',
  1: 'Hello numeric key value',
  0x10: 'Hello hex key value',
  1n: 'Hello bigint key value',
  'Hello string key as value'() {},
  method() { return 'Hello method return' },
  arrow: () => 'Hello arrow body',
  arrowBlock: () => { return 'Hello arrow block return' },
  nested: { deeper: { message: 'Hello nested message' } },
  shorthandSpread: { ...obj, label: 'Hello after spread' },
  cond: cond ? 'Hello ternary yes' : 'Hello ternary no',
  or: x || 'Hello or fallback',
  nullish: x ?? 'Hello nullish fallback',
  and: cond && 'Hello and right',
  andLeft: 'Hello and left' && cond,
  condTest: ('Hello cond test' ? 1 : 2),
  eq: x === 'Hello equality',
  neq: x !== 'Hello inequality',
  plus: 'Hello plus' + x,
  paren: ('Hello paren'),
  cast: 'Hello cast' as string,
  sat: 'Hello satisfies' satisfies string,
  nn: 'Hello nonnull'!,
  tpl: `Hello ${x} template`,
  tplPlain: `Hello plain template`,
  tplMulti: `Hello
multi line template`,
  tplMultiExpr: `Hello ${
    x
  } expression across lines`,
  oneWord: 'Hello',
  lowercaseTwo: 'hello world',
  twoWordsCapital: 'Hello World',
  sentence: 'Hello, how are you today?',
  tiny: 'Hi it',
  tooShort: 'a b',
  long: 'This is a long sentence that goes on and on to exceed the limit of two hundred characters when measured in UTF-16 code units, which should be rejected as a document and not as a label, and it keeps going for a little while longer still to be safe.',
  exactly200: 'x'.padEnd(5) + 'Aa '.repeat(66),
  list: '- bullet list item',
  star: '* starred item text',
  hash: '# heading style text',
  gt: '> quote style text',
  url: 'https://example.com/some path',
  mailto: 'mailto:me@example.com now',
  fileUrl: 'file:///some/path to file',
  rooted: '/rooted/path here ok',
  rel: './relative path here',
  rel2: '../relative path here',
  home: '~/home path here',
  envPath: '$HOME/path to file',
  envPath2: '${DIR}/path to file',
  envPath3: '$dir/path to file',
  anchor: '#anchor here ok',
  mention: '@mention here ok',
  semi: 'Hello; world and more',
  braces: 'Hello {world} and more',
  arrowText: 'Hello => world and more',
  triple: 'Hello === world and more',
  importLine: "import thing from 'module'",
  importLine2: 'import { a } from "b" ok',
  html: 'Hello <b>bold</b> world',
  htmlSelf: 'Hello <br/> world and',
  tplCall: '${a} (call) text',
  tplCall2: '${a}  (call) text',
  sqlSelect: 'select name from users where id',
  sqlInsert: 'insert into users values here',
  sqlSelectUpper: 'SELECT NAME FROM USERS',
  sqlNotSql: 'select your favourite colour please',
  sqlDelete: 'delete from the cart now',
  gitCmd: 'git commit -m message',
  gitCmdSentence: 'git commit -m message.',
  npmCmd: 'npm install some-package',
  pikkuCmd: 'pikku all --watch',
  cdCmd: 'cd packages/core',
  shellPath: 'rm -rf some/dir',
  cssPx: '1px solid red',
  cssPx2: '0 0 0 1px',
  cssSentence: '10 items remain.',
  cssNum: '10 items remain',
  cssCalc: 'Use calc(100% - 4px) here',
  cssVar: 'Set var(--x) please',
  cssTranslate: 'translateX(10px) now ok',
  cssMax: 'Compare max(1, 2) ok',
  identifiers: 'foo.bar baz.qux',
  identifiers2: 'some-class other-class',
  identifiers3: 'a_b c_d',
  keypath: 'user.name user.email',
  colonPath: 'ns:key other:key',
  brackets: 'items[0] items[1]',
  camelWords: 'fooBar bazQux',
  camelWords2: 'fooBar baz',
  camelWords3: 'getThing setThing',
  lowerPlain: 'flex grow',
  lowerPlain3: 'no cache here',
  lowerSentence: 'no cache.',
  lowerColon: 'note: this',
  lowerEllipsis: 'loading data…',
  upperTwo: 'Flex Grow',
  placeholderMarker: 'Hello {…} marker',
  accentedStart: 'Élan vital today',
  accentedLower: 'élan vital',
  cjk: '日本語 のテキスト',
  cjkOne: '日本語のテキスト',
  emoji: '😀 Hello emoji',
  longEmoji: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 Hello tail',
  kelvin: 'K select kelvin from users',
  dotless: 'ſelect name from users',
  nbspSep: 'Hello\u00a0nbsp world',
  tabSep: 'Hello\tworld there',
  newlineSep: 'Hello\nworld there',
  escapes: 'Say \"hello\" to \u00e9 world',
  nulChar: 'Hello\0world there',
  specialTrail: 'Hello world.   ',
  specialLead: '   Hello world',
  lsInside: 'Hello\u2028world there',
}

export function returns(): string {
  if (cond) return 'Hello return one'
  return cond ? 'Hello return yes' : 'Hello return no'
}

export const arrowExpr = (a = 'Hello default param') => 'Hello arrow expression'
export function withDefaults(a = 'Hello function default', { b = 'Hello binding default' } = {}, [c = 'Hello array default'] = []) {
  const { d = 'Hello destructure default' } = obj
  return a + b + c + d
}

export class WithFields {
  title = 'Hello class field'
  static label = 'Hello static field'
  className = 'Hello class name field'
  readonly #secret = 'Hello private field'
  ['computed'] = 'Hello computed field'
  declare other: 'Hello declared'
  constructor(public readonly param = 'Hello parameter property') {}
  get text() { return 'Hello getter return' }
}

class Extends extends mixin('Hello heritage call') implements Shape {}
declare function mixin(x: string): any

const message = 'Hello message variable'
const MESSAGE = 'Hello MESSAGE constant'
const FOO_BAR = 'Hello upper constant'
const FOO_LABEL = 'Hello upper label constant'
const className = 'Hello skip variable'
const noBracketsName = ['Hello array variable one', 'Hello array variable two']
const keys = ['Hello keys array one', 'Hello keys array two']
const { fromPattern } = { fromPattern: 'Hello pattern source' }
const [first = 'Hello first default'] = arr
let reassigned: string
reassigned = 'Hello assigned later'
var oldStyle = 'Hello var variable'

fn('Hello plain call')
fn('Hello', 'second call argument here')
fn(`Hello ${x} call template`)
fn(['Hello array arg one', 'Hello array arg two'])
fn({ message: 'Hello call object arg' })
fn(cond ? 'Hello call ternary' : 'Hello call other')
fn(x || 'Hello call fallback')
fn(...['Hello spread arg'])
fn(('Hello call paren'))
fn('Hello call cast' as string)
fn(x)('Hello curried call')
obj.fn('Hello member call')
obj['fn']('Hello element call')
obj.deep.chain.fn('Hello chain call')
obj.fn().again('Hello call chain')
(obj as any).fn('Hello cast callee')
obj!.fn('Hello nonnull callee')
obj?.fn('Hello optional callee')
obj?.fn?.('Hello optional both')
fn<string>('Hello type args call')
new Thing('Hello new expression')
new Thing
new Thing()
new Error('Hello new error')
new TypeError('Hello new type error')
new RegExp('Hello new regexp')
new Date('Hello new date')
new URL('Hello new url')
new Map([['Hello map key', 'Hello map value']])
new Set(['Hello set one', 'Hello set two'])
new Headers({ a: 'Hello headers' })
new Intl.NumberFormat('Hello intl')
new IntlThing('Hello intl thing')
new obj.Ctor('Hello member new')
new (obj.Ctor)('Hello paren new')
declare class Thing { constructor(x?: string) }
declare class IntlThing { constructor(x?: string) }

console.log('Hello console log')
console.error('Hello console error')
logger.info('Hello logger info')
log('Hello bare log')
debug('Hello bare debug')
m.title('Hello message function')
m['key']('Hello message element')
asI18n('Hello as i18n')
asI18nStub('Hello as i18n stub')
sep('Hello sep call')
require('hello require call')
import('hello dynamic import')
import('hello dynamic import').then((mod) => mod.fn('Hello after import'))
describe('Hello describe block', () => { it('Hello it block', () => { expect(x).toBe('Hello expect value') }) })
test('Hello test block', () => {})
expect(x).toEqual('Hello to equal')
assert.equal(x, 'Hello assert equal')
cn('Hello cn call')
clsx('Hello clsx', { 'Hello clsx key': cond })
JSON.parse('Hello json parse')
Object.keys('Hello object keys')
process.env['Hello env key']
path.join('Hello path join')
fs.readFile('Hello fs read')
sql('Hello sql call')
git('Hello git call')
res.send('Hello res send')
reply('Hello reply call')
workflow('Hello workflow call')
scenario('Hello scenario call')
x.replace('Hello replace', 'Hello replacement')
x.split('Hello split')
x.includes('Hello includes')
x.startsWith('Hello starts')
arr.push('Hello push call')
arr.map('Hello map call')
arr.join('Hello join')
obj.get('Hello get')
obj.set('Hello set', 'Hello set value')
obj.on('Hello on event', () => {})
obj.emit('Hello emit event')
obj.querySelector('Hello selector')
obj.setAttribute('Hello attr', 'Hello attr value')
obj.test('Hello test method')
obj.match('Hello match')
obj.rpc('Hello rpc')
obj.where('Hello where', '=', 'Hello where value')
obj.selectFrom('Hello select from')
obj.then('Hello then')
obj.when('Hello when')
obj.step('Hello step')
obj.fooError('Hello error suffix')
obj.throwIt('Hello throw prefix')
obj.failNow('Hello fail prefix')
obj.panic('Hello panic prefix')
obj.invariantCheck('Hello invariant prefix')
obj.Error('Hello Error method')
useThing('Hello use call')
createThing('Hello create call')
defineThing('Hello define call')
wireThing('Hello wire call')
pikkuThing('Hello pikku call')
importThing('Hello import call')
requireThing('Hello require prefix call')
usething('Hello lowercase use call')
useThing.sub('Hello member of use call')
say('Hello say call')
say(`Hello ${x} say`)
toast.success('Hello toast success')
toast('Hello toast direct')
notify('Hello notify')
obj.say('Hello member say')
say.sub('Hello say sub')
(() => 'Hello iife')('Hello iife arg')
fn(() => 'Hello callback body')
fn(function () { return 'Hello function body return' })
fn((a = 'Hello callback default') => a)
fn(async () => { await fn('Hello awaited call') })
await fn('Hello top level await')
void fn('Hello void call')
!fn('Hello negated call')
x === fn('Hello compared call')
`${fn('Hello inside template expr')}`
fn`Hello tagged template`
sql`select name from users where id = ${x}`
fn`Hello ${x} tagged with expression`
obj.tag`Hello member tagged template`

switch (x) {
  case 'Hello case clause':
    break
  default:
}
if (x === 'Hello if equality') {}
for (const k of ['Hello for of one', 'Hello for of two']) {}
const lookup = obj['Hello element access']
const inop = 'Hello in operator' in obj
const typeofCheck = typeof x === 'Hello typeof'
throw new Error('Hello thrown error')
throw 'Hello thrown string'
label: for (;;) { break label }

@Decorator('Hello decorator arg')
class Decorated {
  @Prop('Hello property decorator') field = 1
  @Method() method(@Param('Hello param decorator') p: string) {}
}
declare function Decorator(x: string): any
declare function Prop(x: string): any
declare function Method(): any
declare function Param(x: string): any

enum E { A = 'Hello enum member', B = 'enum_member' }
namespace NS { export const label = 'Hello namespace member' }
declare module 'hello ambient module' {}
declare global { interface Window { x: 'Hello global' } }
export default 'Hello export default'
export = 'Hello export equals'
'Hello expression statement'
'use strict'

export const strings = ['Hello array one', 'Hello array two', ['Hello nested array one', 'Hello nested array two']]
export const tuple = ['Hello tuple one', 1] as const
export const empty = [,'Hello hole array']
export const matrix = [['Hello matrix a', 'Hello matrix b']]
export const mixed = [x, 'Hello mixed array', 1]
export const spreadArr = [...['Hello spread array one']]
declare const allowedKinds: ['Hello tuple type']
const classNames = ['Hello classNames array one', 'Hello classNames array two']
const { items = ['Hello default array one', 'Hello default array two'] } = obj
const objKeys = { routes: ['Hello routes array', 'Hello routes two'], items: ['Hello items array', 'Hello items two'], tags: ['Hello tags array one'] }
fn(['Hello array into fn'])
arr.includes(['Hello array into includes'])
console.log(['Hello array into console'])
cn(['Hello array into cn'])
obj.where(['Hello array into where'])
obj.x = ['Hello array assigned', 'Hello assigned two']
;[x, 'Hello bare array statement']
export const afterArrays = 'Hello after arrays'

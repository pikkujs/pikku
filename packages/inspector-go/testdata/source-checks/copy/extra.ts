declare const obj: any
declare function fn(...a: any[]): any

;(() => 'Hello iife')('Hello iife arg')
;(function () { return 1 })('Hello function iife arg')
class Host {
  m() {
    this.say('Hello this member call')
    super.say('Hello super member call')
    this('Hello this call')
  }
}
const { fromLiteral } = 'Hello destructured literal'
const [fromLiteralArray] = 'Hello array destructured literal'
;'Hello literal callee'()
;`Hello template callee`()
new 'Hello literal constructor'()
export const keyed = {
  keys: ['Hello keys prop array one', 'Hello keys prop array two'],
  ids: ['Hello ids prop array one', 'Hello ids prop array two'],
  names: ['Hello names prop array one', 'Hello names prop array two'],
  nested: { type: ['Hello type prop array one', 'Hello type prop array two'] },
  ['computedKey']: ['Hello computed prop array one', 'Hello computed prop array two'],
}
const iconNames = ['Hello iconNames array one', 'Hello iconNames array two']
const urls = ['Hello urls array one', 'Hello urls array two']
const KEYS = ['Hello KEYS array one', 'Hello KEYS array two']
const { pathName = ['Hello pathName default one', 'Hello pathName default two'] } = obj
obj.get(['Hello get array one', 'Hello get array two'])
obj.fn(['Hello member array one', 'Hello member array two'])
console.table(['Hello console array one', 'Hello console array two'])
fn(fn(['Hello nested call array one', 'Hello nested call array two']))
new Map([['Hello new map array one', 'Hello new map array two']])

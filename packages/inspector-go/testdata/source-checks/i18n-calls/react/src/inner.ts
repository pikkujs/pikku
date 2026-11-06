import { sep } from './i18n-types'
import { sep as s2 } from './index.js'
import { sep as s3 } from '../src/i18n-types.js'
import { sep as s4 } from './other'
import { asI18n } from './i18n-types'
sep('relative inside react source')
s2('x')
s3('abc')
s4('not matched')
sep(`${1}`)
asI18n('inside react src')

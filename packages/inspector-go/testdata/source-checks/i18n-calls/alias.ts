import { asI18n as t } from '@pikku/react'
import * as ns from '@pikku/react'
import { asI18nStub, asI18n as plain } from '@pikku/react'
import type { asI18n as typed } from '@pikku/react'
import { "asI18n" as quoted } from '@pikku/react'
import { other as asI18nish } from '@pikku/react'
import def from '@pikku/react'

t('aliased literal')
asI18n('bare name even without import')
plain('second alias')
typed('type import alias')
quoted('string-named import')
asI18nish('not an alias')
ns.asI18n('namespace member')
ns.deep.asI18n(`deep member ${1}`)
ns.asI18nStub('stub member')
other.asI18nX('suffix')
asI18nStub('stub name')
const inner = () => asI18n('in arrow ' + 1)
class C { m() { return t(x ? 'a' : 'b') } }
declare const x: boolean

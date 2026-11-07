import { asI18n } from '@pikku/react'
declare const o: any
o?.asI18n('optional chain member')
asI18n?.('optional call')
o!.asI18n('nonnull member')
(o as any).asI18n('cast member')
o['asI18n']('element access')

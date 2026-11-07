import { asI18n as renamed } from './elsewhere'
function asI18n(value: string) { return value }
asI18n('declared here')
renamed('renamed import of another module')
export function asI18nStub(copy: string) { return copy }
asI18nStub('stub declared here')

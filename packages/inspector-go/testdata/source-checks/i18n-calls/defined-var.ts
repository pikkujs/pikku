export const asI18n = <T extends string>(value: T) => value
asI18n('inside the definition file')
ns.asI18n('member still counts')
const { asI18nStub } = obj
asI18nStub('x')
declare const ns: any
declare const obj: any

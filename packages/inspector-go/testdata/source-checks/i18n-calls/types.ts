import { asI18n } from '@pikku/react'
declare const x: string
export const casts = [asI18n(<string>x), asI18n(<string>'angle literal'), asI18n(x!), asI18n(x!.length)]
class K {
  v = 'v'
  m() {
    return asI18n(this.v)
  }
  n() {
    return asI18n(this)
  }
}

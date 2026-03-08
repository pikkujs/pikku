export const randomUUID = () => globalThis.crypto.randomUUID()

export function createHash(_algorithm: string) {
  return {
    update(_input: string) {
      return this
    },
    digest(_encoding: string) {
      return {
        slice() {
          return ''
        },
      }
    },
  }
}

export default globalThis.crypto

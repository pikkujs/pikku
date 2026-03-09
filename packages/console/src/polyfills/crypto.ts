export const randomUUID = () => globalThis.crypto.randomUUID()

export function createHash(_algorithm: string) {
  let data = ''
  return {
    update(input: string) {
      data = input
      return this
    },
    digest(_encoding: string) {
      let hash = 0
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i)
        hash = ((hash << 5) - hash + char) | 0
      }
      const hex = (hash >>> 0).toString(16).padStart(8, '0')
      const repeated = hex.repeat(8)
      return {
        slice(start?: number, end?: number) {
          return repeated.slice(start, end)
        },
        toString() {
          return repeated
        },
      }
    },
  }
}

export default globalThis.crypto

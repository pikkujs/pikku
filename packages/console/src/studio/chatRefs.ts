import { useSyncExternalStore } from 'react'

export interface ChatRef {
  id: string
  label: string
  title: string
  text: string
}

let refs: ChatRef[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export const addChatRef = (ref: ChatRef) => {
  if (refs.some((r) => r.id === ref.id)) return
  refs = [...refs, ref]
  emit()
}

export const removeChatRef = (id: string) => {
  refs = refs.filter((r) => r.id !== id)
  emit()
}

export const clearChatRefs = () => {
  if (!refs.length) return
  refs = []
  emit()
}

export const useChatRefs = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => refs
  )

export const withChatRefs = (text: string, picked: ChatRef[]) =>
  picked.length ? `${picked.map((r) => r.text).join(', ')}: ${text}` : text

export const elementRef = (omId: string, tag: string, component: string): ChatRef => {
  const parts = omId.split(':')
  const file = parts.slice(0, -2).join(':')
  const line = parts[parts.length - 2]
  const basename = file.split('/').pop() ?? file
  const name = component || tag
  return { id: omId, label: `<${name}> ${basename}:${line}`, title: `${file}:${line}`, text: `\`${file}\` line ${line} (\`<${name}>\`)` }
}

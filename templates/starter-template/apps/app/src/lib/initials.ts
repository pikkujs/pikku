export function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  const chars =
    parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2)
  return chars.toUpperCase()
}

export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || email.split('@')[0] || email
}

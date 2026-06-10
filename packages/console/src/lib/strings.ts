export function toEnglishName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^(.)/, (c) => c.toUpperCase())
    .trim()
}

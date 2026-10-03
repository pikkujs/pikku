export const PREVIEW_SCOPE = 'pikku-preview-scope'

export function scopeThemeCss(css: string): string {
  return css
    .replace(/@custom-variant[^;]*;/g, '')
    .replace(/@theme inline\s*\{[^}]*\}/g, '')
    .replace(/(^|\n)\s*:root\s*\{/g, `$1.${PREVIEW_SCOPE} {`)
    .replace(/(^|\n)\s*\.dark\s*\{/g, `$1.${PREVIEW_SCOPE}.dark {`)
}

const raw = import.meta.glob('/workspace/packages/theme/theme.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export const workspaceThemeCss: string = Object.values(raw)[0] ?? ''

const accents: Record<string, string> = {
  workflow: 'var(--chart-1)',
  function: 'var(--chart-2)',
  generic: 'var(--muted-foreground)',
  http: 'var(--chart-3)',
  queue: 'var(--chart-4)',
  cli: 'var(--chart-5)',
  mcp: 'var(--chart-2)',
  schedule: 'var(--chart-3)',
  trigger: 'var(--chart-4)',
  channel: 'var(--chart-5)',
  router: 'var(--chart-2)',
  gray: 'var(--muted-foreground)',
}

export const nodeColor = (key?: string): string =>
  `var(--pikku-node-${key ?? 'generic'}, ${accents[key ?? ''] ?? 'var(--muted-foreground)'})`

import { pikkuSessionlessFunc } from '#pikku/function'
import {
  BrandWorkspace,
  type StockImageOrientation,
} from '@pikku/code-edit/brand'
import { ThemeWorkspace } from '@pikku/code-edit/theme'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'

type CLIConfig = {
  rootDir: string
  frontends?: Record<string, { cwd: string; primary?: boolean }>
}

const brand = (config: CLIConfig) =>
  new BrandWorkspace(findWorkspaceRoot(config.rootDir), {
    frontends: config.frontends,
    unsplashAccessKey: async () => process.env.UNSPLASH_ACCESS_KEY,
    cloudflare: async () =>
      process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
        ? {
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: process.env.CLOUDFLARE_API_TOKEN,
          }
        : undefined,
  })

const print = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

const count = (value: string | number | undefined) => {
  const n =
    typeof value === 'number' ? value : value ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export const pikkuDesignPlaceholders = pikkuSessionlessFunc<null, void>({
  func: async ({ config }) => {
    print(brand(config).placeholders())
  },
})

export const pikkuDesignFavicon = pikkuSessionlessFunc<
  {
    app?: string
    source?: string
    emoji?: string
    letter?: string
    background?: string
  },
  void
>({
  func: async ({ config }, input) => {
    print(await brand(config).favicon(input))
  },
})

export const pikkuDesignExtract = pikkuSessionlessFunc<
  { url?: string; file?: string; preset?: string; apply?: boolean },
  void
>({
  func: async ({ config }, input) => {
    const root = findWorkspaceRoot(config.rootDir)
    const { profile, theme } = await brand(config).extract(input)
    if (!input.apply) {
      print({ profile, theme })
      return
    }
    const applied = await new ThemeWorkspace(root).apply(theme)
    print({
      profile,
      applied: applied.id,
      colors: applied.theme.brand.colors,
      fonts: applied.theme.brand.fonts,
    })
  },
})

export const pikkuDesignImages = pikkuSessionlessFunc<
  { query: string; count?: string; orientation?: string; app?: string },
  void
>({
  func: async ({ config }, input) => {
    const orientation = ['landscape', 'portrait', 'squarish'].includes(
      input.orientation ?? ''
    )
      ? (input.orientation as StockImageOrientation)
      : undefined
    print(
      await brand(config).stockImages({
        query: input.query,
        count: count(input.count),
        orientation,
        app: input.app,
      })
    )
  },
})

export const pikkuDesignCrawl = pikkuSessionlessFunc<
  { url: string; maxPages?: string; app?: string },
  void
>({
  func: async ({ config }, input) => {
    print(
      await brand(config).crawl({
        url: input.url,
        maxPages: count(input.maxPages),
        app: input.app,
      })
    )
  },
})

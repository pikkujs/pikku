import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** What brand tooling needs from a headless browser: rasterise HTML to a square PNG, and evaluate an expression on a live page. */
export interface BrandBrowser {
  screenshot(html: string, size: number): Promise<Uint8Array>
  evaluate<T>(url: string, expression: string): Promise<T>
  close(): Promise<void>
}

type PwPage = {
  setViewportSize(size: { width: number; height: number }): Promise<void>
  setContent(html: string, options?: { waitUntil?: string }): Promise<void>
  screenshot(options: { type: 'png'; clip: { x: number; y: number; width: number; height: number } }): Promise<Uint8Array>
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  evaluate<T>(expression: string): Promise<T>
  close(): Promise<void>
}
type PwBrowser = { newPage(): Promise<PwPage>; close(): Promise<void> }
type PwModule = { chromium: { launch(options: { headless: boolean; executablePath?: string; args: string[] }): Promise<PwBrowser> } }

const PLAYWRIGHT_MODULES = ['playwright', '@playwright/test', 'playwright-core']

async function importFrom(dir: string | undefined, specifier: string): Promise<PwModule | undefined> {
  try {
    const target = dir ? pathToFileURL(createRequire(join(dir, 'package.json')).resolve(specifier)).href : specifier
    const mod = (await import(target)) as Partial<PwModule> & { default?: Partial<PwModule> }
    const chromium = mod.chromium ?? mod.default?.chromium
    return chromium ? { chromium } : undefined
  } catch {
    return undefined
  }
}

async function loadPlaywright(resolveFrom: string[]): Promise<PwModule> {
  for (const dir of [...resolveFrom, undefined]) {
    for (const specifier of PLAYWRIGHT_MODULES) {
      const mod = await importFrom(dir, specifier)
      if (mod) return mod
    }
  }
  throw new Error(
    "No headless browser: add playwright to the project ('npm i -D playwright && npx playwright install chromium')"
  )
}

/** A chromium launched on first use through whichever playwright package resolves from `resolveFrom` (the project) or from pikku itself. */
export function playwrightBrowser(
  resolveFrom: string[] = [process.cwd()],
  executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
): BrandBrowser {
  let launched: Promise<PwBrowser> | undefined
  const browser = () =>
    (launched ??= loadPlaywright(resolveFrom).then(({ chromium }) =>
      chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    ))
  const withPage = async <T>(fn: (page: PwPage) => Promise<T>): Promise<T> => {
    const page = await (await browser()).newPage()
    try {
      return await fn(page)
    } finally {
      await page.close().catch(() => {})
    }
  }
  return {
    screenshot: (html, size) =>
      withPage(async (page) => {
        await page.setViewportSize({ width: size, height: size })
        await page.setContent(html, { waitUntil: 'load' })
        return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } })
      }),
    evaluate: (url, expression) =>
      withPage(async (page) => {
        await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
        await page.waitForTimeout(1500)
        return page.evaluate(expression)
      }),
    close: async () => {
      if (launched) await (await launched).close()
      launched = undefined
    },
  }
}

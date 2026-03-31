import { watch, type FSWatcher } from 'fs'
import type { MetaService } from '@pikku/core/services'

export class FileWatcherService {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private pikkuMetaPath: string,
    private metaService: MetaService
  ) {}

  start(): void {
    this.watcher = watch(
      this.pikkuMetaPath,
      { recursive: true },
      (_event, filename) => {
        if (!filename?.endsWith('.gen.json')) return
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          console.log(`[watch] Metadata changed, clearing caches...`)
          this.metaService.clearCache()
        }, 300)
      }
    )
    console.log(`[watch] Watching ${this.pikkuMetaPath} for changes...`)
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.watcher?.close()
    this.watcher = null
  }
}

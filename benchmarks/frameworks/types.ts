/** The adapter contract. Adding a framework = one new folder here with an `adapter.ts` that default-exports an Adapter. */
export type Variant = {
  /** Row label, e.g. `pikku-LE`. */
  id: string
  /** Environment added to the server process (telemetry level, ...). */
  env: Record<string, string>
  /** Needs the loopback OTLP sink: `{SINK}` in env values becomes its base URL (the Pikku L3 level and the Elysia OpenTelemetry plugin both export there). */
  sink?: boolean
}

export type Artifact = {
  /** The process to start. The runner adds PORT, HOST, BENCH_DB, BETTER_AUTH_SECRET, BENCH_ROUTES and the variant env, and stops it with SIGTERM. */
  command: string[]
  cwd: string
  /** Bytes the deployment needs on disk. */
  sizeBytes: number
  /** Same app, unbundled-as-possible, for `bun --cpu-prof` (profile mode). */
  profileCommand?: string[]
}

export type Adapter = {
  name: string
  runtime: string
  /** Which validation library the adapter uses (reported, since it can differ). */
  validator: string
  variants: Variant[]
  /** Build for `routes` routes (the runner calls it once per N, before any measurement). */
  prepare(routes: number): Promise<Artifact>
}

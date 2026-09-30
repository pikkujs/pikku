/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API a native build talks to; a served build uses its own origin. */
  readonly VITE_SERVER_URL?: string
}

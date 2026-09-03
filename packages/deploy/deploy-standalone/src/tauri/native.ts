/**
 * The native APIs a shell can be given, and what each one costs the crate.
 *
 * A native API is never just a dependency. Each one is a crate, a `.plugin()`
 * line, a permission in a capability file, and — for anything the OS guards — a
 * usage-description string without which iOS terminates the app on first call
 * rather than returning an error. Keeping the four together in one record is
 * what stops a generated crate that compiles but dies the moment the feature is
 * used.
 *
 * Only plugins from Tauri's own workspace are listed. A community plugin may
 * well be the right answer for a given project, but it is the project's choice
 * to vendor and audit, not something a generator should pick on its behalf.
 */

/** Where a plugin's crate will actually compile. */
export type NativeSupport = 'all' | 'mobile'

export type NativeApi = {
  /** The name used on the command line. */
  readonly name: string
  /** Crate name, always `tauri-plugin-<name>` in the official workspace. */
  readonly crate: string
  /** The Rust module path `.plugin()` is called on. */
  readonly module: string
  /** Permission granted in the capability file. */
  readonly permission: string
  readonly support: NativeSupport
  /** One line for `--help` and for the generated capability description. */
  readonly summary: string
  /**
   * iOS `Info.plist` keys the OS demands before the API may be called, with the
   * string a project should replace. Absent means the API needs no consent.
   */
  readonly iosUsageDescriptions?: Readonly<Record<string, string>>
  /** Anything a project must do by hand that generation cannot do for it. */
  readonly caveat?: string
}

export const NATIVE_APIS: readonly NativeApi[] = [
  {
    name: 'biometric',
    crate: 'tauri-plugin-biometric',
    module: 'tauri_plugin_biometric',
    permission: 'biometric:default',
    support: 'mobile',
    summary: 'Face ID, Touch ID and Android BiometricPrompt',
    iosUsageDescriptions: {
      NSFaceIDUsageDescription: 'Unlock the app with Face ID.',
    },
    caveat:
      'Authenticates a person; it stores nothing. A biometric check that gates a screen the server would serve to anyone is decoration — the session still has to be authorised server-side.',
  },
  {
    name: 'haptics',
    crate: 'tauri-plugin-haptics',
    module: 'tauri_plugin_haptics',
    permission: 'haptics:default',
    support: 'mobile',
    summary: 'Vibration and impact feedback',
  },
  {
    name: 'barcode-scanner',
    crate: 'tauri-plugin-barcode-scanner',
    module: 'tauri_plugin_barcode_scanner',
    permission: 'barcode-scanner:default',
    support: 'mobile',
    summary: 'Camera barcode and QR scanning',
    iosUsageDescriptions: {
      NSCameraUsageDescription: 'Scan barcodes and QR codes.',
    },
  },
  {
    name: 'nfc',
    crate: 'tauri-plugin-nfc',
    module: 'tauri_plugin_nfc',
    permission: 'nfc:default',
    support: 'mobile',
    summary: 'Reading and writing NFC tags',
    iosUsageDescriptions: {
      NFCReaderUsageDescription: 'Read NFC tags.',
    },
    caveat:
      'iOS also needs the Near Field Communication Tag Reading capability on the App ID and in the entitlements file — a signing concern, so it cannot be generated.',
  },
  {
    name: 'geolocation',
    crate: 'tauri-plugin-geolocation',
    module: 'tauri_plugin_geolocation',
    permission: 'geolocation:default',
    support: 'all',
    summary: 'Current position and position watching',
    iosUsageDescriptions: {
      NSLocationWhenInUseUsageDescription: 'Show your position in the app.',
    },
  },
  {
    name: 'notification',
    crate: 'tauri-plugin-notification',
    module: 'tauri_plugin_notification',
    permission: 'notification:default',
    support: 'all',
    summary: 'Local notifications, scheduled or immediate',
    caveat:
      'Local only. Push notifications are a separate mechanism with no plugin in Tauri’s workspace, and adding one is native work on both platforms.',
  },
  {
    name: 'dialog',
    crate: 'tauri-plugin-dialog',
    module: 'tauri_plugin_dialog',
    permission: 'dialog:default',
    support: 'all',
    summary: 'Native message, confirm and file-picker dialogs',
  },
  {
    name: 'clipboard-manager',
    crate: 'tauri-plugin-clipboard-manager',
    module: 'tauri_plugin_clipboard_manager',
    permission: 'clipboard-manager:default',
    support: 'all',
    summary: 'Reading and writing the system clipboard',
  },
  {
    name: 'os',
    crate: 'tauri-plugin-os',
    module: 'tauri_plugin_os',
    permission: 'os:default',
    support: 'all',
    summary: 'Platform, version and architecture of the host',
  },
  {
    name: 'store',
    crate: 'tauri-plugin-store',
    module: 'tauri_plugin_store',
    permission: 'store:default',
    support: 'all',
    summary: 'A persistent key-value store on the device',
  },
] as const

const BY_NAME = new Map(NATIVE_APIS.map((api) => [api.name, api]))

/** `name — summary` for every API, for `--help` and error messages. */
export const nativeApiList = (): string =>
  NATIVE_APIS.map((api) => api.name).join(', ')

/**
 * Turn `--desktop-native biometric,haptics` into the APIs it names.
 *
 * Order follows the catalogue rather than the command line, so the generated
 * crate is byte-identical however the flag was typed — the shell manifest
 * records a hash of what was written, and a reordered plugin list would read as
 * a file the user had taken over.
 */
export const resolveNativeApis = (
  raw: string | readonly string[] | undefined
): NativeApi[] => {
  if (raw === undefined) return []
  const names = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0)

  const unknown = names.filter((name) => !BY_NAME.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown native ${unknown.length === 1 ? 'api' : 'apis'} ${unknown.map((name) => `"${name}"`).join(', ')}. Available: ${nativeApiList()}.`
    )
  }

  const chosen = new Set(names)
  return NATIVE_APIS.filter((api) => chosen.has(api.name))
}

/** The iOS consent strings every chosen API needs, merged. */
export const iosUsageDescriptions = (
  apis: readonly NativeApi[]
): Record<string, string> =>
  Object.assign({}, ...apis.map((api) => api.iosUsageDescriptions ?? {}))

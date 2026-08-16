import { safeFetch } from '@pikku/core/safe-fetch'

/**
 * Builds the AI SDK `experimental_download` function, routed through
 * {@link safeFetch}.
 *
 * The SDK downloads attachment URLs server-side whenever the model cannot
 * consume them natively, and its default downloader is an unguarded `fetch`.
 * Attachment URLs arrive from the caller over the generated agent HTTP surface,
 * so without this an attacker could point an attachment at the cloud metadata
 * endpoint or another internal host and have the contents relayed into the
 * model's context.
 *
 * URLs the model supports natively are returned as `null`, which tells the SDK
 * to pass them through untouched — the provider fetches those itself, so they
 * never touch this host's network.
 */
export const safeDownload =
  (allowedHosts?: string[]) =>
  async (
    requested: Array<{ url: URL; isUrlSupportedByModel: boolean }>
  ): Promise<
    Array<{ data: Uint8Array; mediaType: string | undefined } | null>
  > =>
    Promise.all(
      requested.map(async ({ url, isUrlSupportedByModel }) => {
        if (isUrlSupportedByModel) return null
        const response = await safeFetch(
          url.toString(),
          {},
          allowedHosts ? { allowedHosts } : {}
        )
        if (!response.ok) {
          throw new Error(
            `Failed to download attachment (${response.status} ${response.statusText})`
          )
        }
        return {
          data: new Uint8Array(await response.arrayBuffer()),
          mediaType: response.headers.get('content-type') ?? undefined,
        }
      })
    )

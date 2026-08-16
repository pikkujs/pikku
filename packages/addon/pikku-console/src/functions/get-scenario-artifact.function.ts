import { pikkuFunc } from '#pikku'

/**
 * Serves one screenshot or recording as itself, over HTTP rather than as RPC
 * JSON: a `<video>` element takes a URL, and base64 inside an RPC response is
 * neither playable nor cacheable.
 *
 * Reachable only through its route, so `path` is whatever the client asks for —
 * the store is what refuses a path that tries to leave the run.
 */
export const getScenarioArtifact = pikkuFunc<
  { runId: string; path: string },
  Response
>({
  title: 'Get Scenario Artifact',
  description:
    'The bytes of one screenshot or recording a scenario run produced, served with its own content type.',
  expose: false,
  scopes: ['pikku:console:scenarios:read'],
  func: async ({ scenarioRunStore }, { runId, path }) => {
    const artifact = await scenarioRunStore?.readArtifact(runId, path)
    if (!artifact) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(artifact.body, {
      headers: {
        'content-type': artifact.contentType,
        // A run's artifacts never change once it has finished, and reviewing a
        // failure means scrubbing the same video repeatedly.
        'cache-control': 'private, max-age=3600',
      },
    })
  },
})

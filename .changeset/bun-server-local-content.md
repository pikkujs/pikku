---
'@pikku/bun-server': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Serve `LocalContent` uploads and signed reads under Bun.

`LocalContent` hands the browser a `PUT <uploadUrlPrefix>/<key>` upload URL and a signed
`GET <assetUrlPrefix>/<key>` read URL, but it is a `ContentService` and cannot answer
either — something in the serving path has to. Only `@pikku/node-http-server` did. The
same project served under Bun handed out upload URLs that 404ed, with nothing naming the
cause: the config was accepted, the service was constructed, and the URLs looked right.

`@pikku/core` now exports `createLocalContentRequestHandler` from
`@pikku/core/services/local-content-request-handler` — the server half of `LocalContent`,
expressed in Web `Request`/`Response` so every runtime shares one implementation of the
signature check rather than each re-deriving it. It returns `null` for anything that is
not a content request, which is the caller's signal to carry on with its normal routing.

`PikkuBunServer` accepts `config.content` and a `contentSigningJWT` option, mirroring
`PikkuNodeHTTPServer`, and answers both prefixes ahead of static mounts and routing.
`BunServerRunner` was dropping `contentSigningJWT` on the floor, which silently disabled
signed asset reads for every Bun project even once the prefixes were served — the config
arrived, the service that verifies its signatures did not.

Signed reads are refused unless every claim matches, the path included: without that, a
signature minted for one asset would read any other.

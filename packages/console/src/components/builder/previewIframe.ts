/**
 * What a previewed app is allowed to do inside the console's iframe.
 *
 * A cross-origin iframe is granted none of these by default, and the failures
 * are quiet and easy to misread as app bugs: audio never starts (autoplay
 * defaults to `self`), `navigator.wakeLock.request()` rejects with a
 * permissions-policy violation, and `getUserMedia` cannot even reach the
 * prompt. An app that runs correctly on its own hostname then looks broken in
 * the preview and nowhere else.
 *
 * Delegation is not a grant of the permissions that prompt — the browser still
 * asks the person before a microphone or camera opens. It only stops the
 * console from being the reason the question is never asked.
 */
export const PREVIEW_IFRAME_ALLOW = [
  'autoplay',
  'microphone',
  'camera',
  'screen-wake-lock',
  'clipboard-write',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'midi',
  'xr-spatial-tracking',
].join('; ')

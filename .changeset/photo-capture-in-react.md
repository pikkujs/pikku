---
'@pikku/react': patch
---

`usePhotoCapture` — take or choose a photo with no markup to write. `open({ camera: true })` creates the file input, opens the rear camera on a phone (and an ordinary file dialog on the laptop you develop on), and throws the input away again; what comes back is already downscaled and base64-encoded, because a phone frame is several megabytes and every byte of it is paid for on the upload, in the row it is stored in, and again in a vision model's context. Two traps that cost accuracy are handled on the way: EXIF orientation is applied during decode, so a portrait photo does not reach the model on its side, and an iPhone HEIC that `createImageBitmap` refuses falls back to decoding through an `<img>`. `prepareImage(file, options)` does the same work for a file you already have, from a drop target or a paste.

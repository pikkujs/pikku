---
'@pikku/cucumber': patch
---

browser harness: actors carry the app's generated PikkuRPC/PikkuFetch clients (BrowserWorld.createClients + actor.clients() with the actor's session cookie), persona-based login steps ("{actor} is logged in" — credentials come from config.personas, the explicit form remains only for invalid-credential tests), and an overridable BrowserWorld.resetAppData() behind "the app data is reset".

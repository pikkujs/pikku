---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
'@pikku/cloudflare': patch
'@pikku/next': patch
---

Unify session persistence through SessionStore, remove session blob from ChannelStore

- PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
- ChannelStore no longer stores session data — maps channelId to pikkuUserId only
- ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
- Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

A webhook source's `method` may be a list, mounting one route per method, for providers that verify the URL with a GET and deliver events with a POST (WhatsApp, Strava, Onfleet, Mailchimp), or a HEAD (Trello, Mandrill, SurveyMonkey).

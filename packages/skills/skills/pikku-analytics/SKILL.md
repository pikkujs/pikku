---
name: pikku-analytics
description: >-
  Track and measure what people do: track this, measure, how many, a funnel, analytics. defineAnalyticsEvents, `analytics.record`, usePikkuAnalytics, `POST /analytics`. Open before writing any tracking code.
installGroups: [core]
---

# Pikku Analytics

What to reach for and why. For how to call it, run this once: `pikku doc defineAnalyticsEvents usePikkuAnalytics AnalyticsLog`.

An event exists once it is declared in the exported `defineAnalyticsEvents` const (`packages/functions/src/analytics.ts`). The two events already there are placeholders: replace them. An undeclared name fails the build.

## The rules

**Measure outcomes, not clicks.** `order_placed` answers a question; `button_clicked` does not. A funnel is one declared event per step.

**Record where the result is known.** That is usually the function that made it happen, after the work succeeded: `analytics.record({ name: 'order_placed', amount })`. A browser or ad blocker cannot drop it. Use a screen only for what only the browser knows, such as a page view: `useAnalytics().event('page_viewed', { path })` from `@/lib/product`. Never record one outcome in both places: it counts twice.

**Props stay low-cardinality.** A prop is something to group by: a plan, a currency, a step, an amount. No ids, no free text, no URLs carrying ids.

**Nothing personal, and no identity in props.** No user id, email or name. Pikku stamps who it was from the session, on both paths, and a client cannot set it: the ingest answers 422 to a prop that was not declared. Signed-out events have no user.

**Never build a tracker.** No third-party snippet or script tag, no hand-written table of events, no `fetch` to anywhere else. Where events go is decided by Pikku for each environment.

**It is not a record of truth.** Recording is best effort. Money and compliance belong in a table or `auditLog`.

## When it does not work

- `usePikkuAnalytics needs an analytics client`: `createPikku` makes no client. Add `analytics: createAnalytics<AnalyticsEvent>({ endpoint })` to the instance given to `PikkuProvider`.
- `/analytics` answers 404: set `analytics` under `scaffold` in `pikku.config.json`.
- 403 from `/analytics`: the screen's origin is not allowed. Add it to `CORS_ORIGINS`.

## Seeing it

Studio's Metrics screen lists declared events before any has fired, and counts them on a published copy. Under `pikku dev`, events land in the `pikku_analytics_events` table with `name`, `source` and `user_id`.

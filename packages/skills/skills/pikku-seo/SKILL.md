---
name: pikku-seo
description: >-
  On-page SEO rules for the app's PUBLIC pages: per-route head() titles and meta descriptions, Open Graph tags, one-h1 heading hierarchy, semantic/crawlable markup, JSON-LD on the landing page, and noindex for the logged-in area.
  TRIGGER when: building or reworking any public page (landing, pricing, about, blog/content pages), writing page titles or meta tags, or the user asks about SEO / Google / discoverability / social sharing previews.
  DO NOT TRIGGER when: working on logged-in /app screens (they are noindexed — only the one robots rule below applies), backend functions, database, or deployment.
installGroups: [client]
---

# SEO Rules

Apps render SSR from the edge, so crawlers see full HTML — the ranking work is
getting the on-page signals right while you build. These rules apply to PUBLIC
routes only (the landing page and any marketing/content pages). The logged-in
`/app` area is private: it gets `noindex` and nothing else from this skill.

## Per-route head() — every public route, no exceptions

Titles and descriptions live in TanStack Start's `head()` on the route, merged
root → leaf (the leaf's title/meta win). The root route already carries the
site-wide defaults and OG tags; every public page you add MUST override both:

```tsx
export const Route = createFileRoute('/pricing')({
  head: () => ({
    meta: [
      { title: 'Pricing — Acme Scheduling' },
      {
        name: 'description',
        content:
          'Simple per-seat pricing for Acme Scheduling. Start free, upgrade when your team grows — no setup fees, cancel anytime.',
      },
      { property: 'og:title', content: 'Pricing — Acme Scheduling' },
      { property: 'og:description', content: 'Simple per-seat pricing. Start free.' },
    ],
  }),
  component: PricingPage,
})
```

`head()` strings are plain strings (they do not go through the Mantine i18n
gate) — write real copy for THIS app, in the app's voice.

- **Title**: unique per page, 50–60 characters, the page's primary topic first,
  brand at the end (`Topic — AppName`). The template's `__APP_TITLE__` default
  must never survive the rebrand, on any page.
- **Description**: unique per page, 150–160 characters, states the concrete
  value of the page in plain language — a reason to click, not a keyword list.
- **Dynamic public pages** (e.g. a public detail page) build both from loader
  data: `head: ({ loaderData }) => ({ meta: [{ title: `${loaderData.name} — AppName` }, ...] })`.
- **Never invent URLs**: the deployed domain is unknown at build time, so do
  NOT emit `canonical`, `og:url`, or `og:image` pointing at a made-up domain —
  omit them (same principle as the `/api` serverUrl rule). `og:image` only if a
  real asset exists in the app.

## Logged-in area = noindex

The `/app` route (the authenticated layout route) gets exactly one meta entry:

```tsx
head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] })
```

Never noindex a public page, and never put per-page SEO effort into `/app`
screens — they are invisible to crawlers by design.

## Headings — exactly one h1 per page

- Every page has EXACTLY ONE h1 (`<Title order={1}>` in Mantine, `<h1>` in
  Tailwind) and it names the page's primary topic — aligned with the title tag,
  not identical boilerplate.
- Logical hierarchy below it: h1 → h2 → h3, no skipped levels, headings
  describe the content under them. Never pick a heading level for its font
  size — set the size on the correct level (`<Title order={2} fz="xs">`).

## Crawlable, semantic markup

- Landmarks on public pages: `<nav>`, `<main>`, `<footer>` (Mantine: `component="nav"` etc.).
- Navigation between public pages uses real links (`<Link>`/`<a href>`) with
  descriptive anchor text — crawlers follow hrefs; a `div onClick` navigation
  is invisible to them. No public page may be orphaned: every public page is
  reachable by link from the landing page (directly or via nav/footer).
- Every meaningful `<img>` has alt text describing the image; decorative images
  get `alt=""`. Prefer descriptive file names for real assets.
- Readable URLs: public routes are lowercase, hyphen-separated, and named for
  their content (`/pricing`, `/how-it-works`) — never `/page2` or query-param
  navigation.

## JSON-LD on the landing page

The landing page carries one structured-data script describing the product.
Only mark up what is visibly true on the page — never invent ratings, reviews,
or offers (fake schema is a Google penalty, not a boost):

```tsx
head: () => ({
  meta: [
    /* title + description as above */
  ],
  scripts: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Acme Scheduling', description: '…' },
          { '@type': 'WebSite', name: 'Acme Scheduling' },
        ],
      }),
    },
  ],
})
```

Add further types only when the page genuinely IS that thing and shows the
required fields: `FAQPage` for a real FAQ section, `Article` for a blog post
(headline, datePublished, author), `Product`/`Offer` for a real price list.
Omit `url`/`logo` fields — deployed domain unknown (see "never invent URLs").

## Verify

Open each PUBLIC page and read its `<head>`: a title, a meta description, and
exactly one `h1`. A public page is not done while any of the three is missing.
Signed-in pages under `/app` are exempt once `noindex` is set — they are not
indexed, so their head tags do not matter.

## Don'ts

- No keyword stuffing — write for the reader; one clear topic per page.
- Don't duplicate the same title/description across pages (worse than absent).
- Don't render SEO-critical copy only after client-side effects — it must be
  in the SSR HTML (loader data is fine; `useEffect`-fetched content is not).
- Don't add robots.txt/sitemap plumbing — the platform owns that layer.

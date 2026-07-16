# pikku-product-second-opinion

Turns a `pikku-software-archaeology` blueprint into a **plain-language report for a
non-technical owner** — a founder/PM stuck with an app they didn't build.
Explains how it works and how it could be better, in business terms.

```
Existing repo → pikku-software-archaeology → .knowledge/ blueprint → pikku-product-second-opinion → founder report
   (facts)              (extract)          (machine-readable)         (translate + advise)   (markdown + web page)
```

## The split from pikku-software-archaeology

- **pikku-software-archaeology** extracts *facts* into `.knowledge/` for a machine (Pikku) to rebuild from. Engineer/generator audience.
- **pikku-product-second-opinion** reads that blueprint and writes an *opinionated report* for a human to decide from. Non-technical audience.

One extracts; one advises. This skill consumes the other's output — it doesn't re-read the code.

## What the report is calibrated to (locked by the author)

- **Layered depth** — a one-page executive summary, then a section per major area for anyone who wants detail.
- **Direct but fair tone** — names problems plainly, always with why-it-matters and credit for what's good.
- **Both formats** — a markdown copy in the repo plus a clean, shareable web page (rendered via the `artifact-design` skill).

## The rules that make it work

1. **Translate, don't dump.** Every technical concept becomes a business outcome or a plain description. The jargon→plain table is in `SKILL.md`.
2. **Every problem carries impact + severity + effort.** A problem with no "what it means for you" doesn't ship.
3. **Always credit what works.** All-criticism reports get dismissed.
4. **Argue improvements in business outcomes** (more reliable / faster / cheaper / safer / easier to hand off), and say whether each is a cheap **rewire** or an expensive **rebuild** — never recommend a rewrite just because the code is messy.
5. **Mark confidence.** Certain and "I'd need to check" are different sentences.
6. **Cover the frontend and the other ways the app is used** when the blueprint has them — walk the screens as a journey, call out consistency, and flag the custom-logic pieces (charts/tables/editors) as the real work vs the cheap standard pieces. Name the ways the product can be driven (people/web, developers/API+SDK, AI agents/MCP, power users/CLI) — often a genuine strength.
7. **Give honest technology tradeoffs — both sides.** Every stack bet (framework, auth, hosting, key libraries) gets what-it-buys AND what-it-costs in business terms, tied to the founder's stage/goals. Don't cheerlead, don't trash, and **don't soften the disadvantages**. The skill carries honest both-sides framing for Better Auth (self-hosted sign-in) and TanStack Start (the web framework) as reference examples.

## Files

```
pikku-product-second-opinion/
├── SKILL.md                      # method + voice rules + red flags
├── README.md                     # this file
├── references/report-template.md # the layered structure to fill in
└── example/sample-report.md      # worked example (competitor-tracking area, founder voice)
```

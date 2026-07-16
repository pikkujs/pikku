# Your app, in plain English — and where it could get better
*A second opinion on the competitor-tracking system*

> Worked example for the product-second-opinion skill. Shows the voice and the
> layered structure on one real area (competitor tracking), drawn from a
> software-archaeology blueprint + parity report. A full report would repeat
> Part 2 for each major area.

**How to read this:** no technical background needed. I'll explain what you have,
what's solid, and what I'd change — and for each change, what it costs and what
it buys you.

## Part 1 — The short version

**What you have.** A competitive-intelligence app: it watches your competitors'
websites, spots meaningful changes (pricing, hiring, product updates), summarizes
them, and feeds your briefings and dashboards so your team knows first.

**The headline.**
- The hard part — reading messy websites and telling a real change from noise — is built well.
- Until recently the app wasn't re-checking sites on its own at all *(now fixed)*.
- When it does spot a change, the follow-up work only happens if someone clicks a button — so your dashboards can quietly go stale while looking current.

**If it were me, this is the order I'd tackle things:**

| Fix | Why it matters to you | Effort | Payoff |
|---|---|---|---|
| Turn on automatic checking | Sites weren't refreshing themselves | *Done* | High |
| Make the follow-up automatic | Stops your intelligence going stale unnoticed | Medium | High |
| Make failures visible | Problems surface instead of hiding | Small | Medium |

---

## Part 2 — Area by area

### Competitor tracking

**What this does.** Watches your competitors' sites for you and turns meaningful
changes into summaries your team can act on.

**How it works today.** Like a clipping service: on a timer, the app re-reads
each competitor's site, compares it to last time, decides whether anything
*meaningful* changed (it ignores trivial edits), and writes up a summary when
something real happens.

**What's working.** The expensive, valuable part is solid — the app is genuinely
good at reading messy sites, separating real changes from noise, and summarizing
them. Keep it.

**What's holding you back.**
- **The automatic checking wasn't switched on.** The machinery existed but nothing
  pulled the trigger, so sites weren't refreshing on their own. What it means for
  you: your "live" intelligence wasn't live. Severity: Urgent. Effort: Small.
  *(Already fixed.)*
- **The follow-up is manual.** When a change is found, updating your briefings and
  comparisons doesn't happen on its own — someone has to click "regenerate." What
  it means for you: if nobody clicks, the dashboard shows old information while
  looking up to date, and you can't trust it. Severity: Serious. Effort: Medium.

**How I'd do it differently — and why it's worth it.** Make the whole chain
finish as one task: when a change is found, the briefings and comparisons update
automatically as part of the same job, so "done" means "your intelligence is
actually current." And a failed step should show as a visible error, not vanish.
This is a **rewire, not a rebuild** — the valuable machinery stays; I'm connecting
pieces that already sit next to each other. Outcome: **more reliable, fewer
surprises** — which is the entire promise of the product.

---

## Part 3 — The fine print

**How confident am I.** High on both problems — I can see them directly. The fix
is a well-understood pattern, not a gamble. I'd want one live test against your
real data before calling it done.

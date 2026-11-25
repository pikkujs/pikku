---
name: pikku-site-archaeology
description: >-
  Study an existing website before rebuilding it: crawl every page and write down the screens, what every form and button does and what it stores, prices, currency, languages and outside services, as plain notes in knowledge/site/ for a person to review. Use before planning a clone, rebuild or conversion of a live site. Page layout and look is pikku-site-clone.
installGroups: [core]
---

# Site archaeology

Before a site is rebuilt, someone has to know what it does. Your job is to find out and write it down so a person can
read it and say "yes, that is the site". You build nothing: the plan is filed afterwards, from your notes, and the person reads both before anything is built.

## 1. The page list

Capture the original with this command. Do not write your own capture script.

```bash
mkdir -p artifacts/references/<site> && pikku ui pages capture https://the-site.example/ --out artifacts/references/<site> > artifacts/references/<site>/capture.log 2>&1 &
```

It writes the page list to `artifacts/references/<site>/pages.txt` at once. It then captures every page (screenshots,
layout, colours and fonts) and downloads the pictures, in the background. The builders need that reference:
`pikku changes done` refuses page changes of a clone without it. That list is your to-do list. Look at **every** page on it: a page you did not look at is a page the plan will miss. If
there is no browser, fetch each page with `curl -sL` and read the text.

## 2. What to find on every page

- What the page is for, and its main sections, in plain words.
- Every **form**: its fields, its button, and what the visitor sees after sending it (a thank-you page, an email, nothing).
- Every other thing a visitor can do: book, apply, register, log in, search, filter, pay, download.
- Prices, and the currency they are written in. The language of the page.
- Every outside service the page relies on, and what it is for. Read the served HTML, not only the visible links: hosted
  forms and form backends, embeds (video, maps, calendars, social feeds), analytics and trackers, fonts and CDNs, payment,
  ticketing and booking links, newsletter and email services, the hosted CMS or page builder that serves the site, and
  sign-in.
- What the owner changes over time: events and their dates, prices and offers, testimonials, articles, sections they
  update. That is content the rebuilt site keeps in its database, not text fixed in a page.

## 3. Write it down

Write plain notes in `knowledge/site/` (follow the pikku-knowledge skill for the note format) and run
`pikku knowledge validate`:

- `index.md`: one line per page: its path and what it is for.
- `forms.md`: every form: the page, the fields, what happens on sending, and what the owner would need to see afterwards.
- `things-kept.md`: what the rebuilt site must remember (enquiries, subscribers, bookings, applications, events and so
  on) and the content the owner changes over time, in plain words, each with the pages it comes from.
- `prices-and-languages.md`: the prices, the currency and the languages, page by page.
- `outside-services.md`: each outside service, the pages it is on, what it does there, and a decision: replace it (with
  what, inside the app) or keep it (and why, e.g. the owner's payment account).
- `open-questions.md`: what you could not tell from the outside (logins, payments, anything behind a form).

Say which page each fact comes from. Write "not seen" for anything you could not see. Never guess a price, a currency
or a field.

## 4. Then plan from it

Do not build. Go back to the pikku-changes skill and file the plan from your notes, following
`references/planning-from-the-notes.md` (what a plan for a site holds: the capture and frame changes, pages, new pages, templates, the starter's defaults). Finish with
a few lines: how many pages you looked at, the forms you found, and the open questions.

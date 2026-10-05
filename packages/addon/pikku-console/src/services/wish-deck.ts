import type { ModelAccess } from './studio-host.service.js'

const IDEA_SYSTEM_PROMPT = `You take one sentence describing an app someone wants to build and show them what it could grow into.

First, NAME it. Two or three words a small team would actually paint on the door, drawn from what the app does or the world it lives in — "Watering Log", "Second Brain", "Night Shift". Title case, no punctuation, no technology in it: never "AI", "Smart", "Pro", "Hub", "Platform", "-ify", and never a placeholder like "My App" or "Project One". Write it in whatever language the idea was written in.

Then return 10 things the app could let people DO, ordered from the smallest version worth using (the MVP) to the full platform. Each is a step up on the one before it — this is one project growing, not ten different products.

Write each line as a plain capability sentence, the way the person would say it out loud:
  "Users can share their notes with their therapist"
  "Users can record a session and get the themes out of it"

Voice: concrete, present tense, about a real person doing a real thing. No buzzwords, no "AI-powered", no "leverage", no "seamless", no "revolutionize". A title is 2-4 words, a short label for the line. A line is one sentence under 90 characters and never just repeats the title.`

const NEXT_SYSTEM_PROMPT = `You are shown the root note of an existing app's knowledge base — what it is, who uses it, and what it already does — and you show the people building it where it could go next.

First, NAME it — two or three words a small team would paint on the door, drawn from what the note says the app is. Title case, no punctuation, no technology in it: never "AI", "Smart", "Pro", "Hub", "Platform", "-ify", and never a placeholder like "My App". If the note already gives the app a name, return that one.

Then return 10 things the app could let people DO that it does not do today, ordered from the smallest one worth shipping next to the most ambitious. Each must belong to THIS app: it uses the app's own words for its own things (a job, a docket, a session, a member), and it follows from what the note says the app is for. Never restate something the note already describes as built, and never propose a different product.

Write each line as a plain capability sentence, the way the person would say it out loud:
  "Owners can text a customer the moment their frame is ready"
  "A job can be split across two people without losing its history"

Voice: concrete, present tense, about a real person doing a real thing. No buzzwords, no "AI-powered", no "leverage", no "seamless", no "revolutionize". A title is 2-4 words, a short label for the line. A line is one sentence under 90 characters and never just repeats the title. Write in the language the note is written in.`

const ON_THE_RECORD_PROMPT = `The team has answered decks for this app before. Every line below is already on the record. Do not propose any of them again, and do not propose a reworded version of one.`

const SHAPE = `Answer with JSON only: {"name": string, "aspirations": [{"title": string, "line": string}]}`

export interface WishDeck {
  name: string
  aspirations: { title: string; line: string }[]
}

export const normalizeTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '')

export async function generateWishDeck(
  access: ModelAccess & { model: string },
  source: { idea?: string; knowledge?: string },
  answered: { title: string; line: string }[]
): Promise<WishDeck> {
  const onTheRecord = answered.length
    ? `\n\n${ON_THE_RECORD_PROMPT}\n${answered.map((a) => `- ${a.title} — ${a.line}`).join('\n')}`
    : ''
  const response = await fetch(
    new URL('chat/completions', access.proxyUrl.replace(/\/?$/, '/')),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${access.apiKey}`,
      },
      body: JSON.stringify({
        model: access.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${source.knowledge ? NEXT_SYSTEM_PROMPT : IDEA_SYSTEM_PROMPT}\n\n${SHAPE}`,
          },
          {
            role: 'user',
            content: source.knowledge
              ? `The app, as its own knowledge base describes it:\n${source.knowledge}${onTheRecord}`
              : `The idea, in their words:\n${source.idea}${onTheRecord}`,
          },
        ],
      }),
    }
  )
  if (!response.ok) {
    throw new Error(`Model call failed: ${response.status} ${await response.text()}`)
  }
  const body = (await response.json()) as {
    choices: { message: { content: string } }[]
  }
  const deck = JSON.parse(body.choices[0]?.message.content ?? '{}') as Partial<WishDeck>
  const seen = new Set(answered.map((a) => normalizeTitle(a.title)))
  return {
    name: (deck.name ?? '').trim().slice(0, 120),
    aspirations: (deck.aspirations ?? [])
      .filter((a) => a?.title && a?.line && !seen.has(normalizeTitle(a.title)))
      .slice(0, 10),
  }
}

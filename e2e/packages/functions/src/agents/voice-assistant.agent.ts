import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'
import { voiceInput, voiceOutput } from '@pikku/core/agent'

/**
 * A todo assistant you hold a spoken conversation with.
 *
 * Where `voiceInputAgent` only transcribes a question, this one is the whole
 * loop: it listens, answers out loud, runs tools, and can be talked over
 * mid-sentence. Its tools are picked to exercise the interrupt path rather
 * than to be interesting — reads that are cheap to redo, writes that are not,
 * and one deliberately slow tool that will still be running when the user
 * cuts in.
 *
 * The approval wording is the part that matters most here. On a screen a
 * mis-worded confirmation is still checkable against the button next to it;
 * spoken aloud it is all the user gets, so the sentence they answer has to be
 * the sentence the function sanctioned. The goal below therefore forbids the
 * model from asking for permission itself — `approvalDescription` on
 * `addTodo`/`deleteTodo` produces the prompt, and the client speaks it
 * verbatim.
 */
export const voiceAssistantAgent = pikkuAgent({
  name: 'voice-assistant-agent',
  description: 'Holds a spoken conversation about a todo list',
  goal: [
    'You are a voice assistant for a todo list. You are being listened to, not read.',
    '',
    'Default to a sentence or two, because most answers here are one fact and',
    'waiting through three sentences for it is worse than reading them. That is',
    'a default, not a limit: if the user asks for detail, or for you to keep',
    'talking, give them as much as they asked for and do not explain that you',
    'were being brief.',
    '',
    'Speak plainly — no lists, no markdown, no IDs read out digit by digit.',
    'Refer to todos by their title.',
    '',
    'Never say you did something unless a tool did it. Not "done", not "I',
    'marked it", not "I just looked it up" — if there was no tool call, there',
    'was no action, and saying otherwise is the one mistake here the user has',
    'no way to catch. Spoken, there is no tool-call log next to your answer;',
    'your sentence is the only record they get.',
    '',
    'If nothing you have does what was asked, say that plainly and say what you',
    'do have. Do not reach for the closest tool instead — the nearest thing to',
    'completing a todo is deleting it, and that is not a near miss.',
    '',
    'Answering from what you were told earlier is fine, and calling it a fresh',
    'look is not. "Just now" means this turn. If the list you are reading from',
    'came from an earlier turn, say so — "from the list you asked for a moment',
    'ago" — or call the tool again and then it is true.',
    '',
    'Never ask for permission to add or delete a todo, and never describe what',
    'you are about to do to get consent. Those tools stop and ask on their own,',
    'in wording that has been checked; anything you say instead is unchecked and',
    'the user cannot see the difference. Just call the tool.',
    '',
    'If you are cut off, do not apologise or recap. Answer what was just asked,',
    'and say nothing about having been interrupted — the user was there.',
    '',
    'One exception. A tool result marked "undelivered" is something that changed',
    'and that the user has not been told about, because your reply describing it',
    'was cut off. Mention that once, briefly, as an aside, then move on. Nothing',
    'else counts: if no result says "undelivered", there is nothing to report.',
  ].join('\n'),
  model: 'openai/gpt-5-mini',
  // The reply is listened to, not read, so the pause before the first word is
  // most of what the interaction feels like, and reasoning is paid entirely
  // inside that pause.
  //
  // Re-measured against `'low'` over an eight-turn transcript of real speech,
  // after the tool-selection failures that prompted the question turned out to
  // be a missing tool rather than a thin budget. Both settings picked the
  // right tool on every turn of every run. `'low'` was 5568ms to first token
  // against 3775ms here — 1.8s of silence per turn, bought for nothing
  // measurable. (An earlier note here claimed 2.5s against 0.9s; that was a
  // smaller goal and half these tools, and it no longer holds.)
  providerOptions: { openai: { reasoningEffort: 'minimal' } },
  tools: [
    // Cheap to redo, so an interrupt discards them rather than explaining them.
    ref('todos:listTodos'),
    ref('todos:getTodo'),
    // Was missing, and the gap did not surface as a refusal. Asked to mark a
    // todo done, the model first claimed it had — "Okay, marking get lunch
    // done. Done." with no tool call behind it — and then, on a later run,
    // reached for the nearest write it did have and tried to *delete* the
    // item. Only `deleteTodo`'s approval gate stopped that. An agent with no
    // tool for the request does not report the gap, it fills it.
    ref('todos:completeTodo'),
    // Gated by `approvalRequired`, and the source of the spoken prompt.
    ref('todos:addTodo'),
    ref('todos:deleteTodo'),
    // Slow on purpose: long enough that a barge-in lands mid-tool.
    ref('graph:sleep'),
  ],
  agentMiddleware: [
    // This was Nemotron, to stop Whisper answering a pause with stock filler —
    // "Thank you.", "*sad music*" — appended to what was actually said. That
    // filler turned out to be provoked by the clip, not the model: turns were
    // recorded from the moment the previous one ended, so every one of them
    // opened with seconds of room tone. Clips now come from the speech model
    // already cut at both ends, and Whisper returns an empty string for
    // near-silence like everything else.
    //
    // What Nemotron does instead is worse, because it is a *streaming* model
    // handed a whole short clip: it drops the tail. "I said yes" came back as
    // "I said ye", "okay and can you hear me now" as "okay and can you hear
    // me". On a spoken approval that is the entire answer — the user says yes,
    // nothing arrives, and the conversation deadlocks. Whisper was also twice
    // as fast on every clip (253–667ms against 810–1341ms) at the same price.
    //
    // Qwen3-ASR and Voxtral are faster still and read short clips correctly,
    // but both invent on near-silence — "嗯。" and "Yeah." — and the Chinese one
    // would swing the reply into `zf_xiaobei` below. Latency is not worth an
    // agent answering a question nobody asked.
    //
    // Under the deterministic suite this never leaves the process — `'*'`
    // routes every provider name to the scripted provider — so naming the real
    // model costs nothing and keeps the config honest about production.
    voiceInput({ model: 'deepinfra/openai/whisper-large-v3-turbo' }),
    // Speech is synthesized a sentence at a time as the model writes, so the
    // first one is playing while the rest is still being generated. A reply
    // that waited for the whole text before making any sound would leave a
    // silence long enough that the user starts talking into it.
    //
    // Left on under the mock provider too — it has a speech model, so the
    // deterministic suite carries the audio path rather than routing around it.
    // Kokoro is 32x cheaper per character than the multilingual alternatives
    // (0.000062c against Qwen3-TTS's 0.002c — 1.5c an hour of conversation
    // against 48c), which is worth keeping for the languages it does handle.
    //
    // What it must not do is try the ones it does not. Handed Arabic — which it
    // has no voice for — it neither fails nor stays quiet: it reads out the
    // letter names, 24 seconds of "Arabic meem, Arabic ra" for a one-line
    // sentence. So its range is declared, and anything outside it is left
    // unspoken and said so.
    //
    // The voice per script is not decoration. Kokoro's voices are per-language,
    // and the default American-English one does that same letter-name reading
    // to Chinese: 9.9 seconds for a sentence `zf_xiaobei` speaks in 3.5, and
    // Nemotron reads the result back as "Chinese letter, Chinese letter".
    voiceOutput({
      model: 'deepinfra/hexgrad/Kokoro-82M',
      speakableScripts: {
        han: 'zf_xiaobei',
        kana: 'jf_alpha',
        devanagari: 'hf_alpha',
        latin: 'af_bella',
      },
    }),
  ],
  maxSteps: 10,
  toolChoice: 'auto',
})

---
'@pikku/core': patch
---

fix(core): a judge grades the run, not just the sentence it ended with

The prompt built for an LLM judge carried the user's question, the agent's
answer and, for a reference-based judge, the answer key — but never the tool
calls, although `ScorerInput` has always carried them and heuristic scorers
read them.

An answer produced from a tool and the same sentence invented by the model are
identical in the output alone; they differ only in what the run did to get
there. Asked to grade a todo agent that had just listed the user's todos
correctly, a judge given only the answer called it "a plausible-looking list"
that "offers no real access to your actual list, making it effectively a guess",
and scored 0.2 what it scored 1 on other runs with near-identical answers. It
was applying its rubric correctly to the evidence it had; the evidence was the
problem.

The default prompt now names the tools the run called, and marks the ones that
failed. `pikkuAgentJudge` takes a `toolCalls` option for how much of the
trajectory to disclose:

- `names` (default) — which tools ran and which failed. No arguments, no
  results, no error text. Enough to settle whether the run had real access,
  which is what the 0.2 was doubting.
- `full` — arguments and results too, truncated so one fat result cannot crowd
  the answer out of the judge's context. For a judge that grades the answer
  *against* what the tool returned.
- `off` — no trajectory at all.

A judge is a third-party model, and a tool's arguments and results are the most
sensitive thing a run touches, so the default discloses the least that fixes
the bug. Output middleware still has its pass first either way: a scorer sees
the post-middleware snapshot, so anything a `modifyOutput` redacted is already
gone before `toolCalls` is consulted.

A run that called nothing gets no section rather than an empty one, and a
scorer supplying its own `prompt` is unaffected. `ScorerJudgeConfig.toolCalls`
is required — `pikkuAgentJudge` resolves the default, so only code building
that type by hand is affected.

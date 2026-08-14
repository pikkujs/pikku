---
type: decision
title: Speech synthesis picks a voice per sentence but announces a limitation once
description: A bilingual reply should speak the half it can, and repeating the notice for every sentence would bury the reply itself
tags: core, agent
---

# Speech synthesis picks a voice per sentence, and warns once per reply

`voiceOutput` checks the script of each sentence separately, but emits any
"cannot speak this" notice only once for the whole reply.

Per sentence is what makes the voice correct. A reply that answers in English
and then quotes a Chinese title is two sentences in two scripts, and each is
synthesized in the voice its own script needs. Checking once for the whole reply
would pick one voice and mispronounce the other half.

Announcing once is what keeps the reply audible. A bilingual answer should still
speak the part it can, and repeating the notice for every sentence of a long
reply buries the answer under its own caveats.

**What this rules out:** moving the script check up to the reply level to save
work, and moving the notice down to the sentence level for consistency with it.
The two belong at different granularities on purpose.

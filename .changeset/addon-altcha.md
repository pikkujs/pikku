---
'@pikku/addon-altcha': patch
---

New `@pikku/addon-altcha`: a self-hosted ALTCHA proof-of-work captcha. `captcha:getChallenge` issues a signed challenge that expires in five minutes, and `captcha:verifyChallenge` refuses a missing, invalid, expired or reused payload with `CAPTCHA_INVALID`, `CAPTCHA_EXPIRED` or `CAPTCHA_REUSED` (422). It ships the `captcha_used_challenge` table as a `defineTables` declaration and a `using-altcha` skill.

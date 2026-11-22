# @pikku/addon-altcha

## 0.0.1

### Patch Changes

- 3350927: New `@pikku/addon-altcha`: a self-hosted ALTCHA proof-of-work captcha. `captcha:getChallenge` issues a signed challenge that expires in five minutes, and `captcha:verifyChallenge` refuses a missing, invalid, expired or reused payload with `CAPTCHA_INVALID`, `CAPTCHA_EXPIRED` or `CAPTCHA_REUSED` (422). The optional `ALTCHA_COST` variable (default 5000, two to four seconds in a desktop browser) sets the difficulty. It ships the `captcha_used_challenge` table as a `defineTables` declaration and a `using-altcha` skill.
- cc30eba: The ALTCHA used-challenge table stores `expiry` as a `timestamptz` instead of an epoch-millisecond `integer`, which Postgres's 32-bit `integer` column cannot hold.
- Updated dependencies [6da4140]
- Updated dependencies [cbfc133]
- Updated dependencies [5bee160]
- Updated dependencies [4ea43c5]
- Updated dependencies [fa51478]
- Updated dependencies [21eb299]
- Updated dependencies [57ddb6d]
- Updated dependencies [2d788a3]
  - @pikku/core@0.12.161
  - @pikku/kysely@0.13.47

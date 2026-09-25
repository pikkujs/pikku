---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric report` no longer needs a sign-in. A finding is filed the moment something goes wrong and held on the machine, tied to the build by a run id made for the checkout. At hand-over, `pikku fabric report` with no finding lists what is held and asks: yes or no for these, or always or never, which is saved (`~/.fabric/report-consent.json`, or `PIKKU_REPORT`) so the question is not asked again. Always sends each finding as it is filed; never keeps nothing. The `--run` flag and `pikku fabric findings list|flush|clear` are gone.

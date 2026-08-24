---
'@pikku/console': patch
'@pikku/addon-console': patch
---

Let the console decide which personas keep using the application on their own. The Virtual Users screen gains a cadence section: a switch that turns a persona loose, its disposition, goals and interval, and when it is next due.

Every field is shown against what the persona currently declares and marks itself orange where the two have parted ways. A cadence is enabled once and then outlives the declaration it was written from — someone edits `personas.ts`, redeploys, and the row keeps running last month's goals with nothing anywhere to say so. The declarations are already in the meta the console loads, so the pairing is done on the client and the server is never asked for a second copy that could disagree with the first.

Reading cadences needs only a wired `virtualUserScheduleStore`; changing one dispatches the project's own scaffolded `setVirtualUserSchedule`, so the rules about undeclared and acted-upon personas are enforced in one place rather than copied here. Changing a cadence has its own scope, separate from running: starting a run spends money once with a caller present to see it, and a schedule spends it repeatedly with nobody there.

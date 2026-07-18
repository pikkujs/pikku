---
'@pikku/core': patch
---

Security: only honor the `__approvalRequired` suspension marker from framework sub-agent tools (`forwardsApproval`), so an attacker-influenced ordinary tool result can no longer forge an approval/suspension.

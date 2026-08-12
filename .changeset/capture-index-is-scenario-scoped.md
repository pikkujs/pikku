---
'@pikku/playwright': patch
---

fix(playwright): count a scenario's captures once, not once per actor

The index leading a capture's filename exists to give a directory listing the
order the run happened in. It was held on `ActorSession`, and the provider opens
one session per actor — so a scenario driving two people wrote `01` twice, and
the listing described an order that never occurred.

The scenario name and the count now live on one capture context the provider
hands to every session by reference, reset as each scenario begins. Sessions
opened by the previous scenario follow the new name rather than going on writing
under the old one.

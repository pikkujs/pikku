---
'@pikku/console': patch
---

feat(console): the selected row lives in the URL

Opening a row put the inspector's contents in React state and nowhere else, so
a selection was gone the moment you reloaded, followed a link out and came
back, or tried to send someone the thing you were looking at — `/functions` was
the only address the functions page ever had, whichever function was open.

The panel context now writes whatever is selected into the URL fragment and
reads it back. A surface with one list writes the bare id — `/functions#getUser`,
`/apis?tab=channels#events` — and one with several qualifies it, as
`/jobs?tab=triggers#triggerSource:orderPlaced`, because there an id alone would
not say which list owns it. Fragments are written with `replaceState`: the URL
always describes the selection, but scanning a list does not fill the back
stack.

Restoring is the list's job rather than the provider's, because a panel renders
from the metadata captured when it opened and only the list that fetched a row
holds it. `usePanelUrl` is what a list registers with — it names the panel type,
the rows, and how to open one — and it reopens whatever the fragment names as
soon as the rows have loaded. Registered: functions, HTTP routes, MCP
tools, gateways, schedulers, queues, triggers and their sources, middleware,
permissions, secrets, variables and credential users.

Channels are not panels but now address themselves the same way, and their row
is two levels deep, so the fragment names both: `#chat` for the channel,
`#chat/connect` for one of its handlers, `#chat/messages/send` for one action.
The open channel moves out of `?id=`, which is still read so older links keep
working. Switching tab on a tabbed surface drops the fragment, since a row in
the tab you left is not on screen in the one you arrive at.

`panelHref(type, id)` builds a link that opens a row on the page that owns its
type, so one surface can point at a row on another and land with it selected.

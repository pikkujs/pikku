---
'@pikku/core': patch
---

`readScenarioSseEvents` drains a server-sent-event response into the events it carried, joining the `data:` lines of a frame the way the spec requires. A step reading such a stream a line at a time silently drops any event whose producer wrapped it — which is what the workflow status-stream step was doing.

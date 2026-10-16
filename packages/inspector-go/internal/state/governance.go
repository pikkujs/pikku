package state

// AnalyticsDeclaration is one InspectorState.analytics entry
// (add-analytics.ts).
type AnalyticsDeclaration struct {
	File     string                   `json:"file"`
	Variable string                   `json:"variable"`
	Events   Strings                  `json:"events"`
	Props    *Record[*Record[string]] `json:"props,omitempty"`
}

// OutgoingWebhook is one InspectorState.outgoingWebhooks entry
// (add-outgoing-webhook.ts).
type OutgoingWebhook struct {
	File        string          `json:"file"`
	Variable    string          `json:"variable"`
	Event       string          `json:"event"`
	Title       string          `json:"title"`
	Description *string         `json:"description,omitempty"`
	Payload     *Record[string] `json:"payload,omitempty"`
}

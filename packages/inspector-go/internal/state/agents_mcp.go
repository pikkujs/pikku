package state

import "github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"

// Typed element structs for the mcpEndpoints, agents and scorers sections
// (add-mcp-resource.ts, add-mcp-prompt.ts, the MCP tool branch of
// add-functions.ts, add-agent.ts, add-agent-scorer.ts). Field order is the
// order each visitor's object literal assigns its keys.

// MCPResourceMeta is a mcpEndpoints.resourcesMeta entry.
type MCPResourceMeta struct {
	PikkuFuncId  string    `json:"pikkuFuncId"`
	PackageName  string    `json:"packageName,omitempty"`
	URI          string    `json:"uri"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	Summary      *string   `json:"summary,omitempty"`
	Errors       []string  `json:"errors,omitempty"`
	Streaming    *bool     `json:"streaming,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	InputSchema  *string   `json:"inputSchema"`
	OutputSchema *string   `json:"outputSchema"`
	Middleware   []WireRef `json:"middleware,omitempty"`
}

// MCPToolMeta is a mcpEndpoints.toolsMeta entry. Surface and PackageName are
// only set on tools offered from an addon (load-addon-functions-meta.ts).
type MCPToolMeta struct {
	PikkuFuncId  string    `json:"pikkuFuncId"`
	PackageName  string    `json:"packageName,omitempty"`
	Name         string    `json:"name"`
	Title        *string   `json:"title,omitempty"`
	Description  *string   `json:"description,omitempty"`
	Summary      *string   `json:"summary,omitempty"`
	Errors       []string  `json:"errors,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	InputSchema  *string   `json:"inputSchema"`
	OutputSchema *string   `json:"outputSchema"`
	Middleware   []WireRef `json:"middleware,omitempty"`
	Surface      string    `json:"surface,omitempty"`
	// FromAddon: offered from an addon, which load-addon-functions-meta.ts
	// writes with a key order of its own.
	FromAddon bool `json:"-"`
}

func (m *MCPToolMeta) MarshalJSON() ([]byte, error) {
	if m.FromAddon {
		return jsjson.Marshal(&struct {
			PikkuFuncId  string   `json:"pikkuFuncId"`
			Name         string   `json:"name"`
			Description  *string  `json:"description,omitempty"`
			InputSchema  *string  `json:"inputSchema"`
			OutputSchema *string  `json:"outputSchema"`
			Tags         []string `json:"tags,omitzero"`
			Surface      string   `json:"surface,omitempty"`
		}{m.PikkuFuncId, m.Name, m.Description, m.InputSchema, m.OutputSchema, m.Tags, m.Surface}, "")
	}
	type plain MCPToolMeta
	return jsjson.Marshal((*plain)(m), "")
}

// MCPPromptMeta is a mcpEndpoints.promptsMeta entry. Arguments is always []
// after analysis; the CLI fills it during serialization.
type MCPPromptMeta struct {
	PikkuFuncId  string    `json:"pikkuFuncId"`
	PackageName  string    `json:"packageName,omitempty"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Summary      *string   `json:"summary,omitempty"`
	Errors       []string  `json:"errors,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	InputSchema  *string   `json:"inputSchema"`
	OutputSchema *string   `json:"outputSchema"`
	Arguments    List[Raw] `json:"arguments"`
	Middleware   []WireRef `json:"middleware,omitempty"`
}

// AgentMeta is an agents.agentsMeta entry. MaxSteps, Temperature and
// ToolChoice hold whatever getPropertyValue read (a number, or the source text
// of a non-literal), so they stay raw JSON; ProviderOptions is a JSON object
// literal read verbatim.
type AgentMeta struct {
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	Role                string    `json:"role,omitempty"`
	Personality         string    `json:"personality,omitempty"`
	Goal                string    `json:"goal"`
	Model               string    `json:"model"`
	Summary             *string   `json:"summary,omitempty"`
	Errors              []string  `json:"errors,omitempty"`
	SourceFile          string    `json:"sourceFile"`
	ExportedName        string    `json:"exportedName,omitempty"`
	MaxSteps            Raw       `json:"maxSteps,omitempty"`
	Temperature         Raw       `json:"temperature,omitempty"`
	ToolChoice          Raw       `json:"toolChoice,omitempty"`
	ProviderOptions     Raw       `json:"providerOptions,omitempty"`
	Tools               []string  `json:"tools,omitempty"`
	Agents              []string  `json:"agents,omitempty"`
	Workflows           []string  `json:"workflows,omitempty"`
	Scorers             []string  `json:"scorers,omitempty"`
	Tags                []string  `json:"tags,omitempty"`
	InputSchema         *string   `json:"inputSchema"`
	OutputSchema        *string   `json:"outputSchema"`
	WorkingMemorySchema *string   `json:"workingMemorySchema"`
	Middleware          []WireRef `json:"middleware,omitempty"`
	ChannelMiddleware   []WireRef `json:"channelMiddleware,omitempty"`
	AgentMiddleware     []WireRef `json:"agentMiddleware,omitempty"`
	Permissions         []WireRef `json:"permissions,omitempty"`
}

// ScorerMeta is a scorers.scorersMeta entry. SampleRate and RequiresReference
// are raw for the same reason as AgentMeta.MaxSteps.
type ScorerMeta struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Lane              string `json:"lane"`
	SampleRate        Raw    `json:"sampleRate"`
	RequiresReference Raw    `json:"requiresReference"`
	SourceFile        string `json:"sourceFile"`
	ExportedName      string `json:"exportedName,omitempty"`
}

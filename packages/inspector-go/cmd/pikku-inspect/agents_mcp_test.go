package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// testdata/agents-mcp is self-contained (local stand-ins for the #pikku
// wrappers), so it needs no install or codegen.
func inspectAgentsMCPFixture(t *testing.T) protocol.Response {
	t.Helper()
	root, _ := filepath.Abs("../../testdata/agents-mcp")
	req := protocol.Request{
		RouteFiles: findSourceFiles(filepath.ToSlash(root), []string{"src"}),
		Options:    protocol.Options{RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json")},
	}
	in, _ := json.Marshal(req)
	var out bytes.Buffer
	if err := runInspect(bytes.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	return decodeResponse(t, out.Bytes())
}

func marshal(t *testing.T, v any) string {
	t.Helper()
	return string(jsjson.MustMarshal(v))
}

func TestAgentsAndScorers(t *testing.T) {
	res := inspectAgentsMCPFixture(t)
	st := res.State

	shop := st.Agents.AgentsMeta.At("shopAgent")
	if shop == nil {
		t.Fatalf("shopAgent missing: %v", st.Agents.AgentsMeta.Keys())
	}
	if got := marshal(t, shop.Tools); got != `["lookupItem","searchItems","external","workflow:checkout"]` {
		t.Errorf("tools = %s", got)
	}
	if got := marshal(t, shop.Workflows); got != `["reviewFlow","unnamedGraph","refFlow"]` {
		t.Errorf("workflows = %s", got)
	}
	// JS key order: integer-like keys first; `as const` unwrapped.
	if got := string(shop.ProviderOptions); got != `{"openai":{"reasoningEffort":"high","tags":["a",1,true,null],"n":-2},"x-y":{"1":"one"}}` {
		t.Errorf("providerOptions = %s", got)
	}
	if string(shop.MaxSteps) != "5" || string(shop.ToolChoice) != `"auto"` {
		t.Errorf("maxSteps=%s toolChoice=%s", shop.MaxSteps, shop.ToolChoice)
	}
	if !st.RPC.InternalFiles.Has("lookupItem") || !st.Workflows.InvokedWorkflows.Has("refFlow") {
		t.Error("tool / workflow references were not registered")
	}
	if computed := st.Agents.AgentsMeta.At("computedAgent"); computed == nil || computed.ProviderOptions != nil || string(computed.MaxSteps) != `"computed as unknown as number"` {
		t.Errorf("computedAgent = %s", marshal(t, computed))
	}
	for _, k := range []string{"noDescriptionAgent", "noNameAgent", "disabledAgent"} {
		if st.Agents.AgentsMeta.Has(k) {
			t.Errorf("%s should not be registered", k)
		}
	}

	if got := marshal(t, st.Scorers.ScorersMeta.At("namesAProduct")); !strings.Contains(got, `"lane":"fast","sampleRate":0.25,"requiresReference":true`) {
		t.Errorf("namesAProduct = %s", got)
	}
	if got := marshal(t, st.Scorers.ScorersMeta.At("answersTheShopper")); !strings.Contains(got, `"lane":"slow","sampleRate":1,"requiresReference":false`) {
		t.Errorf("answersTheShopper = %s", got)
	}
	if st.Scorers.ScorersMeta.Has("badRate") {
		t.Error("badRate has an out-of-range sampleRate and must be rejected")
	}

	want := []string{
		"AI scorer 'badRate' has a sampleRate of 1.5 — it is the fraction of live runs to grade, so it must be between 0 and 1.",
		"AI agent 'computed' has a 'providerOptions' the inspector cannot read statically",
		"AI agent 'shop-assistant' lists a scorer that is not an inline string: `scorerName`.",
		"AI agent 'computed' has invalid 'tags' property - must be an array of strings.",
	}
	assertDiagnostics(t, res, want)
}

func TestMCPEndpoints(t *testing.T) {
	res := inspectAgentsMCPFixture(t)
	mcp := res.State.MCPEndpoints

	if got := marshal(t, mcp.ToolsMeta.Keys()); got != `["undocumentedTool","echo-text"]` {
		t.Errorf("tools = %s", got)
	}
	if tool := mcp.ToolsMeta.At("echo-text"); tool == nil || tool.PikkuFuncId != "labelledTool" || *tool.OutputSchema != "MCPToolResponse" {
		t.Errorf("echo-text = %s", marshal(t, tool))
	}
	inline := mcp.ResourcesMeta.At("inline/{id}")
	if inline == nil || inline.PikkuFuncId != "mcp:resource:inline/{id}" || inline.Streaming == nil || !*inline.Streaming {
		t.Errorf("inline resource = %s", marshal(t, inline))
	}
	if fn := res.State.Functions.Meta.At("mcp:resource:inline/{id}"); fn == nil || fn.FunctionType != "inline" {
		t.Errorf("inline resource function = %s", marshal(t, fn))
	}
	if p := mcp.PromptsMeta.At("summarise"); p == nil || marshal(t, p.Arguments) != "[]" {
		t.Errorf("summarise = %s", marshal(t, p))
	}
	assertDiagnostics(t, res, []string{
		"MCP tool 'undocumentedTool' is missing a description.",
		"MCP resource 'untitled' is missing the required 'title' property.",
		"No valid 'func' property for MCP resource 'nofunc'.",
		"MCP prompt 'undescribed' is missing a description.",
	})
}

func assertDiagnostics(t *testing.T, res protocol.Response, want []string) {
	t.Helper()
	for _, w := range want {
		found := false
		for _, d := range res.Diagnostics {
			found = found || strings.HasPrefix(d.Message, w)
		}
		if !found {
			t.Errorf("missing diagnostic %q", w)
		}
	}
}

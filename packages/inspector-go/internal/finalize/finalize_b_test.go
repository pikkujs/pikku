package finalize

import (
	"strings"
	"testing"
)

func mustParse(t *testing.T, s string) any {
	t.Helper()
	v, err := Parse([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func mustMarshal(t *testing.T, v any) string {
	t.Helper()
	b, err := Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Expected outputs are @openapi-contrib/json-schema-to-openapi-schema 4.3.4's,
// called as serialize-openapi-json.ts calls it.
func TestConvertSchemaToOpenAPI(t *testing.T) {
	cases := []struct{ in, want string }{
		{
			`{"$schema":"http://json-schema.org/draft-07/schema#","type":["string","null"],"const":"x","examples":["a"]}`,
			`{"type":"string","nullable":true,"enum":["x"],"example":"a"}`,
		},
		{
			`{"type":"object","properties":{"a":{"$ref":"#/definitions/A"},"b":{"$ref":"#/definitions/A"}},"definitions":{"A":{"type":"number","exclusiveMinimum":3}},"patternProperties":{"^x":{"type":"string"}}}`,
			`{"type":"object","properties":{"a":{"type":"number","exclusiveMinimum":true,"minimum":3},"b":{"type":"number","exclusiveMinimum":true,"minimum":3}},"definitions":{"A":{"type":"number","exclusiveMinimum":true,"minimum":3}},"x-patternProperties":{"^x":{"type":"string"}},"additionalProperties":true}`,
		},
		{
			`{"type":"array","if":{"type":"string"},"then":{"minLength":1},"dependencies":{"a":["b"]},"foo":1}`,
			`{"type":"array","allOf":[{"oneOf":[{"not":{"required":["a"]}},{"required":["a","b"]}]}],"oneOf":[{"allOf":[{"type":"string"},{"minLength":1}]},{"allOf":[{"not":{"type":"string"}}]}],"items":{},"x-foo":1}`,
		},
		{
			`{"$ref":"#/definitions/R","definitions":{"R":{"type":"object","properties":{"x":{"$ref":"#/definitions/R/properties/y"},"y":{"type":"integer"}}}}}`,
			`{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}},"definitions":{"R":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}}}}}`,
		},
	}
	for _, c := range cases {
		got, err := ConvertSchemaToOpenAPI(mustParse(t, c.in))
		if err != nil {
			t.Fatal(err)
		}
		if s := mustMarshal(t, got); s != c.want {
			t.Errorf("convert(%s)\n got %s\nwant %s", c.in, s, c.want)
		}
	}
	// A recursive type dereferences into a cycle, which JSON.stringify (and
	// Marshal) then refuses, as the TypeScript spec does.
	cyclic, err := ConvertSchemaToOpenAPI(mustParse(t, `{"type":"object","properties":{"o":{"$ref":"#/definitions/O"}},"definitions":{"O":{"type":"object","properties":{"m":{"$ref":"#/definitions/O"}}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Marshal(cyclic); err == nil || !strings.Contains(err.Error(), "Converting circular structure to JSON") {
		t.Errorf("recursive schema: want a circular-structure error, got %v", err)
	}
	_, err = ConvertSchemaToOpenAPI(mustParse(t, `{"type":"wat"}`))
	if err == nil || err.Error() != `InvalidTypeError: Type "wat" is not a valid type` {
		t.Errorf("invalid type: %v", err)
	}
}

func TestParseVersionedId(t *testing.T) {
	for _, c := range []struct {
		id      string
		base    string
		version int
	}{
		{"getItem", "getItem", -1},
		{"getItem@v2", "getItem", 2},
		{"a@b@v10", "a@b", 10},
		{"getItem@vx", "getItem@vx", -1},
	} {
		base, version := parseVersionedId(c.id)
		if base != c.base || version != c.version {
			t.Errorf("parseVersionedId(%q) = %q, %d", c.id, base, version)
		}
	}
}

func TestValidateAndUpdateManifest(t *testing.T) {
	manifest := AsObject(mustParse(t, `{"manifestVersion":1,"contracts":{
		"a":{"latest":1,"versions":{"1":"old"}},
		"b":{"latest":3,"versions":{"1":{"inputHash":"i","outputHash":"o"},"2":{"inputHash":"i","outputHash":"o"}}},
		"c":{"latest":1,"versions":{"1":"c1"}},
		"d":{"latest":2,"versions":{"2":"d2"}}}}`))
	current := &Contracts{}
	current.set("a", &ContractEntry{FunctionKey: "a", Version: 1, ContractHash: "new", InputHash: "ni", OutputHash: "no"})
	current.set("b@v2", &ContractEntry{FunctionKey: "b", Version: 2, ContractHash: "h", InputHash: "i", OutputHash: "o"})
	current.set("c@v3", &ContractEntry{FunctionKey: "c", Version: 3, ContractHash: "c3", InputHash: "x", OutputHash: "y"})
	current.set("d", &ContractEntry{FunctionKey: "d", Version: 1, ContractHash: "d1", InputHash: "x", OutputHash: "y"})
	var msgs []string
	for _, e := range ValidateContracts(manifest, current) {
		msgs = append(msgs, TemplateString(e.Get("code"))+" "+TemplateString(e.Get("message")))
	}
	want := []string{
		"PKU861 Contract for a@v1 has changed (recorded: old, current: new). Existing versions are immutable.",
		"PKU864 Version 3 for c skips versions. Latest is 1, next must be 2.",
		"PKU863 Version 1 for d is <= latest (2) but not recorded. Possible merge conflict.",
		"PKU865 Manifest integrity error for b: latest field (3) inconsistent with version keys (max: 2).",
	}
	if strings.Join(msgs, "\n") != strings.Join(want, "\n") {
		t.Errorf("errors:\n%s\nwant:\n%s", strings.Join(msgs, "\n"), strings.Join(want, "\n"))
	}

	updated := mustMarshal(t, UpdateManifest(manifest, current))
	wantUpdated := `{"manifestVersion":1,"contracts":{"a":{"latest":1,"versions":{"1":{"inputHash":"ni","outputHash":"no"}}},"b":{"latest":3,"versions":{"1":{"inputHash":"i","outputHash":"o"},"2":{"inputHash":"i","outputHash":"o"}}},"c":{"latest":3,"versions":{"1":"c1","3":{"inputHash":"x","outputHash":"y"}}},"d":{"latest":2,"versions":{"1":{"inputHash":"x","outputHash":"y"},"2":"d2"}}}}`
	if updated != wantUpdated {
		t.Errorf("updateManifest:\n got %s\nwant %s", updated, wantUpdated)
	}
}

func TestDeriveWorkflowPlan(t *testing.T) {
	steps := func(s string) []*Object {
		var out []*Object
		for _, v := range mustParse(t, s).([]any) {
			out = append(out, AsObject(v))
		}
		return out
	}
	simple, _ := DeriveWorkflowPlan(steps(`[{"type":"rpc","stepName":"a","rpcName":"f"}]`))
	if !simple {
		t.Errorf("a single rpc step should be simple")
	}
	looped, _ := DeriveWorkflowPlan(steps(`[{"type":"fanout","stepName":"each","child":{"type":"rpc","stepName":"x","rpcName":"f"}}]`))
	if looped {
		t.Errorf("a fanout step should not be simple")
	}
}

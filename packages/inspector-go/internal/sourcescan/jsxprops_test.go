package sourcescan

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type jsxCase struct {
	Op     string         `json:"op"`
	Source string         `json:"source"`
	Line   int            `json:"line"`
	Col    int            `json:"col"`
	Name   string         `json:"name"`
	Value  any            `json:"value"`
	Styles [][]*string    `json:"styles"`
	Want   map[string]any `json:"want"`
}

// testdata/jsx-props/cases.json was produced by the TypeScript 6
// implementation of jsx-props.ts: every case where it read a prop, changed the
// source, or threw.
func TestJsxPropsMatchTypeScriptReference(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/jsx-props/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []jsxCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) < 300 {
		t.Fatalf("expected the full golden set, got %d cases", len(cases))
	}
	for _, c := range cases {
		var got map[string]any
		switch c.Op {
		case "read":
			props := ReadJsxProps(c.Source, c.Line, c.Col)
			byName := map[string]any{}
			for _, p := range props {
				byName[p.Name] = p.Value
			}
			got = map[string]any{"ok": any(byName)}
		case "prop":
			got = map[string]any{"ok": WriteJsxProp(c.Source, c.Line, c.Col, c.Name, c.Value)}
		case "style":
			styles := []StyleEntry{}
			for _, pair := range c.Styles {
				styles = append(styles, StyleEntry{Prop: *pair[0], Value: pair[1]})
			}
			out, err := WriteJsxStyle(c.Source, c.Line, c.Col, styles)
			if err != nil {
				got = map[string]any{"err": err.Error()}
			} else {
				got = map[string]any{"ok": out}
			}
		}
		if !reflect.DeepEqual(got, c.Want) {
			t.Errorf("%s %q at %d:%d %s %v: got %v, want %v", c.Op, c.Source, c.Line, c.Col, c.Name, c.Styles, got, c.Want)
		}
	}
}

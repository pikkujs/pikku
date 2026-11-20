package schemas

import (
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestFindSchemaHoles(t *testing.T) {
	for name, tc := range map[string]struct {
		schema string
		want   []Hole
	}{
		"empty and never nodes by path": {
			`{"type":"object","properties":{"filter":{},"tags":{"type":"array","items":{"not":{}}},"name":{"type":"string"}}}`,
			[]Hole{{".filter", "unknown"}, {".tags[]", "never"}},
		},
		"follows a $ref and stops on a recursive one": {
			`{"type":"object","properties":{"tree":{"$ref":"#/definitions/Tree"}},"definitions":{"Tree":{"anyOf":[{"type":"array","items":{"$ref":"#/definitions/Tree"}},{"type":"object","additionalProperties":{}}]}}}`,
			[]Hole{{".tree[*]", "unknown"}},
		},
		"follows a $defs ref and reads prefixItems": {
			`{"type":"object","properties":{"a":{"$ref":"#/$defs/Loose"},"pair":{"type":"array","prefixItems":[{"type":"string"},{}]}},"$defs":{"Loose":{"type":"object","properties":{"x":{}}}}}`,
			[]Hole{{".a.x", "unknown"}, {".pair[]", "unknown"}},
		},
		"no holes":     {`{"type":"object","properties":{"a":{"type":"string"}}}`, nil},
		"root unknown": {`{}`, []Hole{{"$", "unknown"}}},
	} {
		t.Run(name, func(t *testing.T) {
			if got := FindSchemaHoles(state.Raw(tc.schema)); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCheckGeneratedHonoursDeclaredUnknowns(t *testing.T) {
	st := state.New("/p")
	tm := st.Functions.TypesMap
	tm.AddCustomType("FnOutput", "x", nil)
	st.Functions.Meta.Set("fn", &state.FunctionMeta{PikkuFuncId: "fn", Outputs: []string{"FnOutput"}})
	st.Schemas.Set("FnOutput", state.Raw(`{"type":"object","properties":{"free":{},"gone":{"not":{}}}}`))
	log := &diag.Logger{}
	CheckGenerated(log, st, map[string]map[string]bool{"FnOutput": {".free": true, ".gone": true}})
	entries := log.Entries()
	if len(entries) != 1 || entries[0].Code != diag.GeneratedSchemaHasUnknown || entries[0].Level != diag.Error {
		t.Fatalf("got %+v, want one PKU492 error for the never hole", entries)
	}
	want := "'fn' output schema 'FnOutput' admits nothing (never) at '.gone'"
	if got := entries[0].Message; len(got) < len(want) || got[:len(want)] != want {
		t.Errorf("message = %q", got)
	}
}

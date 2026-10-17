package schemas

import (
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestSchemaNames(t *testing.T) {
	st := state.New("/root")
	tm := st.Functions.TypesMap
	tm.AddCustomType("ZodInput", "{ a: string }", nil)
	tm.AddCustomType("Inline", "{ b: number }", nil)
	tm.AddType("User", "/root/user.ts")
	// Two declarations named Item: getUniqueName keeps the unique alias.
	itemA := tm.AddUniqueType("Item", "/root/a.ts")
	tm.AddUniqueType("Item", "/root/b.ts")

	st.Functions.Meta.Set("f2", &state.FunctionMeta{Inputs: []string{"User", "string"}, Outputs: []string{itemA}})
	st.Functions.Meta.Set("f1", &state.FunctionMeta{Inputs: []string{"Inline", "NotInTypesMap"}, Outputs: []string{"User"}})
	st.Functions.Meta.Set("10", &state.FunctionMeta{Outputs: []string{"void"}})
	st.Functions.Meta.Set("nil", nil)
	// Route input types never reach the set (see SchemaNames).
	st.HTTP.MetaInputTypes.Set("f1", state.MetaInputTypes{Body: []string{"bodyKey"}})

	got := SchemaNames(st, []string{"Extra", "User"})
	// "10" is an array index, so Object.values visits it first.
	want := []string{"ZodInput", "Inline", "void", "User", "string", itemA, "Extra"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got  %v\nwant %v", got, want)
	}
}

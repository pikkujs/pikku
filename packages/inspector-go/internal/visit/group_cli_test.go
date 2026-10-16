package visit

import (
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestParseCommandPattern(t *testing.T) {
	got, err := parseCommandPattern("<env>  [region] <files...> [rest...]")
	if err != nil {
		t.Fatal(err)
	}
	want := []cliPositional{
		{Name: "env", Required: true},
		{Name: "region"},
		{Name: "files", Required: true, Variadic: true},
		{Name: "rest", Variadic: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v", got)
	}
	if got, err := parseCommandPattern(""); err != nil || len(got) != 0 {
		t.Fatalf("empty pattern: %v %v", got, err)
	}
	_, err = parseCommandPattern("deploy <env>")
	wantErr := "Invalid parameters pattern 'deploy <env>': found literal word 'deploy'. " +
		"Parameters should only contain <required> or [optional] arguments. " +
		"Example: \"<env> [region]\" or \"<files...>\""
	if err == nil || err.Error() != wantErr {
		t.Fatalf("err = %v", err)
	}
}

func TestCLIPositionalJSON(t *testing.T) {
	got := string(state.RawOf([]cliPositional{{Name: "a", Required: true}, {Name: "b", Variadic: true}}))
	want := `[{"name":"a","required":true},{"name":"b","required":false,"variadic":true}]`
	if got != want {
		t.Fatalf("got %s", got)
	}
}

func TestMakeContextBasedId(t *testing.T) {
	if got := makeContextBasedId("cli", "prog", "a", "b"); got != "cli:prog:a:b" {
		t.Fatal(got)
	}
	if !isTempId("__temp_abc") || isTempId("foo") {
		t.Fatal("isTempId")
	}
}

func TestRewriteFuncIdRaw(t *testing.T) {
	in := state.Raw(`{"pikkuFuncId":"old","x":1}`)
	if got := string(rewriteFuncIdRaw(in, "old", "new")); got != `{"pikkuFuncId":"new","x":1}` {
		t.Fatal(got)
	}
	if got := string(rewriteFuncIdRaw(in, "other", "new")); got != string(in) {
		t.Fatal(got)
	}
	if got := string(rewriteFuncIdRaw(state.Raw(`null`), "old", "new")); got != "null" {
		t.Fatal(got)
	}
}

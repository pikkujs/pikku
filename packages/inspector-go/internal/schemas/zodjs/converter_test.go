package zodjs

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// fixture is testdata/project, whose zod resolves from the repository's
// node_modules. The Go CI job does not install them, so the tests that
// convert skip there and run in the parity job, which does.
func fixture(t *testing.T) string {
	t.Helper()
	dir, err := filepath.Abs("testdata/project")
	if err != nil {
		t.Fatal(err)
	}
	for d := dir; ; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, "node_modules", "zod", "package.json")); err == nil {
			return dir
		}
		if filepath.Dir(d) == d {
			t.Skip("zod is not installed (bun install)")
		}
	}
}

func ref(dir, name, file, variable string) schemas.VendorRef {
	return schemas.VendorRef{Name: name, SchemaRef: state.SchemaRef{
		VariableName: variable, SourceFile: filepath.Join(dir, file), Vendor: "zod",
	}}
}

func converter(dir string, fallback schemas.VendorSchemaConverter) Converter {
	return Converter{Dir: dir, Tsconfig: filepath.Join(dir, "tsconfig.json"), Fallback: fallback}
}

// recording stands in for the Node converter: it converts every schema it is
// given to {} and remembers which it was given.
type recording struct{ got []string }

func (r *recording) Convert(_ context.Context, refs []schemas.VendorRef) (schemas.VendorResult, error) {
	var res schemas.VendorResult
	for _, ref := range refs {
		r.got = append(r.got, ref.Name)
		res.Schemas = append(res.Schemas, schemas.VendorSchema{Name: ref.Name, Schema: state.Raw(`{}`), TypeText: "node"})
	}
	return res, nil
}

func names(res schemas.VendorResult) []string {
	var out []string
	for _, s := range res.Schemas {
		out = append(out, s.Name)
	}
	return out
}

func TestConvertsAsVendorSchemasDoes(t *testing.T) {
	dir := fixture(t)
	res, err := converter(dir, nil).Convert(context.Background(), []schemas.VendorRef{ref(dir, "OrderInput", "plain.ts", "Order")})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) > 0 {
		t.Fatal(res.Errors)
	}
	var got any
	if err := json.Unmarshal(res.Schemas[0].Schema, &got); err != nil {
		t.Fatal(err)
	}
	var want any
	_ = json.Unmarshal([]byte(`{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type": "object",
		"properties": {
			"id": {"type": "string", "maxLength": 36},
			"placedAt": {"type": "string", "format": "date-time"},
			"quantity": {"type": "integer", "minimum": -9007199254740991, "maximum": 9007199254740991, "default": 1},
			"status": {"type": "string", "enum": ["open", "closed"]}
		},
		"required": ["id", "placedAt", "status"],
		"additionalProperties": false
	}`), &want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("schema:\n%s", res.Schemas[0].Schema)
	}
	if !strings.Contains(res.Schemas[0].TypeText, "placedAt: Date") {
		t.Errorf("typeText:\n%s", res.Schemas[0].TypeText)
	}
}

func TestRefusesSchemasBuiltFromAStubbedPackage(t *testing.T) {
	dir := fixture(t)
	refs := []schemas.VendorRef{
		ref(dir, "CurrencyField", "from-package.ts", "CurrencyField"),
		ref(dir, "Amount", "from-package.ts", "Amount"),
		ref(dir, "Address", "from-package.ts", "Address"),
		ref(dir, "Described", "from-package.ts", "Described"),
		ref(dir, "Note", "from-package.ts", "Note"),
	}
	res, err := converter(dir, nil).Convert(context.Background(), refs)
	if err != nil {
		t.Fatal(err)
	}
	if got := names(res); !reflect.DeepEqual(got, []string{"Note"}) {
		t.Errorf("converted %v, want only Note", got)
	}
	if len(res.Errors) != 4 {
		t.Fatalf("errors: %v", res.Errors)
	}
	for _, msg := range res.Errors {
		if !strings.Contains(msg, "without Node") || !strings.Contains(msg, "'some-shared-schemas'") {
			t.Errorf("error does not say why: %s", msg)
		}
	}
}

func TestRefusesAModuleThatTurnsAStubIntoAString(t *testing.T) {
	dir := fixture(t)
	res, err := converter(dir, nil).Convert(context.Background(), []schemas.VendorRef{
		ref(dir, "Row", "loads-badly.ts", "Row"),
		// z.enum reads each value as a string, so an enum of a package's
		// values fails while the module loads rather than coming out empty.
		ref(dir, "CurrencyCode", "enum-from-package.ts", "CurrencyCode"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Schemas) != 0 || len(res.Errors) != 2 ||
		!strings.Contains(res.Errors[0], "'some-config'") || !strings.Contains(res.Errors[1], "'some-shared-schemas'") {
		t.Fatalf("schemas %v, errors %v", names(res), res.Errors)
	}
}

func TestHandsRefusedSchemasToNodeInLookupOrder(t *testing.T) {
	dir := fixture(t)
	node := &recording{}
	refs := []schemas.VendorRef{
		ref(dir, "Amount", "from-package.ts", "Amount"),
		ref(dir, "OrderInput", "plain.ts", "Order"),
		ref(dir, "Row", "loads-badly.ts", "Row"),
		ref(dir, "Note", "from-package.ts", "Note"),
	}
	res, err := converter(dir, node).Convert(context.Background(), refs)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) > 0 {
		t.Fatal(res.Errors)
	}
	if !reflect.DeepEqual(node.got, []string{"Amount", "Row"}) {
		t.Errorf("Node was given %v, want [Amount Row]", node.got)
	}
	if got := names(res); !reflect.DeepEqual(got, []string{"Amount", "OrderInput", "Row", "Note"}) {
		t.Errorf("schemas in %v, want lookup order", got)
	}
}

func TestReportsWhatNodeWouldReport(t *testing.T) {
	dir := fixture(t)
	res, err := converter(dir, nil).Convert(context.Background(), []schemas.VendorRef{
		ref(dir, "Trimmed", "transform.ts", "Trimmed"),
		ref(dir, "Missing", "plain.ts", "Missing"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) != 2 ||
		!strings.Contains(res.Errors[0], "[PKU491] 'Trimmed' contains a .transform()") ||
		!strings.Contains(res.Errors[1], "Could not find exported schema 'Missing'") {
		t.Fatalf("errors: %q", res.Errors)
	}
}

func TestFallsBackWholeWhenTheModulesDoNotBundle(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "broken.ts"), []byte("export const X = ("), 0o644); err != nil {
		t.Fatal(err)
	}
	refs := []schemas.VendorRef{ref(dir, "X", "broken.ts", "X")}

	node := &recording{}
	if _, err := converter(dir, node).Convert(context.Background(), refs); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(node.got, []string{"X"}) {
		t.Errorf("Node was given %v", node.got)
	}

	_, err := converter(dir, nil).Convert(context.Background(), refs)
	if err == nil || !strings.Contains(err.Error(), "broken.ts") {
		t.Errorf("err = %v, want one naming broken.ts", err)
	}
}

func TestHelpersAreCurrent(t *testing.T) {
	want, err := BundleHelpers(".")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal([]byte(helpersJS), want) {
		t.Fatal("helpers.gen.js is older than @pikku/inspector's zod-to-type-text.ts / find-zod-transform.ts: run `go generate ./internal/schemas/zodjs`")
	}
}

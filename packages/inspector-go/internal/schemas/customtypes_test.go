package schemas

import (
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// The expected source is generateCustomTypes' output for the same typesMap,
// from packages/inspector/dist/utils/custom-types-generator.js.
func TestGenerateCustomTypesMatchesTS(t *testing.T) {
	tm := typesmap.New()
	tm.AddType("User", "/p/user.ts")
	tm.AddType("Order", "/p/order.ts")
	tm.AddType("Item", "/p/user.ts")
	tm.AddCustomType("b-input", "{ user: User; secret: Secret<string>; o: Pii<Array<Order>>; f: (x: number) => Item }", []string{"User", "__object", "__object_1", "Secret"})
	tm.AddCustomType("alpha", `Pick<User, "id">`, nil)
	tm.AddCustomType("Beta", `string | "Order"`, nil)
	tm.AddCustomType("Same", "Same", []string{"Order"})
	tm.AddCustomType("GenericThing", "Record<Key, In[number]>", []string{"Item"})
	tm.AddCustomType("9lives", "Private<{ a: Unknown }>", nil)

	got, required := GenerateCustomTypes(tm)
	want := "import type { User, Item } from '/p/user.ts'\n" +
		"import type { Order } from '/p/order.ts'\n" +
		"\n" +
		"export type _9lives = { a: Unknown }\n" +
		"export type alpha = Pick<User, \"id\">\n" +
		"export type b_input = { user: User; secret: string; o: Array<Order>; f: (x: number) => Item }\n" +
		"export type Beta = string | \"Order\""
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
	if want := []string{"User", "Order", "Item"}; !reflect.DeepEqual(required, want) {
		t.Errorf("required types %v, want %v", required, want)
	}
}

func TestGenerateCustomTypesEmpty(t *testing.T) {
	if got, _ := GenerateCustomTypes(typesmap.New()); got != "\n\n" {
		t.Errorf("got %q", got)
	}
}

func TestStripClassificationWrappers(t *testing.T) {
	for in, want := range map[string]string{
		"Secret<string>":                        "string",
		"Private<Pii<{ a: Map<string, X> }>>":   "{ a: Map<string, X> }",
		"{ f: () => Secret<string> }":           "{ f: () => string }",
		"SecretThing<string>":                   "SecretThing<string>",
		"Secret":                                "Secret",
		"Pii<unclosed":                          "Pii<unclosed",
		"{ é: Private<number>; $x: Secret<1> }": "{ é: number; $x: 1 }",
	} {
		if got := stripClassificationWrappers(in); got != want {
			t.Errorf("stripClassificationWrappers(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSanitizeTypeName(t *testing.T) {
	for in, want := range map[string]string{
		"a-b.c": "a_b_c",
		"1abc":  "_1abc",
		"$ok_1": "$ok_1",
		"naïve": "na_ve",
		"😀":     "__",
	} {
		if got := SanitizeTypeName(in); got != want {
			t.Errorf("SanitizeTypeName(%q) = %q, want %q", in, got, want)
		}
	}
}

// Expected order is Node's ["..."].sort((a, b) => a.localeCompare(b)).
func TestLocaleSortMatchesNode(t *testing.T) {
	names := []string{"b", "B", "a_b", "a-b", "aB", "Ab", "_x", "$y", "9z", "é", "e", "Z", "GetUserInput", "getUser", "Get_user", "GetUser2", "GetUser10"}
	localeSort(names)
	want := []string{"_x", "$y", "9z", "a_b", "a-b", "aB", "Ab", "b", "B", "e", "é", "Get_user", "getUser", "GetUser10", "GetUser2", "GetUserInput", "Z"}
	if !reflect.DeepEqual(names, want) {
		t.Errorf("got %q\nwant %q", names, want)
	}
}

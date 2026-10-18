package analyze

import (
	"path/filepath"
	"reflect"
	"regexp"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The cases of packages/inspector/src/add/add-global-permission.test.ts.

type registration struct {
	exportName    any
	definitionIds []string
}

func registrations(res *protocol.Response) []registration {
	out := []registration{}
	for _, g := range res.State.Permissions.Global {
		var name any
		if g.ExportName != nil {
			name = *g.ExportName
		}
		out = append(out, registration{name, append([]string{}, g.DefinitionIds...)})
	}
	return out
}

func warnings(res *protocol.Response) []string {
	var out []string
	for _, d := range res.Diagnostics {
		if d.Level == diag.Warn {
			out = append(out, d.Message)
		}
	}
	return out
}

func TestGlobalPermissionTopLevelRegistration(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"security.ts": {
		"import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
		"addGlobalPermission([",
		"  pikkuPermission(async ({ kysely }, _data, { session }) => !!session && !!kysely),",
		"])",
	}}, false)
	global := res.State.Permissions.Global
	if len(global) != 1 {
		t.Fatalf("global = %d registrations, want 1", len(global))
	}
	g := global[0]
	if filepath.Base(g.SourceFile) != "security.ts" || g.ExportName != nil || len(g.DefinitionIds) != 1 {
		t.Fatalf("registration = %+v", g)
	}
	def := res.State.Permissions.Definitions.At(g.DefinitionIds[0])
	if def == nil || !reflect.DeepEqual(def.Services.Services, []string{"kysely"}) {
		t.Fatalf("definition %q = %+v", g.DefinitionIds[0], def)
	}
	for _, d := range res.Diagnostics {
		if d.Level != diag.Debug {
			t.Errorf("an inline permission in the global array is not an unassigned one: %s", d.Message)
		}
	}
}

func TestGlobalPermissionFactoryAndReferences(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"security.ts": {
		"import { addGlobalPermission as everywhere, pikkuAuth } from '#pikku/auth'",
		"export const signedIn = pikkuAuth(async (_s, session) => !!session)",
		"export const globalGate = () => everywhere([signedIn])",
	}}, false)
	if got, want := registrations(res), []registration{{"globalGate", []string{"signedIn"}}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("registrations = %v, want %v", got, want)
	}
}

var globalPermissionHeader = []string{
	"import { addGlobalPermission, pikkuAuth } from '#pikku/auth'",
	"export const signedIn = pikkuAuth(async (_s, session) => !!session)",
}

func TestGlobalPermissionFactoryShapes(t *testing.T) {
	cases := []struct {
		label string
		lines []string
		want  any
	}{
		{"a block-bodied exported arrow", []string{"export const globalGate = () => {", "  addGlobalPermission([signedIn])", "}"}, "globalGate"},
		{"an exported function declaration", []string{"export function globalGate() {", "  addGlobalPermission([signedIn])", "}"}, "globalGate"},
		{"a function exported through an export list", []string{"function globalGate() {", "  addGlobalPermission([signedIn])", "}", "export { globalGate }"}, "globalGate"},
		{"a function invoked where it is written", []string{";(() => {", "  addGlobalPermission([signedIn])", "})()"}, nil},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			res := inspectFiles(t, map[string][]string{"security.ts": append(append([]string{}, globalPermissionHeader...), c.lines...)}, false)
			if got, want := registrations(res), []registration{{c.want, []string{"signedIn"}}}; !reflect.DeepEqual(got, want) {
				t.Fatalf("registrations = %v, want %v", got, want)
			}
			if w := warnings(res); len(w) != 0 {
				t.Fatalf("warnings = %v", w)
			}
		})
	}
}

func TestGlobalPermissionUnreachable(t *testing.T) {
	cases := map[string][]string{
		"a function that is not exported":             {"function gate() {", "  addGlobalPermission([signedIn])", "}"},
		"an exported function that takes a parameter": {"export const gate = (flag: boolean) => {", "  if (flag) addGlobalPermission([signedIn])", "}"},
		"a default export":                            {"export default function () {", "  addGlobalPermission([signedIn])", "}"},
	}
	for label, lines := range cases {
		t.Run(label, func(t *testing.T) {
			res := inspectFiles(t, map[string][]string{"security.ts": append(append([]string{}, globalPermissionHeader...), lines...)}, false)
			if got := registrations(res); len(got) != 0 {
				t.Fatalf("registrations = %v, want none", got)
			}
			w := warnings(res)
			if len(w) != 1 || !regexp.MustCompile(`NOT registered`).MatchString(w[0]) {
				t.Fatalf("warnings = %v", w)
			}
		})
	}
}

func TestGlobalPermissionArgumentInAVariable(t *testing.T) {
	cases := map[string]map[string][]string{
		"a const array": {"security.ts": {
			"import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
			"export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
			"const gates = [audited] as const",
			"addGlobalPermission(gates)",
		}},
		"a const object imported from another file": {
			"gates.ts": {
				"import { pikkuPermission } from '#pikku/auth'",
				"export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
				"export const gates = { audited }",
			},
			"security.ts": {
				"import { addGlobalPermission } from '#pikku/auth'",
				"import { gates } from './gates'",
				"addGlobalPermission(gates)",
			},
		},
	}
	for label, files := range cases {
		t.Run(label, func(t *testing.T) {
			res := inspectFiles(t, files, false)
			if got, want := registrations(res), []registration{{nil, []string{"audited"}}}; !reflect.DeepEqual(got, want) {
				t.Fatalf("registrations = %v, want %v", got, want)
			}
			if w := warnings(res); len(w) != 0 {
				t.Fatalf("a variable that resolves to a literal needs no warning: %v", w)
			}
		})
	}
}

func TestGlobalPermissionArgumentItCannotFollow(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"security.ts": {
		"import { addGlobalPermission } from '#pikku/auth'",
		"declare const build: () => never[]",
		"addGlobalPermission(build())",
	}}, false)
	w := warnings(res)
	if len(w) != 1 || !regexp.MustCompile(`cannot be seen`).MatchString(w[0]) {
		t.Fatalf("warnings = %v", w)
	}
}

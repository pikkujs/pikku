package finalize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The cases the TypeScript inspector tested before it was retired.

const permissionHeader = "import { addGlobalPermission, pikkuAuth, pikkuPermission, pikkuPermissionFactory } from '#pikku/auth'\n" +
	"declare const check: (value: unknown) => boolean\n" +
	"declare const other: { data: string }\n"

func permissionDataUnused(t *testing.T, source string, strictMeta bool) []diag.Diagnostic {
	t.Helper()
	root := t.TempDir()
	file := filepath.Join(root, "security.ts")
	if err := os.WriteFile(file, []byte(permissionHeader+source), 0o644); err != nil {
		t.Fatal(err)
	}
	options := protocol.Options{RootDir: root, StrictMeta: strictMeta}
	res, err := analyze.Run(protocol.Request{RouteFiles: []string{file}, Options: options}, nil)
	if err != nil {
		t.Fatal(err)
	}
	log := &diag.Logger{}
	validatePermissionDataUsed(log, res.State, options)
	var out []diag.Diagnostic
	for _, d := range log.Entries() {
		if d.Code == diag.PermissionDataUnused {
			out = append(out, d)
		}
	}
	return out
}

func TestPermissionDataUnusedFlags(t *testing.T) {
	cases := map[string]string{
		"no data parameter":                     `export const gate = pikkuPermission(async ({ logger }) => !!logger)`,
		"an underscore-prefixed data parameter": `export const gate = pikkuPermission(async (_s, _data, { session }) => !!session)`,
		"a bare underscore":                     `export const gate = pikkuPermission(async (_s, _, { session }) => !!session)`,
		"a named data parameter never read":     `export const gate = pikkuPermission(async (_s, data, { session }) => !!session)`,
		"only a property called data":           `export const gate = pikkuPermission(async (_s, data, { session }) => other.data === session?.userId)`,
		"only an object key called data":        `export const gate = pikkuPermission(async (_s, data) => check({ data: 1 }))`,
		"only a destructured key called data":   `export const gate = pikkuPermission(async (_s, data) => { const { data: inner } = other; return check(inner) })`,
		"the object form":                       `export const gate = pikkuPermission({ name: "Gate", func: async (_s, _data, { session }) => !!session })`,
		"a function expression":                 `export const gate = pikkuPermission(async function (_s, data) { return true })`,
		"written inline in addGlobalPermission": `addGlobalPermission([pikkuPermission(async (_s, _data, { session }) => !!session)])`,
	}
	for label, source := range cases {
		t.Run(label, func(t *testing.T) {
			if found := permissionDataUnused(t, source, false); len(found) != 1 {
				t.Fatalf("found = %+v, want one", found)
			}
		})
	}
}

func TestPermissionDataUnusedDoesNotFlag(t *testing.T) {
	cases := map[string]string{
		"data is read":                                `export const gate = pikkuPermission(async (_s, data: { id: string }, { session }) => data.id === session?.userId)`,
		"data is passed whole to another call":        `export const gate = pikkuPermission(async (_s, data) => check(data))`,
		"data is used as a shorthand property":        `export const gate = pikkuPermission(async (_s, data) => check({ data }))`,
		"data is read by a later parameter's default": `export const gate = pikkuPermission(async (_s, data: any, _w = check(data)) => _w)`,
		"data is destructured":                        `export const gate = pikkuPermission(async (_s, { id }: { id: string }) => check(id))`,
		"data is an empty pattern":                    `export const gate = pikkuPermission(async (_s, {}: object) => true)`,
		"data is in a rest parameter":                 `export const gate = pikkuPermission(async (_s, ...rest: any[]) => check(rest))`,
		"every parameter is in a rest parameter":      `export const gate = pikkuPermission(async (...args: any[]) => check(args))`,
		"an inner name shadows data":                  `export const gate = pikkuPermission(async (_s, data) => [1].some((data) => check(data)))`,
		"the body reads arguments":                    `export const gate = pikkuPermission(async function (_s) { return check(arguments[1]) })`,
		"the object form reads data":                  `export const gate = pikkuPermission({ func: async (_s, data) => check(data) })`,
		"func is a passed-in identifier":              "const handler = async (_s: any, _data: any) => true\nexport const gate = pikkuPermission({ func: handler })",
		"func is shorthand for an identifier":         "const func = async (_s: any, _data: any) => true\nexport const gate = pikkuPermission({ func })",
		"the handler is a passed-in identifier":       "const handler = async (_s: any, _data: any) => true\nexport const gate = pikkuPermission(handler)",
		"it reads a wire pikkuAuth is not given":      `export const gate = pikkuPermission(async (_s, _data, { functionId }) => functionId !== "x")`,
		"it reads the session and another wire":       `export const gate = pikkuPermission(async (_s, _data, { session, functionId }) => !!session && !!functionId)`,
		"the wire parameter is not destructured":      `export const gate = pikkuPermission(async (_s, _data, wire) => !!wire.functionId)`,
		"it is already a pikkuAuth":                   `export const gate = pikkuAuth(async (_s, session) => !!session)`,
		"it is the permission of a factory":           `export const gate = pikkuPermissionFactory(({ role }: { role: string }) => pikkuPermission(async (_s, _data, { session }) => session?.role === role))`,
	}
	for label, source := range cases {
		t.Run(label, func(t *testing.T) {
			if found := permissionDataUnused(t, source, false); len(found) != 0 {
				t.Fatalf("found = %+v, want none", found)
			}
		})
	}
}

func TestPermissionDataUnusedSeverity(t *testing.T) {
	source := `export const gate = pikkuPermission(async ({ logger }) => !!logger)`
	warn := permissionDataUnused(t, source, false)
	if len(warn) != 1 || warn[0].Level != diag.Warn {
		t.Fatalf("non-strict = %+v, want one warning", warn)
	}
	if !strings.HasPrefix(warn[0].Message, "Permission 'gate' in security.ts ") || !strings.Contains(warn[0].Message, "Use pikkuAuth") {
		t.Fatalf("message = %q", warn[0].Message)
	}
	critical := permissionDataUnused(t, source, true)
	if len(critical) != 1 || critical[0].Level != diag.Critical {
		t.Fatalf("strict = %+v, want one critical", critical)
	}
}

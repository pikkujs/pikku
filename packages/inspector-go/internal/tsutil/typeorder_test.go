package tsutil_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// The declarations are checked top to bottom, so each literal type is created
// at its first mention in this file: that is the order Strada prints in.
const orderSource = `
export const priorities = ['low', 'medium', 'high'] as const
export const priority = priorities[0] as (typeof priorities)[number]

export declare const mixed: 'zeta' | 7 | boolean | 'alpha'

export type Row = { id: string; name: string; email: string; role: string }
export declare const selected: { [K in 'role' | 'name' | 'email']: Row[K] }
export declare const partial: { [K in keyof Row]?: Row[K] }
export declare const nested: { rows: Array<{ [K in 'role' | 'id']: Row[K] }> }

export function charge(ok: boolean) {
  if (ok) return { status: 'succeeded' as const, providerRef: 'p' }
  return { status: 'failed' as const, reason: 'r' }
}
export const charged = charge(true)

export declare const promised: Promise<void> | Promise<any>
`

func checkOrderSource(t *testing.T) (*checker.Checker, map[string]*checker.Type) {
	t.Helper()
	dir := t.TempDir()
	file := filepath.Join(dir, "order.ts")
	if err := os.WriteFile(file, []byte(orderSource), 0o644); err != nil {
		t.Fatal(err)
	}
	p, err := program.Create(program.Options{RouteFiles: []string{file}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Release)
	types := map[string]*checker.Type{}
	for _, sf := range p.ProjectFiles {
		for _, stmt := range sf.Statements.Nodes {
			if stmt.Kind != ast.KindVariableStatement {
				continue
			}
			for _, decl := range stmt.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				name := decl.Name()
				types[name.Text()] = p.Checker.GetTypeAtLocation(name)
			}
		}
	}
	return p.Checker, types
}

func TestTypeToStringOrder(t *testing.T) {
	c, types := checkOrderSource(t)
	print := func(name string) string {
		return tsutil.TypeToString(c, types[name], checker.TypeFormatFlagsNoTruncation)
	}
	cases := []struct {
		name, want, tsgo string
	}{
		{
			name: "priority",
			want: `"low" | "medium" | "high"`,
			tsgo: `"high" | "low" | "medium"`,
		},
		{
			// boolean was created with the checker, so it leads.
			name: "mixed",
			want: `boolean | "zeta" | 7 | "alpha"`,
		},
		{
			name: "selected",
			want: `{ role: string; name: string; email: string; }`,
			tsgo: `{ email: string; name: string; role: string; }`,
		},
		{
			// Homomorphic: Row's declaration order, whatever the key literals' ids.
			name: "partial",
			want: `{ id?: string | undefined; name?: string | undefined; email?: string | undefined; role?: string | undefined; }`,
		},
		{
			name: "nested",
			want: `{ rows: { role: string; id: string; }[]; }`,
		},
		{
			// Each literal keeps its own properties first and gains the other's
			// as `?: undefined` after them.
			name: "charged",
			want: `{ status: "succeeded"; providerRef: string; reason?: undefined; } | { status: "failed"; reason: string; providerRef?: undefined; }`,
		},
		{
			// Members that are not literals are matched to their types too.
			name: "promised",
			want: `Promise<void> | Promise<any>`,
			tsgo: `Promise<any> | Promise<void>`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := print(tc.name); got != tc.want {
				t.Errorf("TypeToString = %s\nwant           %s", got, tc.want)
			}
			if tc.tsgo != "" {
				if got := c.TypeToStringEx(types[tc.name], nil, checker.TypeFormatFlagsNoTruncation, nil); got != tc.tsgo {
					t.Errorf("typescript-go itself now prints %s; the case no longer tests the reordering", got)
				}
			}
		})
	}
}

func TestUnionTypesInIdOrder(t *testing.T) {
	c, types := checkOrderSource(t)
	var got []string
	for _, m := range tsutil.UnionTypesInIdOrder(types["priority"]) {
		got = append(got, c.TypeToString(m))
	}
	want := []string{`"low"`, `"medium"`, `"high"`}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

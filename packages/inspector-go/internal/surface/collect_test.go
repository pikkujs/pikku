package surface

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const fixtureIndex = `/** Counts things. */
export const counter = (start: number): number => start + 1

/**
 * Greets someone.
 *
 * More words here.
 * @example
 * greet({ name: 'Ada' })
 */
export function greet(options: {
  /** Who to greet. */
  name: string
  loud?: boolean
}): string {
  return options.name
}

/** @deprecated use greet */
export type Mode = 'quiet' | 'loud'
`

// The TypeScript collectSurface's output for the fixture, with declaredIn
// reduced to the fixture-relative path. greet comes first: Strada binds a
// file's function declarations before its other statements.
const fixtureWant = `[{"subpath":".","specifier":"fixture","entryFile":"src/index.ts","symbols":[` +
	`{"name":"greet","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,` +
	`"summary":"Greets someone.","docs":"Greets someone.\n\nMore words here.",` +
	`"signature":"(options: { name: string; loud?: boolean; }) => string","examples":["greet({ name: 'Ada' })"]},` +
	`{"name":"counter","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,` +
	`"summary":"Counts things.","docs":"Counts things.","signature":"(start: number) => number"},` +
	`{"name":"Mode","kind":"type","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":true,"deprecatedReason":"use greet"}]}]`

func writeFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"package.json":  `{ "name": "fixture", "type": "module", "exports": { ".": "./src/index.ts" } }`,
		"tsconfig.json": `{ "compilerOptions": { "strict": true, "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist" } }`,
		"src/index.ts":  fixtureIndex,
	}
	for name, content := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestCollectFixture(t *testing.T) {
	dir := writeFixture(t)
	entrypoints, err := Collect(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entrypoints {
		for i := range e.Symbols {
			if in := e.Symbols[i].DeclaredIn; in != nil {
				rel := filepath.ToSlash((*in)[strings.LastIndex(*in, "/src/")+1:])
				e.Symbols[i].DeclaredIn = &rel
			}
		}
	}
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(entrypoints); err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(b.String()); got != fixtureWant {
		t.Fatalf("got  %s\nwant %s", got, fixtureWant)
	}
}

func TestUnknownSnippet(t *testing.T) {
	dir := writeFixture(t)
	index := filepath.Join(dir, "src/index.ts")
	if err := os.WriteFile(index, []byte("/** @example snippet: nope */\nexport const x = 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Collect(dir, Options{Snippets: []Snippet{{Name: "other", Code: "1"}}})
	if _, ok := err.(*UnknownSnippetError); !ok {
		t.Fatalf("want UnknownSnippetError, got %v", err)
	}
}

func TestDoubleQuoteLiterals(t *testing.T) {
	cases := map[string]string{
		`Omit<A, 'secrets'>`: `Omit<A, "secrets">`,
		`{ 'a-b': 'x' }`:     `{ 'a-b': "x" }`,
		`'it\'s' | "ok"`:     `"it's" | "ok"`,
	}
	for in, want := range cases {
		if got := doubleQuoteLiterals(in); got != want {
			t.Errorf("doubleQuoteLiterals(%q) = %q, want %q", in, got, want)
		}
	}
}

// A package documented as itself lists the keys it declares; a project does not.
func TestOwnMembers(t *testing.T) {
	dir := writeFixture(t)
	greet := func(options Options) int {
		t.Helper()
		entries, err := Collect(dir, options)
		if err != nil {
			t.Fatal(err)
		}
		for _, symbol := range entries[0].Symbols {
			if symbol.Name == "greet" {
				return len(symbol.Members)
			}
		}
		t.Fatal("greet not collected")
		return 0
	}
	if got := greet(Options{}); got != 0 {
		t.Fatalf("project listed %d members", got)
	}
	if got := greet(Options{OwnMembers: true}); got == 0 {
		t.Fatal("package listed no members")
	}
}

// A generated file sits under the project, so its keys are the project's own
// and are dropped. Keys codegen writes for every project carry a doc comment,
// and those are kept.
func TestKeepsDocumentedKeysOfGeneratedFile(t *testing.T) {
	dir := writeFixture(t)
	files := map[string]string{
		"src/index.ts":     "export type { Generated } from './types.gen.js'\nexport const x = 1\n",
		"src/types.gen.ts": "export interface Generated {\n  /** Runs one step. */\n  do(step: string): void\n  projectOwn: string\n}\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := Collect(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, symbol := range entries[0].Symbols {
		if symbol.Name != "Generated" {
			continue
		}
		if len(symbol.Members) != 1 || !strings.HasPrefix(symbol.Members[0].Line, "do") {
			t.Fatalf("want only the documented key do, got %+v", symbol.Members)
		}
		return
	}
	t.Fatal("Generated not collected")
}

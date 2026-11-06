package typecheck

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, root, name, text string) {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func project(t *testing.T) string {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	write(t, root, "package.json", `{"name":"x","type":"module","imports":{"#lib/*":"./src/lib/*.ts"}}`)
	write(t, root, "tsconfig.json", `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src"]}`)
	write(t, root, "src/lib/math.ts", "export const add = (a: number, b: number) => a + b\n")
	write(t, root, "src/index.ts", "import { add } from '#lib/math'\nexport const n: number = add(1, 2)\n")
	return root
}

func codes(ds []Diagnostic) []int {
	out := []int{}
	for _, d := range ds {
		out = append(out, d.Code)
	}
	return out
}

func TestResolvesPackageImportsThroughTheProjectTsconfig(t *testing.T) {
	root := project(t)
	got := New(root).Diagnostics(filepath.Join(root, "src/index.ts"), nil)
	if len(got) != 0 {
		t.Fatalf("want no diagnostics, got %+v", got)
	}
}

func TestChecksUnsavedContentAgainstTheRestOfTheProject(t *testing.T) {
	root := project(t)
	svc := New(root)
	file := filepath.Join(root, "src/index.ts")
	unsaved := "import { add } from '#lib/math'\nexport const n: string = add(1, 2)\n"
	got := svc.Diagnostics(file, &unsaved)
	if len(got) != 1 || got[0].Code != 2322 || got[0].StartLine != 2 || got[0].Severity != "error" {
		t.Fatalf("want one TS2322 on line 2, got %+v", got)
	}
	if again := svc.Diagnostics(file, nil); len(again) != 0 {
		t.Fatalf("the saved file is fine, got %+v", again)
	}
}

func TestSkipsFilesThatAreNotCode(t *testing.T) {
	root := project(t)
	if got := New(root).Diagnostics(filepath.Join(root, "package.json"), nil); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestACatchAllBaseTsconfigDoesNotClaimFilesSoJsxStillWorks(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	write(t, root, "tsconfig.json", `{"compilerOptions":{"strict":true}}`)
	write(t, root, "web/main.tsx", "export const el = <div data-testid=\"x\" />\n")
	for _, d := range New(root).Diagnostics(filepath.Join(root, "web/main.tsx"), nil) {
		if d.Code == 17004 {
			t.Fatalf("JSX was rejected: %+v", codes(New(root).Diagnostics(filepath.Join(root, "web/main.tsx"), nil)))
		}
	}
}

func TestPositionsAreUTF16Columns(t *testing.T) {
	root := project(t)
	file := filepath.Join(root, "src/index.ts")
	src := "export const s = '😀'; export const n: number = 'x'\n"
	got := New(root).Diagnostics(file, &src)
	if len(got) != 1 || got[0].StartLine != 1 || got[0].StartColumn != 37 || got[0].EndColumn != 38 {
		t.Fatalf("want columns 37-38 (the emoji is two UTF-16 units; TypeScript 6 reports the same), got %+v", got)
	}
}

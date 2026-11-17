package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// Anything that could change which contributors a wireContributors call opts
// in to is refused with PKU362 instead of being skipped or merged.
func TestWireContributorsRefusesWhatItCannotRead(t *testing.T) {
	root := t.TempDir()
	for name, text := range map[string]string{
		"tsconfig.json": `{"compilerOptions":{"target":"ES2022","module":"Node16","moduleResolution":"Node16","strict":true,"noEmit":true,"skipLibCheck":true},"include":["src"]}`,
		"src/first.ts": `import { wireContributors } from '@pikku/core/contributors'

wireContributors({ package: '@fixture/shop-addon', contributors: ['inbox'] })
`,
		"src/second.ts": `import { wireContributors } from '@pikku/core/contributors'

declare const contributors: string[]
declare const options: { contributors?: string[] }

wireContributors({ package: '@fixture/shop-addon', contributors: ['cache'] })
wireContributors({ package: '@fixture/other-addon', contributors })
wireContributors({ package: '@fixture/other-addon', contributors: ['a'], ...options })
`,
	} {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(root, name)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	res, err := Run(protocol.Request{
		RouteFiles: []string{filepath.Join(root, "src/first.ts"), filepath.Join(root, "src/second.ts")},
		Options:    protocol.Options{RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json")},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, d := range res.Diagnostics {
		if d.Code == "PKU362" {
			got = append(got, d.Message)
		}
	}
	want := []string{
		"wireContributors is called twice for package '@fixture/shop-addon' (src/first.ts:3 and src/second.ts:6). Call it once with every contributor to opt in to.",
		"wireContributors' properties must be plain `key: value` entries, got: contributors",
		"wireContributors' properties must be plain `key: value` entries, got: ...options",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("PKU362 diagnostics:\n got %q\nwant %q", got, want)
	}
}

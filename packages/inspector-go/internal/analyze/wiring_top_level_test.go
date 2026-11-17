package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// A Pikku wire* call is a build-time declaration, so it must sit at the top
// level of a file; inside any function the inspector would count a wiring that
// never runs (or runs on demand) as if it were static.
func TestWiringsAreTopLevel(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{
		"tsconfig.json": `{"compilerOptions":{"target":"ES2022","module":"Node16","moduleResolution":"Node16","strict":true,"noEmit":true,"skipLibCheck":true},"include":["src"]}`,
		"src/nested.ts": `import { wireContributors } from '@pikku/core/contributors'
import { wireHTTP } from '@pikku/core/http'

export function optInToJobs() {
  wireContributors({ package: '@fixture/shop-addon', contributors: ['jobs'] })
}

export const addRoute = () => {
  wireHTTP({ route: '/a', func: {} as any })
}
`,
		"src/enclosures.ts": `import { wireHTTP as wire } from '@pikku/core/http'

class Wirer {
  attach() {
    wire({ route: '/b', func: {} as any })
  }
}

export const later = function () {
  wire({ route: '/c', func: {} as any })
}

void Wirer
`,
		"src/wrapper.ts": `import { wireHTTP as coreWireHTTP } from '@pikku/core/http'

export const wireHTTP = (config: any) => {
  coreWireHTTP(config)
}
`,
		"src/top.ts": `import { wireContributors } from '@pikku/core/contributors'

wireContributors({ package: '@fixture/top-addon', contributors: ['inbox'] })
`,
	}
	for name, text := range files {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(root, name)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	res, err := Run(protocol.Request{
		RouteFiles: []string{filepath.Join(root, "src/nested.ts"), filepath.Join(root, "src/enclosures.ts"), filepath.Join(root, "src/top.ts"), filepath.Join(root, "src/wrapper.ts")},
		Options:    protocol.Options{RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json")},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, d := range res.Diagnostics {
		if d.Code == "PKU367" {
			got = append(got, d.Message)
		}
	}
	want := []string{
		"wireHTTP must be called at the top level of a file, not inside a function (inside attach, src/enclosures.ts:4)",
		"wireHTTP must be called at the top level of a file, not inside a function (inside later, src/enclosures.ts:9)",
		"wireContributors must be called at the top level of a file, not inside a function (inside optInToJobs, src/nested.ts:4)",
		"wireHTTP must be called at the top level of a file, not inside a function (inside addRoute, src/nested.ts:8)",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("PKU367 diagnostics:\n got %q\nwant %q", got, want)
	}
}

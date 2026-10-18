// Command gen writes helpers.gen.js: run it through `go generate` in
// internal/schemas/zodjs.
package main

import (
	"log"
	"os"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas/zodjs"
)

func main() {
	out, err := zodjs.BundleHelpers(".")
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile("helpers.gen.js", out, 0o644); err != nil {
		log.Fatal(err)
	}
}

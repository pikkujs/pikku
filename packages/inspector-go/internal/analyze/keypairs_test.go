package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// Every field of defineKeyPair has to reach state.keyPairs, or the build's
// validation cannot see it: the defineSecret visitor drops `generate` this way.
func TestKeyPairFixtureCarriesEveryField(t *testing.T) {
	root, _ := filepath.Abs("../../testdata/keypairs")
	var files []string
	_ = filepath.Walk(filepath.Join(root, "src"), func(p string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(p, ".ts") {
			files = append(files, p)
		}
		return nil
	})
	res, err := Run(protocol.Request{RouteFiles: files, Options: protocol.Options{
		RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json"),
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defs := res.State.KeyPairs.Definitions
	if len(defs) != 3 {
		t.Fatalf("keyPairs: %d definitions, want 3 (the nameless one is an error): %s", len(defs), jsjson.MustMarshal(defs))
	}
	full := string(defs[0])
	for _, want := range []string{
		`"name":"console-auth"`, `"displayName":"Console auth"`, `"description":"Signs console tokens"`,
		`"algorithm":"rs256"`, `"purpose":"signing"`, `"rotationPeriod":"90day"`, `"verifyGrace":"1d"`,
		`"signedLifetime":"1h"`, `"scope":"keyed"`, `"custody":"wrapped"`, `"public":"jwks"`, `"signedFormat":"jws"`,
		`"docsUrl":"https://example.com/keys"`,
	} {
		if !strings.Contains(full, want) {
			t.Errorf("field lost: %s not in %s", want, full)
		}
	}
	sealing := string(defs[1])
	for _, want := range []string{`"rotationPeriod":"never"`, `"rotationMode":"pinned"`} {
		if !strings.Contains(sealing, want) {
			t.Errorf("%s not in %s", want, sealing)
		}
	}
	if !strings.Contains(string(defs[2]), `"algorithm":"ALGORITHM"`) {
		t.Errorf("a non-literal is passed as its text for validation to refuse: %s", defs[2])
	}
	if res.State.KeyPairs.Files.Len() != 1 {
		t.Errorf("files = %v", res.State.KeyPairs.Files.Values())
	}
	found := false
	for _, d := range res.Diagnostics {
		if strings.Contains(d.Message, "Key pair is missing the required 'name'") {
			found = true
		}
	}
	if !found {
		t.Errorf("no diagnostic for the nameless key pair: %v", res.Diagnostics)
	}
}

// defineSecret reads `generate` and accepts rotationPeriod 'never', as its
// own validator tells users to write.
func TestSecretFixtureCarriesGenerate(t *testing.T) {
	root, _ := filepath.Abs("../../testdata/keypairs")
	res, err := Run(protocol.Request{RouteFiles: []string{filepath.Join(root, "src/secrets.ts")}, Options: protocol.Options{
		RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json"),
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Diagnostics) != 0 {
		t.Errorf("rotationPeriod 'never' was refused: %v", res.Diagnostics)
	}
	defs := res.State.Secrets.Definitions
	if len(defs) != 1 || !strings.Contains(string(defs[0]), `"generate":{"size":32}`) {
		t.Errorf("generate lost: %s", jsjson.MustMarshal(defs))
	}
	if !strings.Contains(string(defs[0]), `"rotationPeriod":"never"`) {
		t.Errorf("rotationPeriod lost: %s", jsjson.MustMarshal(defs))
	}
}

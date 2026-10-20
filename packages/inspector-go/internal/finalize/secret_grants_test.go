package finalize

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// grantState wires one addon, from its raw declaration JSON, in a project that
// declares no secrets — with or without a pikkuBetterAuth definition.
func grantState(t *testing.T, decl string, withAuth bool) *state.State {
	t.Helper()
	st := &state.State{}
	st.RPC.WireAddonDeclarations.Set("auth-addon", state.Raw(decl))
	if withAuth {
		st.Auth.Definition = &state.AuthDefinition{}
	}
	return st
}

func criticals(log *diag.Logger) []diag.Diagnostic {
	var out []diag.Diagnostic
	for _, d := range log.Entries() {
		if d.Level == diag.Critical {
			out = append(out, d)
		}
	}
	return out
}

// The better-auth scaffold's auth-secrets.gen.ts is written after the first
// inspection of a fresh project, so a grant of BETTER_AUTH_SECRET must not
// fail that inspection when the project has auth.
func TestSecretGrantOfBetterAuthSecretWithAuth(t *testing.T) {
	for name, decl := range map[string]string{
		"grant":              `{"package":"@addon/auth","secretGrants":["BETTER_AUTH_SECRET"]}`,
		"grant via override": `{"package":"@addon/auth","secretGrants":["AUTH_SECRET"],"secretOverrides":{"AUTH_SECRET":"BETTER_AUTH_SECRET"}}`,
	} {
		log := &diag.Logger{}
		validateSecretOverrides(log, grantState(t, decl, true))
		if c := criticals(log); len(c) != 0 {
			t.Errorf("%s: want no criticals, got %+v", name, c)
		}
	}
}

func TestSecretGrantOfBetterAuthSecretWithoutAuth(t *testing.T) {
	log := &diag.Logger{}
	validateSecretOverrides(log, grantState(t, `{"package":"@addon/auth","secretGrants":["BETTER_AUTH_SECRET"]}`, false))
	c := criticals(log)
	if len(c) != 1 || c[0].Code != diag.InvalidValue || !strings.Contains(c[0].Message, "Available secrets: none") {
		t.Errorf("want one PKU124 naming no available secrets, got %+v", c)
	}
}

package schemas

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

const fakeAnswer = `{"schemas":[["Input",{"schema":{"type":"string"},"typeText":"string"}]],"errors":[]}`

func fakeHelper(t *testing.T, script string) NodeConverter {
	t.Helper()
	path := filepath.Join(t.TempDir(), "helper.sh")
	if err := os.WriteFile(path, []byte(script), 0o644); err != nil {
		t.Fatal(err)
	}
	return NodeConverter{Node: "sh", Script: path}
}

func TestNodeConverterTakesTheAnswerFromAHelperThatNeverExits(t *testing.T) {
	for name, tail := range map[string]string{
		"helper hangs":            "exec sleep 300\n",
		"child keeps stdout open": "sleep 20 &\nexit 0\n",
	} {
		t.Run(name, func(t *testing.T) {
			conv := fakeHelper(t, "printf '%s' '"+fakeAnswer+"'\n"+tail)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			start := time.Now()
			res, err := conv.Convert(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			if len(res.Schemas) != 1 || res.Schemas[0].Name != "Input" || res.Schemas[0].TypeText != "string" {
				t.Fatalf("unexpected result: %+v", res)
			}
			if took := time.Since(start); took > 10*time.Second {
				t.Fatalf("took %s, should not wait for the helper to exit", took)
			}
		})
	}
}

func TestNodeConverterStopsAHelperThatNeverAnswers(t *testing.T) {
	conv := fakeHelper(t, "echo still working >&2\nexec sleep 300\n")
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := conv.Convert(ctx, nil)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v", err)
	}
	if !strings.Contains(err.Error(), "still working") {
		t.Fatalf("stderr missing from: %v", err)
	}
	if took := time.Since(start); took > 10*time.Second {
		t.Fatalf("took %s", took)
	}
}

func TestNodeConverterSurfacesAFailedHelper(t *testing.T) {
	for name, script := range map[string]string{
		"no output":      "echo boom >&2\nexit 3\n",
		"partial output": "printf '{\"schemas\":['\necho boom >&2\nexit 3\n",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := fakeHelper(t, script).Convert(context.Background(), nil)
			if err == nil || !strings.Contains(err.Error(), "boom") || !strings.Contains(err.Error(), "exit status 3") {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestNodeConverterRejectsInvalidOutput(t *testing.T) {
	for name, script := range map[string]string{
		"not json": "echo nope\nexec sleep 300\n",
		"empty":    "exit 0\n",
	} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_, err := fakeHelper(t, script).Convert(ctx, nil)
			if err == nil || !strings.Contains(err.Error(), "invalid output") {
				t.Fatalf("got %v", err)
			}
		})
	}
}

type stalledConverter struct{}

func (stalledConverter) Convert(ctx context.Context, _ []VendorRef) (VendorResult, error) {
	<-ctx.Done()
	return VendorResult{}, ctx.Err()
}

func TestGenerateVendorSchemasNamesTheStageThatTimedOut(t *testing.T) {
	t.Setenv("PIKKU_VENDOR_SCHEMA_TIMEOUT_MS", "50")
	st := state.New("/root")
	st.SchemaLookup.Set("Input", state.SchemaRef{VariableName: "Input", SourceFile: "/root/f.ts", Vendor: "zod"})
	_, err := generateVendorSchemas(&diag.Logger{}, stalledConverter{}, st)
	if err == nil || !strings.Contains(err.Error(), "Zod schema conversion did not answer within 50ms") ||
		!strings.Contains(err.Error(), "PIKKU_VENDOR_SCHEMA_TIMEOUT_MS") {
		t.Fatalf("got %v", err)
	}
}

func TestVendorTimeoutDefaults(t *testing.T) {
	for _, value := range []string{"", "soon", "0", "-5"} {
		t.Setenv("PIKKU_VENDOR_SCHEMA_TIMEOUT_MS", value)
		if got := vendorTimeout(); got != defaultVendorTimeout {
			t.Fatalf("%q gave %s", value, got)
		}
	}
}

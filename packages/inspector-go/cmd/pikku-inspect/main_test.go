package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// fixtureRequest inspects the repo's recipes/functions, the smaller parity
// project; it needs `bun install` to have run.
func fixtureRequest(t *testing.T, setupOnly bool) protocol.Request {
	t.Helper()
	root, _ := filepath.Abs("../../../../recipes/functions")
	if _, err := os.Stat(filepath.Join(root, "node_modules")); err != nil {
		t.Skip("recipes/functions is not installed")
	}
	files := findSourceFiles(filepath.ToSlash(root), []string{"src"})
	return protocol.Request{RouteFiles: files, Options: protocol.Options{
		RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json"), SetupOnly: setupOnly,
		Types: json.RawMessage(`{"userSessionType":"UserSession"}`),
	}}
}

func decodeResponse(t *testing.T, b []byte) protocol.Response {
	t.Helper()
	var res protocol.Response
	if err := json.Unmarshal(b, &res); err != nil {
		t.Fatalf("response does not decode: %v\n%.300s", err, b)
	}
	return res
}

func TestInspectStdin(t *testing.T) {
	req := fixtureRequest(t, false)
	in, _ := json.Marshal(req)
	var out bytes.Buffer
	if err := runInspect(bytes.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	res := decodeResponse(t, out.Bytes())
	if res.Protocol != protocol.Version || !res.Finalized || res.Error != "" {
		t.Fatalf("protocol=%d finalized=%v", res.Protocol, res.Finalized)
	}
	if res.State.Functions.Meta.Len() == 0 || res.Stats.ProjectFiles == 0 {
		t.Fatalf("empty analysis: %+v", res.Stats)
	}
}

func TestInspectSetupOnlySkipsFunctionsAndRoutes(t *testing.T) {
	req := fixtureRequest(t, true)
	in, _ := json.Marshal(req)
	var out bytes.Buffer
	if err := runInspect(bytes.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	res := decodeResponse(t, out.Bytes())
	if n := res.State.Functions.Meta.Len(); n != 0 {
		t.Fatalf("setupOnly produced %d functions", n)
	}
	if res.State.SingletonServicesTypeImportMap.Len() == 0 {
		t.Fatal("setupOnly skipped the setup sweep")
	}
}

func TestServeReusesFilesAndReportsErrors(t *testing.T) {
	req := fixtureRequest(t, false)
	line := func(id string, method string) string {
		b, _ := json.Marshal(map[string]any{"id": json.RawMessage(id), "method": method, "params": req})
		return string(b)
	}
	in := strings.Join([]string{line("1", "inspect"), "", "{not json", line(`"x"`, "nope"), line("2", "inspect")}, "\n")
	var out bytes.Buffer
	if err := runServe(strings.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("got %d responses, want 4 (blank lines are skipped)", len(lines))
	}
	var rs []struct {
		ID     json.RawMessage      `json:"id"`
		Result *protocol.Response   `json:"result"`
		Error  *protocol.ServeError `json:"error"`
	}
	for _, l := range lines {
		var r struct {
			ID     json.RawMessage      `json:"id"`
			Result *protocol.Response   `json:"result"`
			Error  *protocol.ServeError `json:"error"`
		}
		if err := json.Unmarshal([]byte(l), &r); err != nil {
			t.Fatal(err)
		}
		rs = append(rs, r)
	}
	if rs[1].Error == nil || !strings.HasPrefix(rs[1].Error.Message, "bad request") {
		t.Errorf("malformed line: %+v", rs[1].Error)
	}
	if string(rs[2].ID) != `"x"` || rs[2].Error == nil || rs[2].Error.Message != "unknown method nope" {
		t.Errorf("unknown method: id=%s err=%+v", rs[2].ID, rs[2].Error)
	}
	cold, warm := rs[0].Result, rs[3].Result
	if cold == nil || warm == nil {
		t.Fatalf("inspect failed: %+v %+v", rs[0].Error, rs[3].Error)
	}
	if cold.Stats.FilesReused != 0 || warm.Stats.FilesReused == 0 {
		t.Errorf("filesReused cold=%d warm=%d", cold.Stats.FilesReused, warm.Stats.FilesReused)
	}
	a, _ := json.Marshal(cold.State)
	b, _ := json.Marshal(warm.State)
	if !bytes.Equal(a, b) {
		t.Error("a warm re-inspect produced a different state")
	}
}

func TestFailureResponseHasErrorAndNoState(t *testing.T) {
	f := protocol.FailureResponse(&protocol.Failure{Message: "boom"})
	b, _ := json.Marshal(f)
	if got := string(b); !strings.Contains(got, `"error":"boom"`) || !strings.Contains(got, `"diagnostics":[]`) || strings.Contains(got, `"state"`) {
		t.Fatalf("failure response: %s", got)
	}
}

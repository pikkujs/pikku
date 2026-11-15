package analyze

import (
	"slices"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// subscribe-func: the diagnostics for pikkuSubscribeFunc. The Rust inspector asserts the
// same list in tests/visit_core_fixtures.rs.
var subscribeWant = []string{
	"PKU955 Subscribe function 'bareEvents' declares the topic type 'string', which names no shape. Declare a string literal or a template literal such as `order:${string}` as its second type argument, so publish can refuse topics no subscribe function returns.",
	"PKU956 Subscribe function 'plainGetEvents' is wired as Route 'GET /plain'. A subscribe function is wired only as an `sse: true` HTTP route or a channel `onMessageWiring` action, because only those streams can be subscribed to a topic.",
	"PKU956 Subscribe function 'connectEvents' is wired as Channel 'live' onConnect. A subscribe function is wired only as an `sse: true` HTTP route or a channel `onMessageWiring` action, because only those streams can be subscribed to a topic.",
	"PKU957 'rogue.ts' imports '@pikku/core/internal/event-hub', the event hub's internal path. Functions get only the publisher (services.eventHub); subscribing is a pikkuSubscribeFunc.",
}

func TestSubscribeFuncDiagnostics(t *testing.T) {
	var got []string
	for _, d := range classificationDiagnostics(t, protocol.Options{}, "../../testdata/subscribe-func") {
		if d.Code == diag.SubscribeTopicNotDeclared || d.Code == diag.SubscribeWiringNotStreaming || d.Code == diag.EventHubInternalAccess {
			if d.Level != "critical" {
				t.Errorf("%s is %s, want critical", d.Code, d.Level)
			}
			got = append(got, string(d.Code)+" "+d.Message)
		}
	}
	for _, w := range subscribeWant {
		if !slices.Contains(got, w) {
			t.Errorf("missing %q\ngot:\n%s", w, strings.Join(got, "\n"))
		}
	}
	if len(got) != len(subscribeWant) {
		t.Errorf("got %d diagnostics, want %d:\n%s", len(got), len(subscribeWant), strings.Join(got, "\n"))
	}
}

func subscribeState(t *testing.T) *protocol.Response {
	t.Helper()
	root, files := classificationRequest(t, "../../testdata/subscribe-func")
	res, err := Run(protocol.Request{RouteFiles: files, Options: protocol.Options{
		RootDir: root, Tsconfig: root + "/tsconfig.json",
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestSubscribeFuncMeta(t *testing.T) {
	res := subscribeState(t)
	meta := func(id string) (pattern string, sessionless *bool, notRPC bool) {
		m := res.State.Functions.Meta.At(id)
		if m == nil {
			t.Fatalf("no meta for %s", id)
		}
		if m.Subscribe != nil {
			pattern = m.Subscribe.TopicPattern
		}
		return pattern, m.Sessionless, res.State.RPC.InternalMeta.At(id) == ""
	}
	for id, want := range map[string]string{
		"orderEvents":   "order:${string}",
		"aliasedEvents": "order:${string}",
		"newsEvents":    "news",
		"messageEvents": "board:${string}",
		"http:get:/inline": "inline",
	} {
		pattern, _, notRPC := meta(id)
		if pattern != want {
			t.Errorf("%s topicPattern = %q, want %q", id, pattern, want)
		}
		if !notRPC {
			t.Errorf("%s is registered as an RPC", id)
		}
	}
	if _, sessionless, _ := meta("orderEvents"); sessionless == nil || *sessionless {
		t.Errorf("orderEvents must require a session, got sessionless=%v", sessionless)
	}
	if _, sessionless, _ := meta("newsEvents"); sessionless == nil || !*sessionless {
		t.Errorf("newsEvents is wired auth:false, so it must be sessionless, got %v", sessionless)
	}
	if res.State.Functions.Meta.At("ordinary") == nil || res.State.RPC.InternalMeta.At("ordinary") == "" {
		t.Errorf("an ordinary pikkuFunc stays an RPC")
	}
}

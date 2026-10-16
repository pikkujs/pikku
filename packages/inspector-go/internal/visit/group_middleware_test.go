package visit

import (
	"reflect"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestRegisterMiddlewareInstancesAllocatesUniqueIdsAndIsIdempotent(t *testing.T) {
	var inst state.Record[*state.MiddlewareInstance]
	entries := []instanceEntry{{definitionId: "a"}, {definitionId: "b", isFactoryCall: true}}

	first := registerMiddlewareInstances(&inst, "global", "middleware", entries, "/one.ts", 10)
	if want := []string{"global:middleware:0", "global:middleware:1"}; !reflect.DeepEqual(first, want) {
		t.Fatalf("first call = %v, want %v", first, want)
	}
	// A second file against the same group must not overwrite the first's ids.
	second := registerMiddlewareInstances(&inst, "global", "middleware", entries[:1], "/two.ts", 5)
	if want := []string{"global:middleware:2"}; !reflect.DeepEqual(second, want) {
		t.Fatalf("second call = %v, want %v", second, want)
	}
	// Revisiting the same call site returns the ids it already has.
	again := registerMiddlewareInstances(&inst, "global", "middleware", entries, "/one.ts", 10)
	if !reflect.DeepEqual(again, first) || inst.Len() != 3 {
		t.Fatalf("revisit = %v (len %d), want %v (len 3)", again, inst.Len(), first)
	}
	if got := inst.At("global:middleware:1"); !got.IsFactoryCall || got.DefinitionId != "b" {
		t.Fatalf("instance 1 = %+v", got)
	}
}

func TestRecordMiddlewareGroupMergesRegistrations(t *testing.T) {
	var groups state.Map[*state.MiddlewareGroupMeta]
	name := "corsMiddleware"
	recordMiddlewareGroup(&groups, "*", &state.MiddlewareGroupMeta{
		ExportName: &name, SourceFile: "/a.ts", Position: 1, Count: 1, InstanceIds: state.Strings{"http:*:0"}, IsFactory: true,
		Services: state.ServicesMeta{Optimized: false, Services: []string{"logger"}},
	})
	second := &state.MiddlewareGroupMeta{
		SourceFile: "/b.ts", Position: 7, Count: 2, InstanceIds: state.Strings{"http:*:1", "http:*:2"},
		Services: state.ServicesMeta{Optimized: false, Services: []string{"logger", "jwt"}},
	}
	recordMiddlewareGroup(&groups, "*", second)
	recordMiddlewareGroup(&groups, "*", second) // a revisit is not a new registration

	got, _ := jsjson.Marshal(groups.At("*"), "")
	want := `{"exportName":"corsMiddleware","sourceFile":"/a.ts","position":1,"services":{"optimized":false,"services":["logger","jwt"]},` +
		`"count":3,"instanceIds":["http:*:0","http:*:1","http:*:2"],"isFactory":true,` +
		`"additionalRegistrations":[{"exportName":null,"sourceFile":"/b.ts","position":7,"isFactory":false}]}`
	if string(got) != want {
		t.Fatalf("group =\n%s\nwant\n%s", got, want)
	}
}

func TestRenameTempDefinitions(t *testing.T) {
	var defs state.Record[*state.MiddlewareDefinition]
	defs.Set("__temp_a", &state.MiddlewareDefinition{SourceFile: "/a.ts"})
	ids := []string{"named", "__temp_a"}
	renameTempDefinitions(&defs, ids, "tag", "api")
	if ids[1] != "tag:api" || defs.Has("__temp_a") || defs.At("tag:api") == nil {
		t.Fatalf("single temp: ids=%v keys=%v", ids, defs.Keys())
	}
	ids = []string{"__temp_x", "named", "__temp_y"}
	renameTempDefinitions(&defs, ids, "http", "*")
	if want := []string{"http:*:0", "named", "http:*:2"}; !reflect.DeepEqual(ids, want) {
		t.Fatalf("several temps: %v, want %v", ids, want)
	}
}

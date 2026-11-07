//! Port of Go `internal/state`: the Rust form of `SerializableInspectorState`
//! (packages/inspector/src/utils/serialize-inspector-state.ts).
//!
//! The [`State`] struct is laid out in the serializer's key order, so encoding
//! it with [`crate::jsjson`] gives the bytes
//! `JSON.stringify(serializeInspectorState(s))` gives. JS Maps and Sets are
//! [`Map`] / [`Set`] and encode as the serializer's arrays; plain objects are
//! [`Record`] and keep JS key order. Fields marked `#[serde(skip)]` are
//! InspectorState members the serializer drops but a finalize pass still reads.
//!
//! Sections owned by visitor groups that are not ported yet have [`Raw`]
//! elements: they serialise to their initial empty values, and decode/re-encode
//! a TS state verbatim, so a Rust finalize can be ported section by section on
//! top. When you port a group, replace its `Raw` with a typed struct in
//! `meta.rs` (keep the field order of the TS object literal).

use serde::{Deserialize, Serialize};

use crate::typesmap::TypesMap;

pub mod meta;
pub mod ordered;
pub mod raw;

pub use meta::*;
pub use ordered::{Map, Record, Set, Strings};
pub use raw::Raw;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct State {
    pub root_dir: String,
    pub singleton_services_type_import_map: PathToNameAndType,
    pub wire_services_type_import_map: PathToNameAndType,
    pub user_session_type_import_map: PathToNameAndType,
    pub config_type_import_map: PathToNameAndType,
    pub singleton_services_factories: PathToNameAndType,
    pub wire_services_factories: PathToNameAndType,
    pub wire_services_meta: Map<Strings>,
    pub addon_required_parent_services: Strings,
    pub addon_created_services: Strings,
    pub addon_services_factory_seen: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub analytics: Vec<AnalyticsDeclaration>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub outgoing_webhooks: Vec<OutgoingWebhook>,
    pub addon_serverless_incompatible: Map<Strings>,
    pub config_factories: PathToNameAndType,
    pub server_lifecycle_factories: PathToNameAndType,
    /// InspectorFilesAndMethods: written by getFilesAndMethods (finalize).
    pub files_and_methods: Record<Raw>,
    pub files_and_methods_errors: Map<PathToNameAndType>,
    pub schema_lookup: Map<SchemaRef>,
    pub schemas: Record<Raw>,
    pub functions: Functions,
    pub http: Http,
    pub channels: FilesFirst,
    pub gateways: MetaFiles,
    pub triggers: Triggers,
    pub scheduled_tasks: MetaFiles,
    pub queue_workers: QueueWorkers,
    pub workflows: Workflows,
    pub rpc: Rpc,
    #[serde(rename = "mcpEndpoints")]
    pub mcp_endpoints: McpEndpoints,
    pub agents: Agents,
    pub scorers: Scorers,
    pub cli: Cli,
    pub nodes: MetaFiles,
    pub auth: Auth,
    pub secrets: Secrets,
    pub surface_usage: Record<Record<SurfaceUsage>>,
    pub service_bypass: Record<ServiceBypass>,
    pub credentials: Definitions,
    pub scopes: Scopes,
    pub system_roles: Definitions,
    pub feature_flags: Definitions,
    pub virtual_users: Definitions,
    pub variables: Definitions,
    pub manifest: Manifest,
    pub middleware: Middleware,
    pub channel_middleware: ChannelMiddleware,
    pub agent_middleware: AgentMiddleware,
    pub permissions: Permissions,
    pub service_aggregation: ServiceAggregation,
    /// resolveServiceTypes' answer (analysis), read by finalize.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_types: Option<ServiceTypes>,
    #[serde(rename = "resolvedIOTypes")]
    pub resolved_io_types: Record<ResolvedIoType>,
    pub middleware_groups_meta: MiddlewareGroupsMeta,
    pub permissions_groups_meta: PermissionsGroupsMeta,
    pub required_schemas: Set,
    #[serde(rename = "openAPISpec")]
    pub open_api_spec: Raw,
    pub diagnostics: Vec<InspectorDiagnostic>,
    pub addon_functions: Record<Record<FunctionMeta>>,
    /// Each versioned wireRemoteAddon's SDK metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_addon_functions: Option<Record<Record<FunctionMeta>>>,
    #[serde(skip_serializing_if = "Raw::is_empty")]
    pub studio: Raw,
    #[serde(skip_serializing_if = "Raw::is_empty")]
    pub addon_studio: Raw,
    /// What defineContributors registers.
    #[serde(skip_serializing_if = "Raw::is_empty")]
    pub contributors_manifest: Raw,
    /// What `wireAddon({ contributors })` selected from each addon's manifest.
    #[serde(skip_serializing_if = "Raw::is_empty")]
    pub opted_in_contributors: Raw,
    pub exported_contracts: ExportedContracts,

    /// Replaces the live `typesLookup` entries for the core interfaces
    /// (CoreConfig / CoreSingletonServices / CoreServices / CoreUserSession
    /// extensions): interface name -> its property names in
    /// `type.getProperties()` order. Go-only: omitted when no core interface was
    /// found, and not produced by the TS serializer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_type_properties: Option<Record<Strings>>,

    /// InspectorState members the serializer does not write.
    #[serde(skip)]
    pub stats: Option<Stats>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Functions {
    pub types_map: TypesMap,
    pub meta: Record<FunctionMeta>,
    pub files: Map<FileExport>,
    pub approval_descriptions: Record<MiddlewareDefinition>,
    pub dynamic_import_ids: Set,
    /// The functions declared with `disabled`, left out of everything else;
    /// `None` (and absent) when there are none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<Record<DisabledFunctionMeta>>,
}

/// A function declared with `disabled: true | 'reason'`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DisabledFunctionMeta {
    pub name: String,
    pub source_file: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub exported_name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reason: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Http {
    pub meta_input_types: Map<MetaInputTypes>,
    pub meta: Record<Record<HttpRouteMeta>>,
    pub files: Set,
    pub route_middleware: Map<MiddlewareGroupMeta>,
}

/// The keys getInitialInspectorState gives `http.meta`.
pub const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "delete", "head", "patch", "options"];

/// A `{ files, meta }` section (channels).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct FilesFirst {
    pub files: Set,
    pub meta: Record<Raw>,
}

/// A `{ meta, files }` section.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct MetaFiles {
    pub meta: Record<Raw>,
    pub files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Triggers {
    pub meta: Record<Raw>,
    pub source_meta: Record<Raw>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_source_meta: Option<Record<Raw>>,
    pub files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct QueueWorkers {
    pub meta: Record<QueueWorkerMeta>,
    pub files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Workflows {
    pub meta: Record<Raw>,
    pub files: Map<FileExport>,
    pub graph_meta: Record<Raw>,
    pub graph_files: Map<FileExport>,
    pub feature_files: Map<Raw>,
    pub invoked_workflows: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Rpc {
    pub internal_meta: Record<String>,
    pub internal_files: Map<FileExport>,
    pub exposed_meta: Record<String>,
    pub exposed_files: Map<FileExport>,
    pub remote_meta: Record<String>,
    pub remote_files: Map<FileExport>,
    pub invoked_functions: Set,
    pub invoked_functions_by_file: Map<Set>,
    pub used_addons: Set,
    pub wire_addon_declarations: Map<Raw>,
    pub wire_addon_files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpEndpoints {
    pub resources_meta: Record<MCPResourceMeta>,
    pub tools_meta: Record<MCPToolMeta>,
    pub prompts_meta: Record<MCPPromptMeta>,
    pub files: Set,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surfaces: Option<Record<String>>,
}

/// Follows the serializer's literal, which writes agentsMeta, files,
/// invokedAgentsByFile in that order.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Agents {
    pub agents_meta: Record<AgentMeta>,
    pub files: Map<FileExport>,
    pub invoked_agents_by_file: Map<Set>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Scorers {
    pub scorers_meta: Record<ScorerMeta>,
    pub files: Map<FileExport>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CliMeta {
    pub programs: Record<Raw>,
    pub renderers: Record<Raw>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Cli {
    pub meta: CliMeta,
    pub files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Auth {
    pub providers: Strings,
    pub plugins: Strings,
    pub files: Set,
    /// `null` until a pikkuBetterAuth(...) export is found.
    pub definition: Option<AuthDefinition>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Secrets {
    pub definitions: Vec<Raw>,
    pub files: Set,
    pub usage: Record<SecretUsage>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Definitions {
    pub definitions: Vec<Raw>,
    pub files: Set,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Scopes {
    pub definitions: Vec<Raw>,
    pub files: Set,
    /// declareScopes ids until addon scopes are merged (applyDeclaredScopes, in
    /// finalize).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declared: Option<Map<String>>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Manifest {
    pub initial: Raw,
    pub current: Raw,
    pub errors: Vec<Raw>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Middleware {
    pub definitions: Record<MiddlewareDefinition>,
    pub instances: Record<MiddlewareInstance>,
    pub global_files: Set,
    pub tag_middleware: Map<MiddlewareGroupMeta>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChannelMiddleware {
    pub definitions: Record<MiddlewareDefinition>,
    pub instances: Record<MiddlewareInstance>,
    pub tag_middleware: Map<MiddlewareGroupMeta>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AgentMiddleware {
    pub definitions: Record<MiddlewareDefinition>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Permissions {
    pub definitions: Record<MiddlewareDefinition>,
    pub instances: Record<Raw>,
    pub global: Vec<GlobalPermissionRegistration>,
}

/// InspectorGlobalPermissionRegistration: one addGlobalPermission call, which
/// codegen imports the file of, or calls `export_name` from when the call sits
/// in an exported zero-argument factory.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GlobalPermissionRegistration {
    pub source_file: String,
    pub position: i64,
    pub export_name: Option<String>,
    pub definition_ids: Strings,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ServiceAggregation {
    pub required_services: Set,
    pub used_functions: Set,
    pub used_middleware: Set,
    pub used_permissions: Set,
    pub all_singleton_services: Strings,
    pub all_wire_services: Strings,
}

/// InspectorServiceTypes: what finalize needs from the SingletonServices and
/// Services types, read off the checker by analysis.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ServiceTypes {
    /// Sorted; `None` (JSON null) when the type is unresolved.
    pub singleton_services: Option<Strings>,
    /// Unfiltered, in property order; `None` when unresolved.
    pub services: Option<Strings>,
    pub secret_aliases: Strings,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ResolvedIoType {
    pub input_type: String,
    pub output_type: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChannelMiddlewareGroups {
    pub definitions: Record<Raw>,
    pub instances: Record<Raw>,
    pub tag_groups: Record<Raw>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MiddlewareGroupsMeta {
    pub definitions: Record<Raw>,
    pub instances: Record<Raw>,
    pub http_groups: Record<Raw>,
    pub tag_groups: Record<Raw>,
    pub channel_middleware: ChannelMiddlewareGroups,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PermissionsGroupsMeta {
    pub definitions: Record<Raw>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExportedContracts {
    pub http: Record<Raw>,
    pub cli: Record<Raw>,
    pub channel: Record<Raw>,
    pub addon_http: Record<Raw>,
    pub addon_cli: Record<Raw>,
    pub addon_channel: Record<Raw>,
}

impl State {
    /// `getInitialInspectorState(rootDir)`. The zero values of [`Record`],
    /// [`Map`], [`Set`] and `Vec` already encode as the empty `{}` / `[]`, so
    /// only the members whose initial value is not empty are set here.
    pub fn new(root_dir: impl Into<String>) -> State {
        let mut s = State { root_dir: root_dir.into(), ..State::default() };
        for m in HTTP_METHODS {
            s.http.meta.set(m, Record::new());
        }
        s.triggers.webhook_source_meta = Some(Record::new());
        s.mcp_endpoints.surfaces = Some(Record::new());
        s.manifest.initial = Raw::null();
        s.manifest.current = Raw::null();
        s.open_api_spec = Raw::null();
        s
    }

    /// Encodes the state as `JSON.stringify(serializeInspectorState(s), null,
    /// indent)` would.
    pub fn marshal(&self, indent: &str) -> Result<Vec<u8>, serde_json::Error> {
        crate::jsjson::marshal(self, indent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The goldens are JSON.stringify(serializeInspectorState(...)) output from
    // the TS inspector (shared with the Go tests).
    const INITIAL: &str = include_str!("../../tests/golden/initial.golden.json");
    const POPULATED: &str = include_str!("../../tests/golden/populated.golden.json");

    #[test]
    fn initial_state_matches_ts_serializer() {
        let got = State::new("/root/x").marshal("").unwrap();
        assert_eq!(String::from_utf8(got).unwrap(), INITIAL);
    }

    #[test]
    fn populated_state_matches_ts_serializer() {
        let mut s = State::new("/root/\u{2028}x<&>");
        let v = |j: &str| Raw::of(serde_json::from_str(j).unwrap());
        s.schemas.set("b", v("{\"x\":\"\u{2029}\\u0007\\\"\\\\é😀\",\"n\":1.5e-7,\"big\":1e+21}"));
        s.schemas.set("10", v("1"));
        s.schemas.set("2", v("[true,null]"));
        s.functions.types_map.add_type("Foo", "/a/foo.ts");
        s.functions.types_map.add_custom_type("Bar", "{a:string}", vec!["Foo".into()]);
        s.functions.meta.set(
            "z",
            FunctionMeta::new(FunctionMetaFields {
                pikku_func_id: "z".into(),
                function_type: "user".into(),
                name: "z".into(),
                services: ServicesMeta { optimized: true, services: vec!["a".into()] },
                output_schema_name: Some("Foo".into()),
                inputs: vec![],
                outputs: vec!["Foo".into()],
                expose: Some(true),
                tags: Some(vec!["t".into()]),
                ..Default::default()
            }),
        );
        s.http.meta.get_mut("get").unwrap().set(
            "/a/:id",
            HttpRouteMeta::new(HttpRouteMetaFields {
                pikku_func_id: "z".into(),
                route: "/a/:id".into(),
                source_file: "/f.ts".into(),
                method: "get".into(),
                params: vec!["id".into()],
                ..Default::default()
            }),
        );
        s.http.files.add("/f.ts");
        s.secrets.usage.set("/f.ts", SecretUsage { keys: vec!["K".into()], dynamic: vec![] });
        let mut syms = Record::new();
        syms.set("y", SurfaceUsage { imports: 2, seen_in: vec!["src".into()], files: vec!["a.ts".into()] });
        s.surface_usage.set("#pikku/x", syms);
        s.singleton_services_type_import_map.set(
            "/s.ts",
            vec![NameAndType { variable: "S".into(), ty: Some("S".into()), type_path: None }],
        );
        let mut fns = Set::new();
        fns.add("z");
        s.rpc.invoked_functions_by_file.set("/f.ts", fns);

        let got = String::from_utf8(s.marshal("  ").unwrap()).unwrap();
        assert_eq!(got, POPULATED.trim_end_matches('\n'));
    }

    #[test]
    fn state_round_trips_ts_output() {
        let s: State = serde_json::from_str(POPULATED).unwrap();
        let got = String::from_utf8(s.marshal("  ").unwrap()).unwrap();
        assert_eq!(got, POPULATED.trim_end_matches('\n'));
    }

    #[test]
    fn inline_function_meta_uses_ensure_function_metadata_key_order() {
        let mut m = FunctionMeta::new(FunctionMetaFields {
            pikku_func_id: "f".into(),
            function_type: "user".into(),
            name: "f".into(),
            source_file: "/f.ts".into(),
            tags: Some(vec!["t".into()]),
            inputs: vec![],
            outputs: vec![],
            ..Default::default()
        });
        m.inline = true;
        assert_eq!(
            crate::jsjson::to_string(&m).unwrap(),
            r#"{"pikkuFuncId":"f","functionType":"user","name":"f","services":{"optimized":false,"services":[]},"inputSchemaName":null,"outputSchemaName":null,"inputs":[],"outputs":[],"sourceFile":"/f.ts","tags":["t"]}"#
        );
    }
}

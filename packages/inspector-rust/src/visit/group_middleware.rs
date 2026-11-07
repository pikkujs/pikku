//! Port of Go `visit/group_middleware.go`: add/add-middleware.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_callee::is_middleware_helper;
use super::util_channel_cli::make_context_based_id;
use super::util_middleware::{
    TEMP_PREFIX, join_services, nullable_string, services_of, string_prop, wires_or_nil,
};
use super::util_props::extract_used_wires;
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::{
    Map, MiddlewareDefinition, MiddlewareGroupMeta, MiddlewareInstance, MiddlewareRegistration, Record, ServicesMeta,
    State, WiresMeta,
};
use crate::tsutil::{self, file_name_of, start_utf16};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addMiddleware",
        phase: Phase::Setup,
        order: order::ADD_MIDDLEWARE,
        visit: |c, n| c.add_middleware(n),
    });
}

/// `recordMiddlewareGroup` keeps every registration under one pattern or tag;
/// the first stays primary.
pub fn record_middleware_group(groups: &mut Map<MiddlewareGroupMeta>, key: &str, group: MiddlewareGroupMeta) {
    let Some(existing) = groups.get_mut(key) else {
        groups.set(key, group);
        return;
    };
    if existing.source_file == group.source_file && existing.position == group.position {
        return;
    }
    for r in &existing.additional_registrations {
        if r.source_file == group.source_file && r.position == group.position {
            return;
        }
    }
    existing.additional_registrations.push(MiddlewareRegistration {
        export_name: group.export_name.clone(),
        source_file: group.source_file.clone(),
        position: group.position,
        is_factory: group.is_factory,
    });
    existing.count += group.count;
    existing.instance_ids.extend(group.instance_ids.iter().cloned());
    let mut all = existing.services.services.clone();
    all.extend(group.services.services.iter().cloned());
    existing.services = ServicesMeta { optimized: false, services: tsutil::dedupe(&all) };
}

pub struct InstanceEntry {
    pub definition_id: String,
    pub is_factory_call: bool,
}

/// `registerMiddlewareInstances` gives each entry of one add*Middleware call an
/// id unique across the inspection, and is idempotent per call site.
pub fn register_middleware_instances(
    instances: &mut Record<MiddlewareInstance>,
    group_type: &str,
    group_key: &str,
    entries: &[InstanceEntry],
    source_file: &str,
    position: i64,
) -> Vec<String> {
    let prefix = format!("{}:", make_context_based_id(group_type, &[group_key]));
    let mut already: Vec<String> = Vec::new();
    for (id, inst) in instances.iter() {
        if inst.source_file == source_file && inst.position == position && id.starts_with(&prefix) {
            already.push(id.to_string());
        }
    }
    if already.len() == entries.len() {
        return already;
    }
    let mut ids = Vec::new();
    let mut next = 0usize;
    for e in entries {
        let mut id = make_context_based_id(group_type, &[group_key, &next.to_string()]);
        while instances.has(&id) {
            next += 1;
            id = make_context_based_id(group_type, &[group_key, &next.to_string()]);
        }
        instances.set(
            id.clone(),
            MiddlewareInstance {
                definition_id: e.definition_id.clone(),
                source_file: source_file.to_string(),
                position,
                is_factory_call: e.is_factory_call,
            },
        );
        ids.push(id);
        next += 1;
    }
    ids
}

pub fn rename_temp_definitions(
    defs: &mut Record<MiddlewareDefinition>,
    definition_ids: &mut [String],
    group_type: &str,
    group_key: &str,
) {
    let temps: Vec<usize> =
        definition_ids.iter().enumerate().filter(|(_, id)| id.starts_with(TEMP_PREFIX)).map(|(i, _)| i).collect();
    for idx in &temps {
        let old_id = definition_ids[*idx].clone();
        let new_id = if temps.len() != 1 {
            make_context_based_id(group_type, &[group_key, &idx.to_string()])
        } else {
            make_context_based_id(group_type, &[group_key])
        };
        if let Some(existing) = defs.delete(&old_id) {
            defs.set(new_id.clone(), existing);
        }
        definition_ids[*idx] = new_id;
    }
}

/// `nameAndDescription` reads the object form's `name` / `description`.
pub fn name_and_description(arg: P<Node>) -> (Option<String>, Option<String>) {
    (string_prop(arg, "name"), string_prop(arg, "description"))
}

pub fn describe(name: &Option<String>, description: &Option<String>) -> String {
    let mut out = String::new();
    if let Some(n) = name.as_deref().filter(|n| !n.is_empty()) {
        out += &format!(" (name: {n})");
    }
    if let Some(d) = description.as_deref().filter(|d| !d.is_empty()) {
        out += &format!(" (description: {d})");
    }
    out
}

fn is_fn(n: Option<P<Node>>) -> bool {
    n.is_some_and(tsutil::is_function_like)
}

struct GroupKind {
    fn_name: &'static str,
    group_type: &'static str,
    key_word: &'static str,
    label: &'static str,
    log_label: &'static str,
    channel: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Target {
    Tag,
    Http,
    Channel,
}

fn targets(
    st: &mut State,
    t: Target,
) -> (&mut Record<MiddlewareDefinition>, &mut Record<MiddlewareInstance>, &mut Map<MiddlewareGroupMeta>) {
    match t {
        Target::Tag => (
            &mut st.middleware.definitions,
            &mut st.middleware.instances,
            &mut st.middleware.tag_middleware,
        ),
        Target::Http => {
            (&mut st.middleware.definitions, &mut st.middleware.instances, &mut st.http.route_middleware)
        }
        Target::Channel => (
            &mut st.channel_middleware.definitions,
            &mut st.channel_middleware.instances,
            &mut st.channel_middleware.tag_middleware,
        ),
    }
}

impl Context<'_> {
    pub fn add_middleware(&mut self, node: P<Node>) {
        match self.resolve_callee_name(node, &is_middleware_helper).as_str() {
            "pikkuMiddleware" => self.add_pikku_middleware(node),
            "pikkuMiddlewareFactory" => self.add_pikku_middleware_factory(node),
            "addTagMiddleware" => self.add_middleware_group(
                node,
                GroupKind {
                    fn_name: "addTagMiddleware",
                    group_type: "tag",
                    key_word: "tag",
                    label: "Middleware group",
                    log_label: "tag middleware group",
                    channel: false,
                },
            ),
            "addGlobalMiddleware" => self.add_global_middleware(node),
            "addHTTPMiddleware" => self.add_middleware_group(
                node,
                GroupKind {
                    fn_name: "addHTTPMiddleware",
                    group_type: "http",
                    key_word: "pattern",
                    label: "HTTP middleware group",
                    log_label: "HTTP route middleware group",
                    channel: false,
                },
            ),
            "pikkuChannelMiddleware" => self.add_pikku_channel_middleware(node),
            "pikkuChannelMiddlewareFactory" => self.add_pikku_channel_middleware_factory(node),
            "pikkuAgentMiddleware" => self.add_pikku_agent_middleware(node),
            "addChannelMiddleware" => self.add_middleware_group(
                node,
                GroupKind {
                    fn_name: "addChannelMiddleware",
                    group_type: "tag",
                    key_word: "tag",
                    label: "Channel middleware group",
                    log_label: "tag channel middleware group",
                    channel: true,
                },
            ),
            _ => {}
        }
    }

    fn add_pikku_middleware(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let arg = args[0];
        let (handler, name, description);
        if ast::is_object_literal_expression(arg) {
            (name, description) = name_and_description(arg);
            let f = self.get_property_assignment_initializer(arg, "func", true);
            if !is_fn(f) {
                self.log.error("• pikkuMiddleware object missing required 'func' property.");
                return;
            }
            handler = f.unwrap();
        } else if tsutil::is_function_like(arg) {
            handler = arg;
            name = None;
            description = None;
        } else {
            self.log.error("• Handler for pikkuMiddleware is not a function.");
            return;
        }
        let services = services_of(handler);
        let wires = extract_used_wires(handler, 1);
        let Some((id, exported_name)) = self.definition_id(node, "pikkuMiddleware", "myMiddleware") else { return };
        self.state.middleware.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                wires: wires_or_nil(wires),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                name: name.clone(),
                description: description.clone(),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found middleware with services: {}{}", join_services(&services), describe(&name, &description)));
    }

    fn add_pikku_middleware_factory(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let factory = args[0];
        if !tsutil::is_function_like(factory) {
            self.log.error("• Handler for pikkuMiddlewareFactory is not a function.");
            return;
        }
        let mut services = ServicesMeta { optimized: false, services: vec![] };
        let mut wires = WiresMeta { optimized: true, wires: vec![] };
        let (mut name, mut description) = (None, None);
        let call = self.find_call(factory, &is_middleware_helper, "pikkuMiddleware").filter(|c| !c.arguments().is_empty());
        if let Some(call) = call {
            let mw_arg = call.arguments()[0];
            if ast::is_object_literal_expression(mw_arg) {
                (name, description) = name_and_description(mw_arg);
                if let Some(f) = self.get_property_assignment_initializer(mw_arg, "func", true).filter(|f| tsutil::is_function_like(*f)) {
                    services = services_of(f);
                    wires = extract_used_wires(f, 1);
                }
            } else if tsutil::is_function_like(mw_arg) {
                services = services_of(mw_arg);
                wires = extract_used_wires(mw_arg, 1);
            }
        } else if let Some(body) = factory.body().filter(|b| tsutil::is_function_like(*b)) {
            services = services_of(body);
            wires = extract_used_wires(body, 1);
        }
        let Some((id, exported_name)) = self.definition_id(node, "pikkuMiddlewareFactory", "myMiddleware") else { return };
        self.state.middleware.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                wires: wires_or_nil(wires),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                factory: Some(true),
                name: name.clone(),
                description: description.clone(),
                ..Default::default()
            },
        );
        self.log.debug(format!(
            "• Found middleware factory with services: {}{}",
            join_services(&services),
            describe(&name, &description)
        ));
    }

    /// `addMiddlewareGroup` handles addTagMiddleware, addHTTPMiddleware and
    /// addChannelMiddleware, which differ only in where they record.
    fn add_middleware_group(&mut self, node: P<Node>, k: GroupKind) {
        let args = node.arguments();
        if args.len() < 2 {
            return;
        }
        let (key_arg, array_arg) = (args[0], args[1]);
        let key = if ast::is_string_literal(key_arg) { key_arg.text().to_string() } else { String::new() };
        if key.is_empty() {
            self.log.warn(format!("• {} call without valid {} string", k.fn_name, k.key_word));
            return;
        }
        if !ast::is_array_literal_expression(array_arg) {
            self.log.error(format!("• {}('{}', ...) must have a literal array as second argument", k.fn_name, key));
            return;
        }
        let refs = self.extract_middleware_refs(Some(array_arg));

        let target = if k.channel {
            Target::Channel
        } else if k.group_type == "http" {
            Target::Http
        } else {
            Target::Tag
        };
        if k.channel && refs.is_empty() {
            self.log.warn(format!("• addChannelMiddleware('{key}', ...) has empty middleware array"));
            return;
        }

        let mut definition_ids: Vec<String> = refs.iter().map(|r| r.definition_id.clone()).collect();
        if !definition_ids.is_empty() {
            let (defs, _, _) = targets(self.state, target);
            rename_temp_definitions(defs, &mut definition_ids, k.group_type, &key);
        }

        let source_file = file_name_of(node).to_string();
        let position = start_utf16(node) as i64;
        let entries: Vec<InstanceEntry> = refs
            .iter()
            .enumerate()
            .map(|(i, r)| InstanceEntry { definition_id: definition_ids[i].clone(), is_factory_call: r.is_factory_call })
            .collect();
        let (defs, instances, _) = targets(self.state, target);
        let instance_ids = register_middleware_instances(instances, k.group_type, &key, &entries, &source_file, position);

        let mut all_services: Vec<String> = Vec::new();
        for id in &definition_ids {
            if let Some(def) = defs.get(id) {
                all_services.extend(def.services.services.iter().cloned());
            }
        }
        let all_services = tsutil::dedupe(&all_services);

        let mut is_factory = false;
        let mut exported_name = String::new();
        if let Some(parent) = node.parent().filter(|p| ast::is_arrow_function(*p) && p.parameters().is_empty()) {
            is_factory = true;
            if let Some(ap) = parent.parent() {
                if ast::is_variable_declaration(ap)
                    && ap.name().is_some_and(ast::is_identifier)
                    && self.is_named_export(ap)
                {
                    exported_name = ap.name().unwrap().text().to_string();
                }
            }
        }
        if !is_factory {
            exported_name = self.extract_function_name(node).exported_name;
        }
        if !is_factory && !exported_name.is_empty() {
            self.log.warn(format!(
                "• {} '{}' for {} '{}' is not wrapped in a factory function. For tree-shaking, use: export const {} = () => {}('{}', [...])",
                k.label, exported_name, k.key_word, key, exported_name, k.fn_name, key
            ));
        }

        let (_, _, groups) = targets(self.state, target);
        record_middleware_group(
            groups,
            &key,
            MiddlewareGroupMeta {
                export_name: nullable_string(&exported_name),
                source_file: source_file.clone(),
                position,
                services: ServicesMeta { optimized: false, services: all_services },
                count: refs.len() as i64,
                instance_ids: instance_ids.clone(),
                is_factory,
                additional_registrations: vec![],
            },
        );
        if k.group_type == "http" {
            self.state.http.files.add(source_file);
        }
        let mode = if is_factory { "factory" } else { "direct" };
        self.log.debug(format!("• Found {}: {} -> [{}] ({})", k.log_label, key, instance_ids.join(", "), mode));
    }

    fn add_global_middleware(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() || !ast::is_array_literal_expression(args[0]) {
            self.log.error("• addGlobalMiddleware(...) must have a literal array as its only argument");
            return;
        }
        let refs = self.extract_middleware_refs(Some(args[0]));
        let mut definition_ids: Vec<String> = refs.iter().map(|r| r.definition_id.clone()).collect();
        if !definition_ids.is_empty() {
            rename_temp_definitions(&mut self.state.middleware.definitions, &mut definition_ids, "global", "middleware");
        }
        let source_file = file_name_of(node).to_string();
        let entries: Vec<InstanceEntry> = refs
            .iter()
            .enumerate()
            .map(|(i, r)| InstanceEntry { definition_id: definition_ids[i].clone(), is_factory_call: r.is_factory_call })
            .collect();
        register_middleware_instances(
            &mut self.state.middleware.instances,
            "global",
            "middleware",
            &entries,
            &source_file,
            start_utf16(node) as i64,
        );
        self.state.middleware.global_files.add(source_file.clone());
        self.state.http.files.add(source_file);
        self.log.debug(format!("• Found global middleware group with {} entries", refs.len()));
    }

    fn add_pikku_channel_middleware(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        if !tsutil::is_function_like(args[0]) {
            self.log.error("• Handler for pikkuChannelMiddleware is not a function.");
            return;
        }
        let services = services_of(args[0]);
        let Some((id, exported_name)) = self.definition_id(node, "pikkuChannelMiddleware", "myMiddleware") else { return };
        self.state.channel_middleware.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found channel middleware with services: {}", join_services(&services)));
    }

    fn add_pikku_channel_middleware_factory(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let factory = args[0];
        if !tsutil::is_function_like(factory) {
            self.log.error("• Handler for pikkuChannelMiddlewareFactory is not a function.");
            return;
        }
        let mut services = ServicesMeta { optimized: false, services: vec![] };
        let call = self.find_call(factory, &is_middleware_helper, "pikkuChannelMiddleware").filter(|c| !c.arguments().is_empty());
        if let Some(call) = call {
            let h = call.arguments()[0];
            if tsutil::is_function_like(h) {
                services = services_of(h);
            }
        } else if let Some(body) = factory.body().filter(|b| tsutil::is_function_like(*b)) {
            services = services_of(body);
        }
        let Some((id, exported_name)) = self.definition_id(node, "pikkuChannelMiddlewareFactory", "myMiddleware") else { return };
        self.state.channel_middleware.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                factory: Some(true),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found channel middleware factory with services: {}", join_services(&services)));
    }

    fn add_pikku_agent_middleware(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let arg = args[0];
        if !ast::is_object_literal_expression(arg) {
            self.log.error("• pikkuAgentMiddleware() requires an object literal argument.");
            return;
        }
        let mut all: Vec<String> = Vec::new();
        for p in arg.properties() {
            if ast::is_property_assignment(*p) {
                if let Some(init) = p.initializer().filter(|i| tsutil::is_function_like(*i)) {
                    all.extend(services_of(init).services);
                }
            }
        }
        let all = tsutil::dedupe(&all);
        let services = ServicesMeta { optimized: !all.is_empty(), services: all };
        let Some((id, exported_name)) = self.definition_id(node, "pikkuAgentMiddleware", "myMiddleware") else { return };
        self.state.agent_middleware.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found AI middleware with services: {}", join_services(&services)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Strings;

    #[test]
    fn register_middleware_instances_allocates_unique_ids_and_is_idempotent() {
        let mut inst: Record<MiddlewareInstance> = Record::new();
        let entries = vec![
            InstanceEntry { definition_id: "a".into(), is_factory_call: false },
            InstanceEntry { definition_id: "b".into(), is_factory_call: true },
        ];
        let first = register_middleware_instances(&mut inst, "global", "middleware", &entries, "/one.ts", 10);
        assert_eq!(first, ["global:middleware:0", "global:middleware:1"]);
        // A second file against the same group must not overwrite the first's ids.
        let second = register_middleware_instances(&mut inst, "global", "middleware", &entries[..1], "/two.ts", 5);
        assert_eq!(second, ["global:middleware:2"]);
        // Revisiting the same call site returns the ids it already has.
        let again = register_middleware_instances(&mut inst, "global", "middleware", &entries, "/one.ts", 10);
        assert!(again == first && inst.len() == 3);
        let got = inst.get("global:middleware:1").unwrap();
        assert!(got.is_factory_call && got.definition_id == "b");
    }

    #[test]
    fn record_middleware_group_merges_registrations() {
        let mut groups: Map<MiddlewareGroupMeta> = Map::new();
        record_middleware_group(
            &mut groups,
            "*",
            MiddlewareGroupMeta {
                export_name: Some("corsMiddleware".into()),
                source_file: "/a.ts".into(),
                position: 1,
                count: 1,
                instance_ids: Strings::from(vec!["http:*:0".to_string()]),
                is_factory: true,
                services: ServicesMeta { optimized: false, services: vec!["logger".into()] },
                additional_registrations: vec![],
            },
        );
        let second = MiddlewareGroupMeta {
            source_file: "/b.ts".into(),
            position: 7,
            count: 2,
            instance_ids: vec!["http:*:1".to_string(), "http:*:2".to_string()],
            services: ServicesMeta { optimized: false, services: vec!["logger".into(), "jwt".into()] },
            ..Default::default()
        };
        record_middleware_group(&mut groups, "*", second.clone());
        record_middleware_group(&mut groups, "*", second); // a revisit is not a new registration
        let got = serde_json::to_string(groups.get("*").unwrap()).unwrap();
        let want = r#"{"exportName":"corsMiddleware","sourceFile":"/a.ts","position":1,"services":{"optimized":false,"services":["logger","jwt"]},"count":3,"instanceIds":["http:*:0","http:*:1","http:*:2"],"isFactory":true,"additionalRegistrations":[{"exportName":null,"sourceFile":"/b.ts","position":7,"isFactory":false}]}"#;
        assert_eq!(got, want);
    }

    #[test]
    fn rename_temp_definitions_names_after_the_group() {
        let mut defs: Record<MiddlewareDefinition> = Record::new();
        defs.set("__temp_a", MiddlewareDefinition { source_file: "/a.ts".into(), ..Default::default() });
        let mut ids = vec!["named".to_string(), "__temp_a".to_string()];
        rename_temp_definitions(&mut defs, &mut ids, "tag", "api");
        assert!(ids[1] == "tag:api" && !defs.has("__temp_a") && defs.get("tag:api").is_some());
        let mut ids = vec!["__temp_x".to_string(), "named".to_string(), "__temp_y".to_string()];
        rename_temp_definitions(&mut defs, &mut ids, "http", "*");
        assert_eq!(ids, ["http:*:0", "named", "http:*:2"]);
    }
}

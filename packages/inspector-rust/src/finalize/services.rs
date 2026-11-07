//! Port of Go `finalize/services.go`: the service-aggregation half of
//! utils/post-process.ts.

use std::collections::HashSet;

use super::jsval::{OrderedSet, V};
use super::{jv, utils};
use crate::state::{QueueWorkerMeta, ServicesMeta, Set, State, WireRef};

/// inspector-constants.ts AUTH_HANDLER_FUNC_ID.
const AUTH_HANDLER_FUNC_ID: &str = "authHandler";

/// Copies the services add-auth inspected from the pikkuBetterAuth source onto
/// the generated auth handler's meta, whose own func is an opaque property
/// access. Runs before aggregate_required_services.
pub fn stamp_auth_handler_services(st: &mut State) {
    let Some(def) = &st.auth.definition else { return };
    let services = ServicesMeta { optimized: def.services.optimized, services: def.services.services.clone() };
    if let Some(handler) = st.functions.meta.get_mut(AUTH_HANDLER_FUNC_ID) {
        handler.services = services;
        handler.nil_slices.services = false;
    }
}

/// Applies the SingletonServices / Services names analysis resolved
/// (state.serviceTypes); skipped when analysis did not resolve them.
fn extract_all_services(st: &mut State) {
    let Some(resolved) = st.service_types.clone() else { return };
    if let Some(s) = &resolved.singleton_services {
        st.service_aggregation.all_singleton_services = s.clone();
    }
    if let Some(services) = &resolved.services {
        let singleton: HashSet<&String> = st.service_aggregation.all_singleton_services.iter().collect();
        let mut wire: Vec<String> = services.iter().filter(|s| !singleton.contains(s)).cloned().collect();
        wire.sort();
        st.service_aggregation.all_wire_services = wire.clone();
        let wire_set: HashSet<String> = wire.into_iter().collect();
        mark_singleton_services_only(st, &wire_set);
    }
}

/// Marks the functions that never read a wire service, so the runner can skip
/// createWireServices for them.
fn mark_singleton_services_only(st: &mut State, wire_services: &HashSet<String>) {
    let keys: Vec<String> = st.functions.meta.keys().into_iter().map(String::from).collect();
    for k in keys {
        let meta = st.functions.meta.get_mut(&k).unwrap();
        let uses_wire = meta.services.services.iter().any(|s| wire_services.contains(s));
        meta.singleton_services_only = if meta.services.optimized && !uses_wire { Some(true) } else { None };
    }
}

fn is_internal(s: &str) -> bool {
    matches!(s, "rpc" | "mcp" | "channel" | "userSession")
}

fn is_default(s: &str) -> bool {
    matches!(s, "config" | "logger" | "variables" | "schema" | "secrets")
}

const AGGREGATE_HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

/// `services.services` of a `{services: {services: [...]}}`-shaped value:
/// `None` when the list is absent or null.
pub fn services_list(v: &V) -> Option<Vec<String>> {
    let s = v.get("services");
    if !s.is_obj() {
        return None;
    }
    let l = s.get("services");
    if !l.is_arr() {
        return None;
    }
    Some(l.items().iter().map(|x| x.template_string()).collect())
}

type WireRefTuple = (String, String, Option<String>);

fn typed_refs(refs: &[WireRef]) -> Vec<WireRefTuple> {
    refs.iter().map(|r| (r.ty.clone(), r.tag.clone(), if r.route.is_empty() { None } else { Some(r.route.clone()) })).collect()
}

/// A Raw wiring's `middleware` list (MiddlewareMetadata entries).
fn raw_refs(wiring: &V) -> Vec<WireRefTuple> {
    wiring
        .get("middleware")
        .items()
        .iter()
        .map(|r| {
            (
                r.get("type").as_str().unwrap_or("").to_string(),
                r.get("tag").as_str().unwrap_or("").to_string(),
                r.get("route").as_str().map(String::from),
            )
        })
        .collect()
}

fn add_list(required: &mut Set, services: &[String]) {
    for s in services {
        if !is_internal(s) {
            required.add(s.clone());
        }
    }
}


fn to_kebab(s: &str) -> String {
    utils::to_kebab(s)
}

/// Collects every service the wired functions, middleware, permissions and
/// implicit platform features need into serviceAggregation.requiredServices.
pub fn aggregate_required_services(st: &mut State) {
    extract_all_services(st);

    let mut required = std::mem::take(&mut st.service_aggregation.required_services);

    {
        let expand_groups = |required: &mut Set, st: &State, list: &[WireRefTuple]| {
            for (ty, tag, route) in list {
                if ty == "tag" {
                    if let Some(g) = st.middleware.tag_middleware.get(tag) {
                        add_list(required, &g.services.services);
                    }
                } else if ty == "http" {
                    if let Some(route) = route {
                        if let Some(g) = st.http.route_middleware.get(route) {
                            add_list(required, &g.services.services);
                        }
                    }
                }
            }
        };

        // 1. Services from used functions.
        for id in st.service_aggregation.used_functions.values() {
            if let Some(meta) = st.functions.meta.get(id) {
                add_list(&mut required, &meta.services.services);
            }
        }

        // 1b. The auth factory's services, from the definition.
        if let Some(def) = &st.auth.definition {
            add_list(&mut required, &def.services.services);
        }

        // 2. Used middleware.
        for name in st.service_aggregation.used_middleware.values() {
            if let Some(d) = st.middleware.definitions.get(name) {
                add_list(&mut required, &d.services.services);
            }
        }

        // 3. Used permissions.
        for name in st.service_aggregation.used_permissions.values() {
            if let Some(d) = st.permissions.definitions.get(name) {
                add_list(&mut required, &d.services.services);
            }
        }

        // 3b. Global permissions and global middleware apply to every function.
        for g in &st.permissions.global {
            for id in &g.definition_ids {
                if let Some(d) = st.permissions.definitions.get(id) {
                    add_list(&mut required, &d.services.services);
                }
            }
        }
        for (id, instance) in st.middleware.instances.iter() {
            if !id.starts_with("global:") {
                continue;
            }
            if let Some(d) = st.middleware.definitions.get(&instance.definition_id) {
                add_list(&mut required, &d.services.services);
            }
        }

        // 4. Tag and HTTP-pattern middleware groups the wirings use.
        for method in AGGREGATE_HTTP_METHODS {
            let Some(routes) = st.http.meta.get(method) else { continue };
            for (_, route) in routes.iter() {
                expand_groups(&mut required, st, &typed_refs(&route.middleware));
            }
        }
        let raw_wirings = |required: &mut Set, values: Vec<V>| {
            for w in values {
                expand_groups(required, st, &raw_refs(&w));
            }
        };
        raw_wirings(&mut required, st.channels.meta.iter().map(|(_, r)| jv(r)).collect());
        for (_, q) in st.queue_workers.meta.iter() {
            expand_groups(&mut required, st, &typed_refs(&q.middleware));
        }
        raw_wirings(&mut required, st.scheduled_tasks.meta.iter().map(|(_, r)| jv(r)).collect());
        raw_wirings(&mut required, st.mcp_endpoints.tools_meta.iter().map(|(_, r)| jv(r)).collect());
        raw_wirings(&mut required, st.mcp_endpoints.prompts_meta.iter().map(|(_, r)| jv(r)).collect());
        raw_wirings(&mut required, st.mcp_endpoints.resources_meta.iter().map(|(_, r)| jv(r)).collect());

        // 5. Services from wire service factories.
        for (_, services) in st.wire_services_meta.iter() {
            add_list(&mut required, services);
        }
    }

    // 6. Implicit platform services.
    let has_workflows = st.workflows.graph_meta.len() > 0
        || st.workflows.meta.len() > 0
        || st
            .functions
            .meta
            .keys()
            .iter()
            .any(|id| id.starts_with("workflowStart:") || id.starts_with("workflowStatus:") || id.starts_with("workflow:"));
    if has_workflows {
        for s in ["workflowService", "workflowRunService", "schedulerService", "queueService"] {
            required.add(s);
        }
    }

    let mut has_webhook_sources = false;
    if let Some(sources) = &st.triggers.webhook_source_meta {
        for (_, r) in sources.iter() {
            let src = jv(r);
            if st.functions.meta.has(&format!("http:{}:{}", src.get("method").template_string(), src.get("route").template_string())) {
                has_webhook_sources = true;
            }
        }
    }
    let wires_incoming_webhooks = has_webhook_sources || st.functions.meta.has("queue:pikku-incoming-webhooks");
    if wires_incoming_webhooks {
        required.add("incomingWebhookService");
        required.add("queueService");
    }

    // 6b. Synthetic queue workers for workflow graph steps.
    let graphs: Vec<V> = st.workflows.graph_meta.iter().map(|(_, r)| jv(r)).collect();
    for graph in graphs {
        let nodes = graph.get("nodes");
        let name = graph.get("name").as_str().unwrap_or("").to_string();
        if !nodes.truthy() || name.is_empty() {
            continue;
        }
        if graph.get("source").is_str("scenario") {
            continue;
        }
        let orch = format!("wf-orchestrator-{}", to_kebab(&name));
        if !st.queue_workers.meta.has(&orch) {
            let mut w = QueueWorkerMeta { name_first: true, ..Default::default() };
            w.name = orch.clone();
            w.pikku_func_id = format!("pikkuWorkflowOrchestrator:{name}");
            st.queue_workers.meta.set(orch.as_str(), w);
        }
        for node_key in nodes.keys() {
            let n = nodes.get(&node_key);
            let rpc_name = n.get("rpcName");
            let Some(rpc_name) = rpc_name.as_str() else { continue };
            if rpc_name.is_empty() {
                continue;
            }
            let func_id: String = if let Some(v) = st.rpc.internal_meta.get(rpc_name) {
                v.clone()
            } else if let Some(v) = st.rpc.exposed_meta.get(rpc_name) {
                v.clone()
            } else {
                rpc_name.to_string()
            };
            let meta = st.functions.meta.get(&func_id).or_else(|| st.functions.meta.get(rpc_name));
            if !meta.is_some_and(|m| m.workflow_queued == Some(true)) {
                continue;
            }
            let step = format!("wf-step-{}", to_kebab(rpc_name));
            if !st.queue_workers.meta.has(&step) {
                let mut w = QueueWorkerMeta { name_first: true, ..Default::default() };
                w.name = step.clone();
                w.pikku_func_id = format!("pikkuWorkflowWorker:{rpc_name}");
                st.queue_workers.meta.set(step.as_str(), w);
            }
        }
    }

    if st.agents.agents_meta.len() > 0 {
        for s in ["agentStorage", "agentRunState", "agentRunService", "agentRunner"] {
            required.add(s);
        }
    }
    if st.channels.meta.len() > 0 {
        required.add("eventHub");
    }
    if !st.scopes.definitions.is_empty() {
        required.add("scopeService");
    }
    if !st.feature_flags.definitions.is_empty() {
        required.add("featureFlags");
    }
    if !st.analytics.is_empty() {
        required.add("analyticsService");
    }
    if !st.credentials.definitions.is_empty() {
        required.add("credentialService");
    }

    // 7. Services consumed addons need from the parent project.
    use std::collections::HashMap;
    let mut addon_fn: HashMap<String, Option<Vec<String>>> = HashMap::new();
    for (ns, fns) in st.addon_functions.iter() {
        for (id, meta) in fns.iter() {
            addon_fn.insert(format!("{ns}:{id}"), Some(meta.services.services.clone()));
        }
    }
    // An addon forwarding incomingWebhookService reads it when the app has one;
    // only the app's own webhook sources make it keep receipts.
    let read_only_if_present = |s: &str| s == "incomingWebhookService" && !wires_incoming_webhooks;
    let parent_declared: Vec<String> = st.addon_required_parent_services.clone();
    let parent_declared_set: HashSet<&String> = parent_declared.iter().collect();
    let (mut uses_addon_fn, mut addon_factory_needed) = (false, false);
    for id in st.service_aggregation.used_functions.values() {
        let Some(entry) = addon_fn.get(id) else { continue };
        uses_addon_fn = true;
        let Some(services) = entry else {
            addon_factory_needed = true;
            continue;
        };
        for s in services {
            if read_only_if_present(s) {
                continue;
            }
            if parent_declared_set.contains(s) {
                required.add(s.clone());
            } else if !is_internal(s) && !is_default(s) {
                addon_factory_needed = true;
            }
        }
    }
    if uses_addon_fn && addon_factory_needed {
        for s in &parent_declared {
            if !read_only_if_present(s) {
                required.add(s.clone());
            }
        }
    }

    // 8. An addon needs from its parent whatever its functions use minus what
    // its own factory builds.
    if st.addon_services_factory_seen {
        for (_, meta) in st.functions.meta.iter() {
            add_list(&mut required, &meta.services.services);
        }
        let created: HashSet<&String> = st.addon_created_services.iter().collect();
        let mut parent = OrderedSet::default();
        for s in &parent_declared {
            parent.add(s.clone());
        }
        for s in required.values() {
            if !created.contains(&s.to_string()) && !is_internal(s) && !is_default(s) {
                parent.add(s);
            }
        }
        st.addon_required_parent_services = parent.items;
    }

    st.service_aggregation.required_services = required;
}

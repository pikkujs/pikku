//! Port of Go `visit/util_middleware.go`: utils/middleware.ts and
//! utils/permissions.ts, plus the helpers the definition visitors
//! (add-middleware.ts, add-permission.ts, add-auth.ts,
//! add-approval-description.ts) share.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::{Map, MiddlewareDefinition, MiddlewareGroupMeta, Record, ServicesMeta, WireRef, WiresMeta};
use crate::tsutil::{self, find_property_assignment, param_at};

pub const TEMP_PREFIX: &str = "__temp_";

/// utils/middleware.ts `MiddlewareRef`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MiddlewareRef {
    pub definition_id: String,
    pub is_factory_call: bool,
}

/// The `obj.properties.find(p => isPropertyAssignment(p) && isIdentifier(p.name)
/// && p.name.text === name)?.initializer` the get*Node helpers share.
pub fn property_initializer(obj: P<Node>, name: &str) -> Option<P<Node>> {
    find_property_assignment(obj, name).and_then(|p| p.initializer())
}

/// `isInline` is `def?.exportedName === null`.
pub fn is_inline(defs: &Record<MiddlewareDefinition>, name: &str) -> Option<bool> {
    Some(defs.get(name).is_some_and(|d| d.exported_name.is_none()))
}

fn wire_refs(defs: &Record<MiddlewareDefinition>, names: &[String]) -> Vec<WireRef> {
    names
        .iter()
        .map(|n| WireRef { ty: "wire".into(), name: n.clone(), inline: is_inline(defs, n), ..Default::default() })
        .collect()
}

fn tag_refs(groups: &Map<MiddlewareGroupMeta>, tags: &[String]) -> Vec<WireRef> {
    tags.iter().filter(|t| groups.has(t)).map(|t| WireRef { ty: "tag".into(), tag: t.clone(), ..Default::default() }).collect()
}

impl Context<'_> {
    /// `extractMiddlewareRefs`.
    pub fn extract_middleware_refs(&mut self, array_node: Option<P<Node>>) -> Vec<MiddlewareRef> {
        let Some(array_node) = array_node else { return vec![] };
        if !ast::is_array_literal_expression(array_node) {
            return vec![];
        }
        let mut refs = Vec::new();
        for e in array_node.elements() {
            if ast::is_identifier(*e) {
                let mut id = self.ref_id(*e);
                if id.starts_with(TEMP_PREFIX) {
                    id = e.text().to_string();
                }
                refs.push(MiddlewareRef { definition_id: id, is_factory_call: false });
            } else if ast::is_call_expression(*e) {
                let callee = e.expression().unwrap();
                let mut id = self.ref_id(callee);
                if id.starts_with(TEMP_PREFIX) && ast::is_identifier(callee) {
                    id = callee.text().to_string();
                }
                refs.push(MiddlewareRef { definition_id: id, is_factory_call: true });
            }
        }
        refs
    }

    pub fn extract_middleware_pikku_names(&mut self, array_node: Option<P<Node>>) -> Vec<String> {
        self.extract_middleware_refs(array_node).into_iter().map(|r| r.definition_id).collect()
    }

    /// `resolveMiddleware` ports resolveMiddleware: tag groups, then the
    /// explicit `middleware: [...]` entries.
    pub fn resolve_middleware(&mut self, obj: P<Node>, tags: Option<&[String]>) -> Vec<WireRef> {
        let mut out = tag_refs(&self.state.middleware.tag_middleware, tags.unwrap_or(&[]));
        if let Some(node) = property_initializer(obj, "middleware") {
            let names = self.extract_middleware_pikku_names(Some(node));
            out.extend(wire_refs(&self.state.middleware.definitions, &names));
        }
        out
    }

    /// `resolveHTTPMiddleware` ports resolveHTTPMiddlewareFromObject: matching
    /// addHTTPMiddleware patterns first, then resolveMiddleware.
    pub fn resolve_http_middleware(&mut self, route: &str, obj: P<Node>, tags: Option<&[String]>) -> Vec<WireRef> {
        let mut out = Vec::new();
        for pattern in self.state.http.route_middleware.keys() {
            if tsutil::route_matches_pattern(route, pattern) {
                out.push(WireRef { ty: "http".into(), route: pattern.to_string(), ..Default::default() });
            }
        }
        out.extend(self.resolve_middleware(obj, tags));
        out
    }

    /// `resolveChannelMiddleware`.
    pub fn resolve_channel_middleware(&mut self, obj: P<Node>, tags: Option<&[String]>) -> Vec<WireRef> {
        let mut out = tag_refs(&self.state.channel_middleware.tag_middleware, tags.unwrap_or(&[]));
        if let Some(node) = property_initializer(obj, "channelMiddleware") {
            let names = self.extract_middleware_pikku_names(Some(node));
            out.extend(wire_refs(&self.state.channel_middleware.definitions, &names));
        }
        out
    }

    /// `resolveAgentMiddleware`.
    pub fn resolve_agent_middleware(&mut self, obj: P<Node>) -> Vec<WireRef> {
        let Some(node) = property_initializer(obj, "agentMiddleware") else { return vec![] };
        let names = self.extract_middleware_pikku_names(Some(node));
        wire_refs(&self.state.agent_middleware.definitions, &names)
    }

    /// `extractPermissionPikkuNames` ports utils/permissions.ts: an array, or a
    /// record whose values are permissions or arrays of them.
    pub fn extract_permission_pikku_names(&mut self, node: P<Node>) -> Vec<String> {
        let mut names = Vec::new();
        if ast::is_array_literal_expression(node) {
            for e in node.elements() {
                self.extract_permission_name(*e, &mut names);
            }
        } else if ast::is_object_literal_expression(node) {
            for prop in node.properties() {
                if ast::is_property_assignment(*prop) {
                    self.extract_permission_name(prop.initializer().unwrap(), &mut names);
                } else if ast::is_shorthand_property_assignment(*prop) {
                    self.extract_permission_name(prop.name().unwrap(), &mut names);
                }
            }
        }
        names
    }

    fn extract_permission_name(&mut self, e: P<Node>, names: &mut Vec<String>) {
        if ast::is_identifier(e) {
            names.push(self.ref_id(e));
        } else if ast::is_call_expression(e) {
            names.push(self.ref_id(e.expression().unwrap()));
        } else if ast::is_array_literal_expression(e) {
            for x in e.elements() {
                self.extract_permission_name(*x, names);
            }
        }
    }

    /// `resolvePermissions`: the explicit `permissions` references, flattened.
    pub fn resolve_permissions(&mut self, obj: P<Node>) -> Vec<WireRef> {
        let Some(node) = property_initializer(obj, "permissions") else { return vec![] };
        let names = self.extract_permission_pikku_names(node);
        wire_refs(&self.state.permissions.definitions, &names)
    }

    /// `definitionId` is extractFunctionName(node) with the `__temp_` fallback
    /// every definition visitor applies: the name of the variable or property
    /// the call is assigned to. `None` (and the TS error logged) when there is
    /// none. Returns `(id, exportedName)`.
    pub fn definition_id(&mut self, node: P<Node>, wrapper: &str, example: &str) -> Option<(String, String)> {
        let r = self.extract_function_name(node);
        let mut id = r.pikku_func_id;
        if id.starts_with(TEMP_PREFIX) {
            let parent = node.parent();
            match parent {
                Some(p) if ast::is_variable_declaration(p) && p.name().is_some_and(ast::is_identifier) => {
                    id = p.name().unwrap().text().to_string();
                }
                Some(p) if ast::is_property_assignment(p) && p.name().is_some_and(ast::is_identifier) => {
                    id = p.name().unwrap().text().to_string();
                }
                _ => {
                    self.log.error(format!(
                        "• {wrapper}() must be assigned to a variable or object property. Extract it to a const: const {example} = {wrapper}(...)"
                    ));
                    return None;
                }
            }
        }
        Some((id, r.exported_name))
    }

    /// `findCall` is the `findPikkuXCall` walk: the first call in pre-order, node
    /// itself included, that resolves to `callee` among the helpers `is_known`
    /// names.
    pub fn find_call(&mut self, node: P<Node>, is_known: &dyn Fn(&str) -> bool, callee: &str) -> Option<P<Node>> {
        if ast::is_call_expression(node) && self.resolve_callee_name(node, is_known) == callee {
            return Some(node);
        }
        let mut found = None;
        node.for_each_child(&mut |c| {
            found = self.find_call(c, is_known, callee);
            found.is_some()
        });
        found
    }
}

/// `servicesOf` ports utils/extract-services.ts extractServicesFromFunction.
pub fn services_of(f: P<Node>) -> ServicesMeta {
    let mut m = ServicesMeta { optimized: true, services: vec![] };
    let Some(p) = param_at(f, 0) else { return m };
    let name = p.name().unwrap();
    if ast::is_object_binding_pattern(name) {
        m.services.extend(tsutil::binding_names(p));
    } else if ast::is_identifier(name) && !name.text().starts_with('_') {
        m.optimized = false;
    }
    m
}

/// `wiresOrNil` is `wires.wires.length > 0 || !wires.optimized ? wires : undefined`.
pub fn wires_or_nil(w: WiresMeta) -> Option<WiresMeta> {
    if !w.wires.is_empty() || !w.optimized { Some(w) } else { None }
}

/// `nullableString` is a `string | null` that TS writes as null when empty.
pub fn nullable_string(v: &str) -> Option<String> {
    if v.is_empty() { None } else { Some(v.to_string()) }
}

/// `stringProp` is `typeof getPropertyValue(obj, name) === 'string' ? v : undefined`.
pub fn string_prop(obj: P<Node>, name: &str) -> Option<String> {
    tsutil::get_property_value(obj, name).str
}

/// `joinServices`.
pub fn join_services(m: &ServicesMeta) -> String {
    m.services.join(", ")
}

#[allow(dead_code)]
fn _codes() -> &'static str {
    codes::MISSING_FUNC
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_helpers() {
        assert_eq!(wires_or_nil(WiresMeta { optimized: true, wires: vec![] }), None);
        assert!(wires_or_nil(WiresMeta { optimized: false, wires: vec![] }).is_some());
        assert_eq!(nullable_string(""), None);
        assert_eq!(join_services(&ServicesMeta { optimized: true, services: vec!["a".into(), "b".into()] }), "a, b");
    }

    #[test]
    fn inline_means_no_exported_name() {
        let mut defs = Record::new();
        defs.set("a", MiddlewareDefinition { exported_name: None, ..Default::default() });
        defs.set("b", MiddlewareDefinition { exported_name: Some("b".into()), ..Default::default() });
        assert_eq!(is_inline(&defs, "a"), Some(true));
        assert_eq!(is_inline(&defs, "b"), Some(false));
        assert_eq!(is_inline(&defs, "missing"), Some(false));
    }
}

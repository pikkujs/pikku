//! Port of Go `visit/group_permission.go`: add/add-permission.ts —
//! pikkuPermission, pikkuAuth and pikkuPermissionFactory definitions, and
//! addGlobalPermission registrations.

use tsrs_ast::{self as ast, ModifierFlags, Node, SymbolFlags};
use tsrs_core::P;

use super::group_middleware::{describe, name_and_description};
use super::util_callee::{is_permission_helper, unwrap_expression};
use super::util_channel_cli::{is_temp_id, make_context_based_id};
use super::util_middleware::{join_services, nullable_string, services_of, wires_or_nil};
use super::util_props::extract_used_wires;
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::{GlobalPermissionRegistration, MiddlewareDefinition, ServicesMeta, WiresMeta};
use crate::tsutil::{self, file_name_of, source_file_of, start_utf16};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addPermission",
        phase: Phase::Setup,
        order: order::ADD_PERMISSION,
        visit: |c, n| c.add_permission(n),
    });
}

fn is_immediately_invoked(f: P<Node>) -> bool {
    let mut cur = f;
    while let Some(p) = cur.parent().filter(|p| ast::is_parenthesized_expression(*p)) {
        cur = p;
    }
    cur.parent().is_some_and(|p| ast::is_call_expression(p) && p.expression() == Some(cur))
}

impl Context<'_> {
    fn is_inside_permission_container(&mut self, node: P<Node>) -> bool {
        let mut cur = node.parent();
        while let Some(c) = cur {
            if ast::is_call_expression(c) && self.resolve_callee_name(c, &is_permission_helper) == "pikkuPermissionFactory" {
                return true;
            }
            cur = c.parent();
        }
        false
    }

    pub fn add_permission(&mut self, node: P<Node>) {
        match self.resolve_callee_name(node, &is_permission_helper).as_str() {
            "pikkuPermission" => self.add_permission_definition(node, false),
            "pikkuAuth" => self.add_permission_definition(node, true),
            "pikkuPermissionFactory" => self.add_permission_factory(node),
            "addGlobalPermission" => self.add_global_permission(node),
            _ => {}
        }
    }

    /// `addPermissionDefinition` handles pikkuPermission and pikkuAuth.
    /// pikkuAuth's second parameter is the session, not a wires bag, and it
    /// never needs data.
    fn add_permission_definition(&mut self, node: P<Node>, is_auth: bool) {
        if self.is_inside_permission_container(node) {
            return;
        }
        let (wrapper, example) = if is_auth { ("pikkuAuth", "myAuth") } else { ("pikkuPermission", "myPermission") };
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let arg = args[0];
        let (handler, name, description);
        if ast::is_object_literal_expression(arg) {
            (name, description) = name_and_description(arg);
            let f = self.get_property_assignment_initializer(arg, "func", true).filter(|f| tsutil::is_function_like(*f));
            let Some(f) = f else {
                self.log.error(format!("• {wrapper} object missing required 'func' property."));
                return;
            };
            handler = f;
        } else if tsutil::is_function_like(arg) {
            handler = arg;
            name = None;
            description = None;
        } else {
            self.log.error(format!("• Handler for {wrapper} is not a function."));
            return;
        }

        let services = services_of(handler);
        let wires = if is_auth { WiresMeta { optimized: true, wires: vec![] } } else { extract_used_wires(handler, 2) };
        let Some((id, exported_name)) = self.permission_definition_id(node, wrapper, example) else { return };

        let mut requires_data = true;
        if is_auth {
            requires_data = false;
        } else if let Some(p) = tsutil::param_at(handler, 1) {
            if p.name().is_some_and(|n| ast::is_identifier(n) && n.text().starts_with('_')) {
                requires_data = false;
            }
        }
        let def = MiddlewareDefinition {
            services: services.clone(),
            wires: wires_or_nil(wires),
            source_file: file_name_of(node).to_string(),
            position: start_utf16(node) as i64,
            exported_name: nullable_string(&exported_name),
            name: name.clone(),
            description: description.clone(),
            requires_data: if requires_data { None } else { Some(false) },
            ..Default::default()
        };
        self.state.permissions.definitions.set(id, def);

        if is_auth {
            self.log.debug(format!("• Found auth permission with services: {}{}", join_services(&services), describe(&name, &description)));
            return;
        }
        let auth_only = if requires_data { "" } else { " (auth-only)" };
        self.log.debug(format!(
            "• Found permission with services: {}{}{}",
            join_services(&services),
            describe(&name, &description),
            auth_only
        ));
    }

    fn add_permission_factory(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let factory = args[0];
        if !tsutil::is_function_like(factory) {
            self.log.error("• Handler for pikkuPermissionFactory is not a function.");
            return;
        }
        let mut services = ServicesMeta { optimized: false, services: vec![] };
        let mut wires = WiresMeta { optimized: true, wires: vec![] };
        let call = self.find_call(factory, &is_permission_helper, "pikkuPermission").filter(|c| !c.arguments().is_empty());
        if let Some(call) = call {
            let h = call.arguments()[0];
            if tsutil::is_function_like(h) {
                services = services_of(h);
                wires = extract_used_wires(h, 2);
            }
        } else if let Some(body) = factory.body().filter(|b| tsutil::is_function_like(*b)) {
            services = services_of(body);
            wires = extract_used_wires(body, 2);
        }
        let Some((id, exported_name)) = self.definition_id(node, "pikkuPermissionFactory", "myPermission") else { return };
        self.state.permissions.definitions.set(
            id,
            MiddlewareDefinition {
                services: services.clone(),
                wires: wires_or_nil(wires),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                factory: Some(true),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found permission factory with services: {}", join_services(&services)));
    }

    /// `permissionDefinitionId` is definitionId, except that a permission
    /// written inline in an addGlobalPermission([...]) array is named after
    /// where it sits.
    fn permission_definition_id(&mut self, node: P<Node>, wrapper: &str, example: &str) -> Option<(String, String)> {
        let r = self.extract_function_name(node);
        if is_temp_id(&r.pikku_func_id) {
            if let Some(id) = self.inline_global_permission_id(node) {
                return Some((id, r.exported_name));
            }
        }
        self.definition_id(node, wrapper, example)
    }

    /// `inlineGlobalPermissionId`: derived from where the permission sits, so
    /// the registration and the definition agree on it without either having to
    /// be visited first.
    fn inline_global_permission_id(&mut self, node: P<Node>) -> Option<String> {
        let array = node.parent().filter(|a| ast::is_array_literal_expression(*a))?;
        let call = array.parent().filter(|c| ast::is_call_expression(*c))?;
        let args = call.arguments();
        if args.is_empty() || args[0] != array || self.resolve_callee_name(call, &is_permission_helper) != "addGlobalPermission" {
            return None;
        }
        let rel = tsutil::rel_path(&self.root_dir, file_name_of(node)).unwrap_or_default();
        Some(make_context_based_id("global", &["permission", &rel, &start_utf16(node).to_string()]))
    }

    /// `resolvePermissionLiteral`: addGlobalPermission's argument followed to
    /// the array or object literal it was written as, through const
    /// declarations here or imported, or `None`.
    fn resolve_permission_literal(&mut self, argument: P<Node>) -> Option<P<Node>> {
        let mut cur = Some(unwrap_expression(argument));
        let mut hops = 0;
        while hops < 8 {
            let c = cur?;
            if ast::is_array_literal_expression(c) || ast::is_object_literal_expression(c) {
                return Some(c);
            }
            if !ast::is_identifier(c) {
                return None;
            }
            let mut sym = self.symbol_at(c);
            if let Some(s) = sym {
                if s.flags().intersects(SymbolFlags::Alias) {
                    sym = Some(self.checker.get_aliased_symbol(s));
                }
            }
            let sym = sym?;
            let d = sym.value_declaration()?;
            if !ast::is_variable_declaration(d) {
                return None;
            }
            let init = d.initializer()?;
            cur = Some(unwrap_expression(init));
            hops += 1;
        }
        None
    }

    fn is_named_exported_function(&mut self, decl: P<Node>) -> bool {
        if decl.name().is_none() {
            return false;
        }
        let flags = ast::get_combined_modifier_flags(decl);
        if flags.intersects(ModifierFlags::Default) {
            return false;
        }
        if flags.intersects(ModifierFlags::Export) {
            return true;
        }
        let sf = source_file_of(decl);
        let mod_sym = self.checker.get_symbol_at_location_exported(sf.as_node());
        let sym = self.checker.get_symbol_at_location_exported(decl.name().unwrap());
        let (Some(mod_sym), Some(sym)) = (mod_sym, sym) else { return false };
        for exp in self.checker.get_exports_of_module_exported(mod_sym) {
            let resolved = self.resolve_alias(Some(exp));
            if resolved == Some(sym) {
                return true;
            }
        }
        false
    }

    /// `globalPermissionActivation`: how the generated permissions file makes
    /// the call run. `None` when nothing ever calls it; otherwise the factory to
    /// call when importing is not enough ("" when it is).
    fn global_permission_activation(&mut self, call: P<Node>) -> Option<String> {
        let mut cur = call.parent();
        while let Some(c) = cur {
            if ast::is_source_file(c) {
                break;
            }
            let fnlike = ast::is_arrow_function(c)
                || ast::is_function_expression(c)
                || ast::is_function_declaration(c)
                || ast::is_method_declaration(c)
                || ast::is_constructor_declaration(c)
                || ast::is_get_accessor_declaration(c)
                || ast::is_set_accessor_declaration(c);
            if !fnlike || is_immediately_invoked(c) {
                cur = c.parent();
                continue;
            }
            if !c.parameters().is_empty() {
                return None;
            }
            if ast::is_arrow_function(c) || ast::is_function_expression(c) {
                let p = c.parent().unwrap();
                if ast::is_variable_declaration(p) && p.name().is_some_and(ast::is_identifier) && self.is_named_export(p) {
                    return Some(p.name().unwrap().text().to_string());
                }
            }
            if ast::is_function_declaration(c) && c.name().is_some() && self.is_named_exported_function(c) {
                return Some(c.name().unwrap().text().to_string());
            }
            return None;
        }
        Some(String::new())
    }

    fn global_permission_entry_id(&mut self, entry: P<Node>) -> Vec<String> {
        if ast::is_identifier(entry) {
            let r = self.extract_function_name(entry);
            if !is_temp_id(&r.pikku_func_id) {
                return vec![r.pikku_func_id];
            }
            return vec![entry.text().to_string()];
        }
        if ast::is_call_expression(entry) {
            if let Some(id) = self.inline_global_permission_id(entry) {
                return vec![id];
            }
            if let Some(p) = entry.parent() {
                if ast::is_property_assignment(p)
                    && p.name().is_some_and(ast::is_identifier)
                    && !self.resolve_callee_name(entry, &is_permission_helper).is_empty()
                {
                    return vec![p.name().unwrap().text().to_string()];
                }
            }
            let callee = entry.expression().unwrap();
            let r = self.extract_function_name(callee);
            if is_temp_id(&r.pikku_func_id) && ast::is_identifier(callee) {
                return vec![callee.text().to_string()];
            }
            return vec![r.pikku_func_id];
        }
        vec![]
    }

    fn add_global_permission(&mut self, node: P<Node>) {
        let source_file = file_name_of(node).to_string();
        let mut entries: Vec<P<Node>> = Vec::new();
        let args = node.arguments();
        let literal = if args.is_empty() { None } else { self.resolve_permission_literal(args[0]) };
        match literal {
            None => {
                self.log.warn(format!("• addGlobalPermission(...) in {source_file} is not given an array or object it can follow to a literal, so the services its permissions use cannot be seen."));
            }
            Some(l) if ast::is_array_literal_expression(l) => entries.extend(l.elements().iter().copied()),
            Some(l) => {
                for p in l.properties() {
                    if ast::is_property_assignment(*p) {
                        entries.push(p.initializer().unwrap());
                    } else if ast::is_shorthand_property_assignment(*p) {
                        entries.push(p.name().unwrap());
                    }
                }
            }
        }

        let mut definition_ids: Vec<String> = Vec::new();
        for e in entries {
            definition_ids.extend(self.global_permission_entry_id(e));
        }

        let Some(export_name) = self.global_permission_activation(node) else {
            self.log.warn(format!("• addGlobalPermission(...) in {source_file} sits inside a function that nothing calls: only a call at the top level, or inside an exported function with no parameters, is run by the generated permissions file. This global permission is NOT registered. Export it as `export const name = () => {{ addGlobalPermission(...) }}` or move it to the top level."));
            return;
        };

        let position = start_utf16(node) as i64;
        let known = self.state.permissions.global.iter().any(|g| g.source_file == source_file && g.position == position);
        if !known {
            self.state.permissions.global.push(GlobalPermissionRegistration {
                source_file: source_file.clone(),
                position,
                export_name: nullable_string(&export_name),
                definition_ids: definition_ids.clone(),
            });
        }
        self.log.debug(format!("• Found global permissions in {source_file}: [{}]", definition_ids.join(", ")));
    }
}

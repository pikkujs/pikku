//! Port of Go `visit/util_names.go`: utils/extract-function-name.ts (the paths
//! addFunctions and the middleware/permission resolvers reach).

use sha1::{Digest, Sha1};
use tsrs_ast::{self as ast, Node, NodeFlags, Symbol, SymbolFlags};
use tsrs_core::P;

use super::Context;
use super::util_channel_cli::is_workflow_helper;
use crate::tsutil::{self, file_name_of, first_decl, has_export_modifier, is_function_like, is_pikku_call, rel_path, source_file_of};

/// Go `extractedName`.
#[derive(Clone, Debug, Default)]
pub struct ExtractedName {
    pub pikku_func_id: String,
    pub name: String,
    pub explicit_name: String,
    pub exported_name: String,
    pub property_name: String,
    /// 0 = none.
    pub version: i64,
    /// The function is a workflow helper call (`workflow('name')`,
    /// `workflowStart`, `workflowStatus`, `graphStart`).
    pub is_helper: bool,
}

const SCENARIO_STEP_WRAPPERS: [&str; 3] = ["pikkuScenarioStep", "pikkuPlatformScenarioStep", "pikkuAddonScenarioStep"];

impl Context<'_> {
    /// `tempFuncId`: `__temp_` + sha1 of `<path relative to rootDir>:<UTF-16 start>`.
    pub fn temp_func_id(&self, n: P<Node>) -> String {
        let sf = source_file_of(n);
        let rel = rel_path(&self.root_dir, sf.file_name()).unwrap_or_default();
        // TS hashes the UTF-16 offset; tsrs positions are UTF-8 byte offsets.
        let off = tsutil::utf16_offset(sf.text(), tsutil::node_start(n));
        let sum = Sha1::digest(format!("{rel}:{off}").as_bytes());
        let hex: String = sum.iter().map(|b| format!("{b:02x}")).collect();
        format!("__temp_{}", &hex[..16])
    }

    /// `GetSymbolAtLocation`.
    pub fn symbol_at(&mut self, n: P<Node>) -> Option<P<Symbol>> {
        self.checker.get_symbol_at_location_exported(n)
    }

    /// `resolveAlias`: follows an alias symbol to its target.
    pub fn resolve_alias(&mut self, sym: Option<P<Symbol>>) -> Option<P<Symbol>> {
        if let Some(s) = sym {
            if s.flags().intersects(SymbolFlags::Alias) {
                return Some(self.checker.get_aliased_symbol(s));
            }
        }
        sym
    }

    /// `isNamedExport`.
    pub fn is_named_export(&mut self, decl: P<Node>) -> bool {
        let Some(parent) = decl.parent() else { return false };
        if ast::is_variable_declaration_list(parent) {
            let Some(stmt) = parent.parent() else { return false };
            if ast::is_variable_statement(stmt) && has_export_modifier(stmt) {
                return true;
            }
        }
        let Some(name) = decl.name() else { return false };
        if !ast::is_identifier(name) {
            return false;
        }
        let sf = source_file_of(decl);
        let mut mod_sym = self.checker.get_symbol_at_location_exported(sf.as_node());
        if mod_sym.is_none() {
            mod_sym = sf.as_node().symbol();
        }
        let Some(mod_sym) = mod_sym else { return false };
        let Some(decl_sym) = self.checker.get_symbol_at_location_exported(name) else { return false };
        for exp in self.checker.get_exports_of_module_exported(mod_sym) {
            if self.resolve_alias(Some(exp)) == Some(decl_sym) {
                return true;
            }
        }
        false
    }

    /// `exportedNameOfDecl` handles the `func: someFunc` / shorthand resolution:
    /// variable initialised to pikkuX(fn) or a function, or a function
    /// declaration. Returns `(name, ok)`.
    pub fn exported_name_of_decl(&mut self, decl: Option<P<Node>>) -> (String, bool) {
        let Some(decl) = decl else { return (String::new(), false) };
        if ast::is_variable_declaration(decl) {
            if let Some(init) = decl.initializer() {
                if is_pikku_call(init) {
                    let args = init.arguments();
                    if !args.is_empty() && is_function_like(args[0]) {
                        if self.is_named_export(decl) && ast::is_identifier(decl.name().unwrap()) {
                            return (decl.name().unwrap().text().to_string(), true);
                        }
                        return (String::new(), true);
                    }
                    return (String::new(), false);
                }
                if is_function_like(init) {
                    if self.is_named_export(decl) && ast::is_identifier(decl.name().unwrap()) {
                        return (decl.name().unwrap().text().to_string(), true);
                    }
                    return (String::new(), true);
                }
                return (String::new(), false);
            }
        }
        if ast::is_function_declaration(decl) {
            if has_export_modifier(decl) {
                if let Some(n) = decl.name() {
                    return (n.text().to_string(), true);
                }
            }
            return (String::new(), true);
        }
        (String::new(), false)
    }

    /// `extractFunctionName`.
    pub fn extract_function_name(&mut self, call_expr: P<Node>) -> ExtractedName {
        let mut r = ExtractedName::default();
        let parent = call_expr.parent();
        let is_call = ast::is_call_expression(call_expr);
        let callee_ident = if is_call { call_expr.expression().filter(|e| ast::is_identifier(*e)) } else { None };

        if let Some(ce) = callee_ident {
            if SCENARIO_STEP_WRAPPERS.contains(&ce.text()) {
                let args = call_expr.arguments();
                if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                    for p in args[0].properties() {
                        if ast::is_property_assignment(*p)
                            && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "name")
                            && ast::is_string_literal(p.initializer().unwrap())
                        {
                            r.explicit_name = p.initializer().unwrap().text().to_string();
                            break;
                        }
                    }
                }
            }
        }

        if let Some(ce) = callee_ident {
            if is_workflow_helper(ce.text()) {
                let helper = ce.text();
                let args = call_expr.arguments();
                if !args.is_empty() && ast::is_string_literal(args[0]) {
                    let mut id = format!("{helper}:{}", args[0].text());
                    if helper == "graphStart" && args.len() > 1 && ast::is_string_literal(args[1]) {
                        id = format!("{helper}:{}:{}", args[0].text(), args[1].text());
                    }
                    r.pikku_func_id = id.clone();
                    r.name = id.clone();
                    r.explicit_name = id;
                    r.is_helper = true;
                    return r;
                }
            }
        }

        // (The wireHTTP identifier special case is not ported: the general path
        // below gives the same id.)

        if is_call {
            let args = call_expr.arguments();
            if is_pikku_call(call_expr) && !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                extract_override_and_version(args[0], &mut r);
            }
            if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                for p in args[0].properties() {
                    if ast::is_property_assignment(*p)
                        && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "func")
                    {
                        let init = p.initializer().unwrap();
                        if ast::is_identifier(init) {
                            if let Some(sym) = self.symbol_at(init) {
                                let resolved = self.resolve_alias(Some(sym));
                                let (name, ok) = self.exported_name_of_decl(first_decl(resolved));
                                if ok && !name.is_empty() {
                                    r.exported_name = name;
                                }
                            }
                        }
                        break;
                    }
                    if ast::is_shorthand_property_assignment(*p) && p.name().unwrap().text() == "func" {
                        if let Some(sym) = self.checker.get_shorthand_assignment_value_symbol(Some(*p)) {
                            let (name, ok) = self.exported_name_of_decl(first_decl(Some(sym)));
                            if ok {
                                if !name.is_empty() {
                                    r.exported_name = name;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        } else if ast::is_identifier(call_expr) {
            if let Some(sym) = self.symbol_at(call_expr) {
                let resolved = self.resolve_alias(Some(sym));
                let decl = first_decl(resolved);
                match decl {
                    Some(d) if ast::is_variable_declaration(d) && d.initializer().is_some() => {
                        let init = d.initializer().unwrap();
                        if is_pikku_call(init) {
                            let a = init.arguments();
                            if !a.is_empty() && ast::is_object_literal_expression(a[0]) {
                                extract_override_and_version(a[0], &mut r);
                            }
                            if self.is_named_export(d) && ast::is_identifier(d.name().unwrap()) {
                                r.exported_name = d.name().unwrap().text().to_string();
                            }
                        } else if is_function_like(init) {
                            if self.is_named_export(d) && ast::is_identifier(d.name().unwrap()) {
                                r.exported_name = d.name().unwrap().text().to_string();
                            }
                        }
                    }
                    Some(d) if ast::is_function_declaration(d) => {
                        if has_export_modifier(d) {
                            if let Some(n) = d.name() {
                                r.exported_name = n.text().to_string();
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        if let Some(parent) = parent {
            if ast::is_variable_declaration(parent) && parent.name().is_some_and(ast::is_identifier) {
                if self.is_named_export(parent) {
                    r.exported_name = parent.name().unwrap().text().to_string();
                }
            } else if (ast::is_property_assignment(parent) || ast::is_shorthand_property_assignment(parent))
                && parent.name().is_some_and(ast::is_identifier)
            {
                r.property_name = parent.name().unwrap().text().to_string();
            } else if is_call {
                let args = call_expr.arguments();
                if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                    extract_override_and_version(args[0], &mut r);
                }
            }
        }

        r.pikku_func_id = if !r.explicit_name.is_empty() {
            r.explicit_name.clone()
        } else if !r.exported_name.is_empty() {
            r.exported_name.clone()
        } else {
            self.temp_func_id(call_expr)
        };
        // populateNameByPriority
        r.name = r.pikku_func_id.clone();
        if !r.explicit_name.is_empty() {
            r.name = r.explicit_name.clone();
        } else if !r.exported_name.is_empty() {
            r.name = r.exported_name.clone();
        }

        if r.version != 0 {
            let suffix = format!("V{}", r.version);
            if r.pikku_func_id.ends_with(&suffix) && r.pikku_func_id.len() > suffix.len() {
                r.pikku_func_id.truncate(r.pikku_func_id.len() - suffix.len());
            }
            r.pikku_func_id = tsutil::format_versioned_id(&r.pikku_func_id, r.version);
        }
        r
    }

    /// `refId`.
    pub fn ref_id(&mut self, n: P<Node>) -> String {
        self.extract_function_name(n).pikku_func_id
    }
}

fn extract_override_and_version(obj: P<Node>, r: &mut ExtractedName) {
    for p in obj.properties() {
        if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
            continue;
        }
        let init = p.initializer().unwrap();
        match p.name().unwrap().text() {
            "override" => {
                if ast::is_string_literal(init) && r.explicit_name.is_empty() {
                    r.explicit_name = init.text().to_string();
                }
            }
            "version" => {
                if ast::is_numeric_literal(init) && r.version == 0 {
                    if let Ok(v) = init.text().trim().parse::<f64>() {
                        if v >= 1.0 && v == v.trunc() {
                            r.version = v as i64;
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

#[allow(dead_code)]
fn _unused(_: NodeFlags, _: &str) {
    let _ = file_name_of;
}

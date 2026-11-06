//! Port of Go `visit/util_props.go`: utils/get-property-value.ts,
//! utils/type-utils.ts, utils/extract-function-node.ts,
//! utils/extract-services.ts, utils/middleware.ts, utils/permissions.ts and the
//! body collectors.

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::Context;
use crate::state::WiresMeta;
use crate::tsutil::{self, first_decl, is_function_like, node_text, param_at};

/// Go `commonMeta`: what getCommonWireMetaData reads off a wiring object.
#[derive(Clone, Debug, Default)]
pub struct CommonMeta {
    pub disabled: bool,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub errors: Vec<String>,
    pub has_tags: bool,
    pub has_errors: bool,
}

impl CommonMeta {
    /// `tagsOrNil` is the tags resolveMiddleware takes: undefined when absent.
    pub fn tags_or_nil(&self) -> Option<&[String]> {
        if self.has_tags { Some(&self.tags) } else { None }
    }
}

impl Context<'_> {
    /// `extractStringLiteral`: `None` is Go's `errNotStatic`.
    pub fn extract_string_literal(&mut self, n: P<Node>) -> Option<String> {
        if ast::is_string_literal(n) || ast::is_no_substitution_template_literal(n) {
            return Some(n.text().to_string());
        }
        if ast::is_template_expression(n) {
            let te = n.as_template_expression();
            let mut out = te.head().text().to_string();
            for span in te.template_spans().nodes() {
                let ts = span.as_template_span();
                out.push_str("${");
                out.push_str(node_text(span.expression().unwrap()));
                out.push('}');
                out.push_str(ts.literal().text());
            }
            return Some(out);
        }
        if tsutil::is_as_expression(n) || n.kind() == Kind::TypeAssertionExpression {
            return self.extract_string_literal(n.expression().unwrap());
        }
        if ast::is_binary_expression(n) && n.as_binary_expression().operator_token().kind() == Kind::PlusToken {
            let be = n.as_binary_expression();
            let l = self.concat_operand(be.left());
            let r = self.concat_operand(be.right());
            return Some(l + &r);
        }
        if ast::is_identifier(n) {
            if let Some(sym) = self.symbol_at(n) {
                if let Some(vd) = sym.value_declaration() {
                    if ast::is_variable_declaration(vd) {
                        if let Some(init) = vd.initializer() {
                            return self.extract_string_literal(init);
                        }
                    }
                }
            }
        }
        None
    }

    fn concat_operand(&mut self, n: P<Node>) -> String {
        if let Some(v) = self.extract_string_literal(n) {
            return v;
        }
        let inner = if ast::is_parenthesized_expression(n) { n.expression().unwrap() } else { n };
        format!("${{{}}}", node_text(inner))
    }

    /// `getCommonWireMetaData`.
    pub fn get_common_wire_meta_data(&mut self, obj: P<Node>) -> CommonMeta {
        let mut m = CommonMeta::default();
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "disabled" => {
                    if init.kind() == Kind::TrueKeyword {
                        m.disabled = true;
                    } else if (ast::is_string_literal(init) || ast::is_no_substitution_template_literal(init))
                        && !init.text().is_empty()
                    {
                        m.disabled = true;
                    }
                }
                "title" => {
                    if let Some(v) = self.extract_string_literal(init) {
                        m.title = Some(v);
                    }
                }
                "summary" => {
                    if let Some(v) = self.extract_string_literal(init) {
                        m.summary = Some(v);
                    }
                }
                "description" => {
                    if let Some(v) = self.extract_string_literal(init) {
                        m.description = Some(v);
                    }
                }
                "tags" => {
                    if ast::is_array_literal_expression(init) {
                        m.has_tags = true;
                        m.tags = init
                            .elements()
                            .iter()
                            .filter(|e| ast::is_string_literal(**e))
                            .map(|e| e.text().to_string())
                            .collect();
                    }
                }
                "errors" => {
                    if ast::is_array_literal_expression(init) {
                        m.has_errors = true;
                        m.errors = init
                            .elements()
                            .iter()
                            .filter(|e| ast::is_identifier(**e))
                            .map(|e| e.text().to_string())
                            .collect();
                    }
                }
                _ => {}
            }
        }
        m
    }

    /// `getPropertyAssignmentInitializer`.
    pub fn get_property_assignment_initializer(&mut self, obj: P<Node>, name: &str, follow_shorthand: bool) -> Option<P<Node>> {
        for p in obj.properties() {
            let p = *p;
            if ast::is_property_assignment(p) && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == name) {
                return p.initializer();
            }
            if ast::is_method_declaration(p) && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == name) {
                return p.name();
            }
            if follow_shorthand && ast::is_shorthand_property_assignment(p) && p.name().unwrap().text() == name {
                let value_sym = self.checker.get_shorthand_assignment_value_symbol(Some(p));
                let sym = self.resolve_alias(value_sym);
                let decl = first_decl(sym);
                if let Some(d) = decl {
                    if ast::is_variable_declaration(d) {
                        if let Some(init) = d.initializer() {
                            if is_function_like(init) || ast::is_call_expression(init) {
                                return Some(init);
                            }
                        }
                    }
                    if ast::is_function_declaration(d) || is_function_like(d) {
                        return Some(d);
                    }
                }
                return p.name();
            }
        }
        None
    }

    /// `resolveFunctionDeclaration`.
    pub fn resolve_function_declaration(&mut self, n: P<Node>) -> Option<P<Node>> {
        if ast::is_function_declaration(n) || is_function_like(n) {
            return Some(n);
        }
        if ast::is_call_expression(n) && !n.arguments().is_empty() {
            let a = n.arguments()[0];
            if is_function_like(a) {
                return Some(a);
            }
        }
        if ast::is_identifier(n) {
            let sym = self.symbol_at(n)?;
            let decl = sym.value_declaration().or_else(|| first_decl(Some(sym)))?;
            if ast::is_import_specifier(decl) {
                let aliased = self.checker.get_aliased_symbol(sym);
                if let Some(ad) = aliased.value_declaration().or_else(|| first_decl(Some(aliased))) {
                    if ast::is_variable_declaration(ad) {
                        if let Some(init) = ad.initializer() {
                            return self.resolve_function_declaration(init);
                        }
                    }
                    if ast::is_function_declaration(ad) {
                        return Some(ad);
                    }
                }
            }
            if ast::is_variable_declaration(decl) {
                if let Some(init) = decl.initializer() {
                    return self.resolve_function_declaration(init);
                }
            }
            if ast::is_function_declaration(decl) {
                return Some(decl);
            }
        }
        None
    }

    /// `extractFunctionNode`: `(funcNode, resolved, isDirect)`.
    pub fn extract_function_node(&mut self, first_arg: P<Node>) -> (P<Node>, Option<P<Node>>, bool) {
        let mut func_node = first_arg;
        let mut is_direct = true;
        if ast::is_object_literal_expression(first_arg) {
            is_direct = false;
            for k in ["func", "default", "browser", "cli"] {
                if let Some(init) = self.get_property_assignment_initializer(first_arg, k, true) {
                    func_node = init;
                    break;
                }
            }
        }
        if ast::is_identifier(func_node) {
            if let Some(sym) = self.symbol_at(func_node) {
                if let Some(decl) = sym.value_declaration().or_else(|| first_decl(Some(sym))) {
                    if ast::is_variable_declaration(decl) {
                        if let Some(init) = decl.initializer() {
                            func_node = init;
                        }
                    }
                }
            }
        }
        let resolved = self.resolve_function_declaration(func_node);
        (func_node, resolved, is_direct)
    }
}

/// `extractUsedWires`.
pub fn extract_used_wires(f: P<Node>, idx: usize) -> WiresMeta {
    let p = param_at(f, idx);
    if let Some(p) = p {
        let name = p.name().unwrap();
        if ast::is_object_binding_pattern(name) {
            return WiresMeta { optimized: true, wires: tsutil::binding_names(p) };
        }
        if ast::is_identifier(name) && !name.text().starts_with('_') {
            return WiresMeta { optimized: false, wires: vec![] };
        }
    }
    WiresMeta { optimized: true, wires: vec![] }
}

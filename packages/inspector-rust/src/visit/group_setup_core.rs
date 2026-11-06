//! Port of Go `visit/group_setup_core.go`: add/add-file-extends-core-type.ts and
//! add/add-file-with-factory.ts.

use tsrs_ast::{self as ast, Node, Symbol};
use tsrs_core::P;

use super::order;
use super::util_props;
use super::{Context, CoreType, Phase, Registry, Visitor};
use crate::diag::codes;
use crate::state::{NameAndType, PathToNameAndType, State};
use crate::tsutil::{self, file_name_of, first_decl, node_text, param_at};

type Pick = fn(&mut State) -> &mut PathToNameAndType;

macro_rules! core_visitor {
    ($fn_name:ident, $type_name:literal, $field:ident) => {
        fn $fn_name(c: &mut Context<'_>, n: P<Node>) {
            c.add_file_extends_core_type(n, |s| &mut s.$field, $type_name);
        }
    };
}
core_visitor!(visit_core_singleton_services, "CoreSingletonServices", singleton_services_type_import_map);
core_visitor!(visit_core_services, "CoreServices", wire_services_type_import_map);
core_visitor!(visit_core_user_session, "CoreUserSession", user_session_type_import_map);
core_visitor!(visit_core_config, "CoreConfig", config_type_import_map);

macro_rules! factory_visitor {
    ($fn_name:ident, $type_name:literal, $with_state:literal, $field:ident) => {
        fn $fn_name(c: &mut Context<'_>, n: P<Node>) {
            c.add_file_with_factory(n, |s| &mut s.$field, $type_name, $with_state);
        }
    };
}
factory_visitor!(visit_create_singleton_services, "CreateSingletonServices", true, singleton_services_factories);
factory_visitor!(visit_create_wire_services, "CreateWireServices", true, wire_services_factories);
factory_visitor!(visit_create_config, "CreateConfig", false, config_factories);
factory_visitor!(visit_server_lifecycle, "ServerLifecycle", false, server_lifecycle_factories);

/// Registers the setup-phase core type and factory visitors.
pub fn register(r: &mut Registry) {
    let core = [
        (order::CORE_SINGLETON_SERVICES, "CoreSingletonServices", visit_core_singleton_services as fn(&mut Context<'_>, P<Node>)),
        (order::CORE_SERVICES, "CoreServices", visit_core_services),
        (order::CORE_USER_SESSION, "CoreUserSession", visit_core_user_session),
        (order::CORE_CONFIG, "CoreConfig", visit_core_config),
    ];
    for (o, name, f) in core {
        r.register(Visitor { name: leak(format!("addFileExtendsCoreType {name}")), phase: Phase::Setup, order: o, visit: f });
    }
    let factories = [
        (order::CREATE_SINGLETON_SERVICES, "CreateSingletonServices", visit_create_singleton_services as fn(&mut Context<'_>, P<Node>)),
        (order::CREATE_WIRE_SERVICES, "CreateWireServices", visit_create_wire_services),
        (order::CREATE_CONFIG, "CreateConfig", visit_create_config),
        (order::SERVER_LIFECYCLE, "ServerLifecycle", visit_server_lifecycle),
    ];
    for (o, name, f) in factories {
        r.register(Visitor { name: leak(format!("addFileWithFactory {name}")), phase: Phase::Setup, order: o, visit: f });
    }
    r.register(Visitor {
        name: "checkHiddenFactory",
        phase: Phase::Setup,
        order: order::CHECK_HIDDEN_FACTORY,
        visit: |c, n| c.check_hidden_factory(n),
    });
}

fn leak(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

fn append_name_and_type(m: &mut PathToNameAndType, file: &str, e: NameAndType) {
    let mut vars = m.get(file).cloned().unwrap_or_default();
    vars.push(e);
    m.set(file, vars);
}

/// `declarationPath`: the file of a symbol's first declaration.
fn declaration_path(sym: Option<P<Symbol>>) -> Option<String> {
    first_decl(sym).map(|d| file_name_of(d).to_string())
}

const WRAPPER_FACTORY_TYPES: [(&str, &str); 7] = [
    ("pikkuConfig", "CreateConfig"),
    ("pikkuAddonConfig", "CreateConfig"),
    ("pikkuServices", "CreateSingletonServices"),
    ("pikkuAddonServices", "CreateSingletonServices"),
    ("pikkuWireServices", "CreateWireServices"),
    ("pikkuAddonWireServices", "CreateWireServices"),
    ("pikkuServerLifecycle", "ServerLifecycle"),
];

fn wrapper_factory_type(wrapper: &str) -> Option<&'static str> {
    WRAPPER_FACTORY_TYPES.iter().find(|(w, _)| *w == wrapper).map(|(_, t)| *t)
}

/// `describeFactoryCast` is how a cast around a factory call reads in PKU564:
/// the form, and what to remove. `None` for anything but a cast.
fn describe_factory_cast(n: P<Node>) -> Option<(&'static str, &'static str)> {
    if tsutil::is_as_expression(n) {
        Some(("an `as` cast", "the cast"))
    } else if n.kind() == ast::Kind::TypeAssertionExpression {
        Some(("a `<T>` cast", "the cast"))
    } else if ast::is_non_null_expression(n) {
        Some(("a non-null assertion (`!`)", "the `!`"))
    } else {
        None
    }
}

/// `isTransparentWrapper`: `satisfies` and parentheses leave the value's type as
/// written, so a factory inside them is read as a direct call.
fn is_transparent_wrapper(n: Option<P<Node>>) -> bool {
    n.is_some_and(|n| ast::is_satisfies_expression(n) || ast::is_parenthesized_expression(n))
}

fn unwrap_transparent(mut n: Option<P<Node>>) -> Option<P<Node>> {
    while is_transparent_wrapper(n) {
        n = n.unwrap().expression();
    }
    n
}

fn function_node_of(n: Option<P<Node>>) -> Option<P<Node>> {
    n.filter(|n| ast::is_arrow_function(*n) || ast::is_function_expression(*n))
}

/// `extractServicesFromFunction` ports utils/extract-services.ts (services only).
fn extract_services_from_function(f: P<Node>) -> Vec<String> {
    let mut services = Vec::new();
    if let Some(p) = param_at(f, 0) {
        if ast::is_object_binding_pattern(p.name().unwrap()) {
            services.extend(tsutil::binding_names(p));
        }
    }
    services
}

impl Context<'_> {
    pub fn add_file_extends_core_type(&mut self, node: P<Node>, pick: Pick, expected: &str) {
        if !ast::is_class_declaration(node) && !ast::is_interface_declaration(node) {
            return;
        }
        let file_name = file_name_of(node);
        let type_name = node.name().map(node_text).unwrap_or("");
        for t in ast::get_extends_heritage_clause_elements(node) {
            // tsrs parses interface heritage elements as type references where
            // Strada/typescript-go use ExpressionWithTypeArguments; the helper
            // returns the name expression of either.
            let expr = ast::get_heritage_clause_element_name(*t);
            if node_text(expr) != expected {
                continue;
            }
            // Like the TS checker, the symbol of an imported name is the import
            // alias, so typePath is the file holding the import declaration.
            let sym = self.symbol_at(expr);
            let type_path = declaration_path(sym);
            if type_name.is_empty() {
                let kind = if ast::is_class_declaration(node) { "class" } else { "interface" };
                // TS throws here, which aborts inspection.
                self.log.error(format!(
                    "Found anonymous {kind} extending {expected} in {file_name}. Classes and interfaces that extend core types must have a name."
                ));
                return;
            }
            append_name_and_type(
                pick(self.state),
                file_name,
                NameAndType { variable: type_name.to_string(), ty: Some(type_name.to_string()), type_path },
            );
            if let Some(sym) = node.name().and_then(|n| self.symbol_at(n)) {
                self.record_core_type_properties(type_name, sym);
            }
        }
    }

    /// `recordCoreTypeProperties` stands in for `typesLookup.set(typeName,
    /// [declaredType])`. Only the symbol is kept here: resolving the type's
    /// members during the sweep would create types earlier than TS does and
    /// change union and property order elsewhere. `finish_core_type_properties`
    /// reads them at the end.
    fn record_core_type_properties(&mut self, type_name: &str, sym: P<Symbol>) {
        for e in &mut self.core_types {
            if e.name == type_name {
                e.sym = sym;
                return;
            }
        }
        self.core_types.push(CoreType { name: type_name.to_string(), sym });
    }

    /// `FinishCoreTypeProperties` fills state.coreTypeProperties: each core
    /// interface's property names, sorted: everything later readers take from
    /// those typesLookup entries (they test membership only). Sorted because
    /// typescript-go lists inherited members before own ones, TS the reverse.
    pub fn finish_core_type_properties(&mut self) {
        for ct in self.core_types.clone() {
            let t = self.checker.get_declared_type_of_symbol_exported(ct.sym);
            let mut props: Vec<String> =
                self.checker.get_properties_of_type_exported(t).iter().map(|p| p.name().to_string()).collect();
            props.sort();
            self.state.core_type_properties.get_or_insert_with(Default::default).set(ct.name.clone(), props);
        }
    }

    /// `checkHiddenFactory` ports add-file-with-factory.ts checkHiddenFactory: a
    /// factory call inside a cast (`as`, `<T>`, `!`) fails the build rather than
    /// being seen through, since the cast hides a mismatch the factory should fix.
    pub fn check_hidden_factory(&mut self, node: P<Node>) {
        if !ast::is_variable_declaration(node) || node.initializer().is_none() {
            return;
        }
        let mut inner = node.initializer();
        let (mut form, mut remove, mut cast) = ("", "", false);
        while let Some(i) = inner {
            if let Some((f, r)) = describe_factory_cast(i) {
                if !cast {
                    form = f;
                    remove = r;
                    cast = true;
                }
                inner = i.expression();
            } else if is_transparent_wrapper(Some(i)) {
                inner = i.expression();
            } else {
                break;
            }
        }
        let Some(inner) = inner else { return };
        if !cast || !ast::is_call_expression(inner) || !ast::is_identifier(inner.expression().unwrap()) {
            return;
        }
        let wrapper = inner.expression().unwrap().text();
        if wrapper_factory_type(wrapper).is_none() {
            return;
        }
        let pos = self.node_position(node);
        self.log.critical(
            codes::FACTORY_NOT_A_DIRECT_CALL,
            format!(
                "'{}' at {} wraps {}(...) in {}. The inspector reads a factory only from a direct {}(...) call, so this one would not be registered and nothing it provides would exist at runtime. Remove {}, and fix the type mismatch it hides in the factory itself.",
                node_text(node.name().unwrap()),
                pos,
                wrapper,
                form,
                wrapper,
                remove
            ),
        );
    }

    pub fn add_file_with_factory(&mut self, node: P<Node>, pick: Pick, expected: &str, with_state: bool) {
        if !ast::is_variable_declaration(node) {
            return;
        }
        let file_name = file_name_of(node);
        let variable_name = node_text(node.name().unwrap());
        let init = unwrap_transparent(node.initializer());

        if let Some(init) = init {
            if ast::is_call_expression(init) && ast::is_identifier(init.expression().unwrap()) {
                let callee = init.expression().unwrap();
                let wrapper = callee.text();
                if wrapper_factory_type(wrapper) == Some(expected) {
                    let sym = self.symbol_at(callee);
                    let type_path = declaration_path(sym);
                    append_name_and_type(
                        pick(self.state),
                        file_name,
                        NameAndType { variable: variable_name.to_string(), ty: Some(expected.to_string()), type_path },
                    );
                    if with_state && !init.arguments().is_empty() {
                        let f = function_node_of(Some(init.arguments()[0]));
                        if let Some(f) = f {
                            if expected == "CreateWireServices" {
                                self.state.wire_services_meta.set(variable_name, extract_services_from_function(f));
                            }
                            if wrapper == "pikkuAddonServices" || wrapper == "pikkuAddonWireServices" {
                                self.state.addon_services_factory_seen = true;
                                let idx = if wrapper == "pikkuAddonWireServices" { 0 } else { 1 };
                                let forwarded = tsutil::dedupe(&extract_forwarded_services(f, idx));
                                self.state.addon_required_parent_services.extend(forwarded.iter().cloned());
                                for name in extract_returned_services(f) {
                                    if !forwarded.contains(&name) {
                                        self.state.addon_created_services.push(name);
                                    }
                                }
                            }
                        }
                    }
                    return;
                }
            }
        }

        let Some(type_node) = node.type_node() else { return };
        if !ast::is_type_reference_node(type_node) {
            return;
        }
        let type_name = type_node.as_type_reference_node().type_name();
        let ident = if ast::is_identifier(type_name) && type_name.text() == expected {
            type_name
        } else if ast::is_qualified_name(type_name) && type_name.as_qualified_name().right().text() == expected {
            type_name.as_qualified_name().right()
        } else {
            return;
        };
        let sym = self.symbol_at(ident);
        append_name_and_type(
            pick(self.state),
            file_name,
            NameAndType {
                variable: variable_name.to_string(),
                ty: Some(node_text(type_name).to_string()),
                type_path: declaration_path(sym),
            },
        );
        if expected == "CreateWireServices" && with_state {
            if let Some(f) = function_node_of(node.initializer()) {
                self.state.wire_services_meta.set(variable_name, extract_services_from_function(f));
            }
        }
    }
}

/// `extractForwardedServices`: the names an addon factory destructures off the
/// parent's services parameter, in the parameter list or from a
/// `const { … } = <param>` in the body (not descending into callbacks that
/// shadow the parameter).
fn extract_forwarded_services(f: P<Node>, param_index: usize) -> Vec<String> {
    let mut forwarded: Vec<String> = Vec::new();
    let Some(param) = param_at(f, param_index) else { return forwarded };
    fn collect(pattern: P<Node>, forwarded: &mut Vec<String>) {
        for e in pattern.elements() {
            if e.as_binding_element().dot_dot_dot_token().is_some() {
                continue;
            }
            let pn = e.property_name();
            let name = e.name();
            match (pn, name) {
                (Some(pn), _) if ast::is_identifier(pn) => forwarded.push(pn.text().to_string()),
                (None, Some(n)) if ast::is_identifier(n) => forwarded.push(n.text().to_string()),
                // propertyName that is not an identifier (string/computed):
                // TS falls back to the local name.
                (Some(_), Some(n)) if ast::is_identifier(n) => forwarded.push(n.text().to_string()),
                _ => {}
            }
        }
    }
    let pname = param.name().unwrap();
    if ast::is_object_binding_pattern(pname) {
        collect(pname, &mut forwarded);
        return forwarded;
    }
    if !ast::is_identifier(pname) {
        return forwarded;
    }
    let param_name = pname.text();
    let Some(body) = f.body() else { return forwarded };
    if !ast::is_block(body) {
        return forwarded;
    }
    fn binds_name(n: P<Node>, name: &str) -> bool {
        if ast::is_identifier(n) {
            return n.text() == name;
        }
        n.elements().iter().any(|e| !ast::is_omitted_expression(*e) && e.name().is_some_and(|x| binds_name(x, name)))
    }
    fn shadows(n: P<Node>, name: &str) -> bool {
        if !ast::is_function_like(n) {
            return false;
        }
        n.parameters().iter().any(|p| binds_name(p.name().unwrap(), name))
    }
    fn visit(n: P<Node>, param_name: &str, forwarded: &mut Vec<String>) {
        if ast::is_variable_declaration(n)
            && n.name().is_some_and(ast::is_object_binding_pattern)
            && n.initializer().is_some_and(|i| ast::is_identifier(i) && i.text() == param_name)
        {
            collect(n.name().unwrap(), forwarded);
            return;
        }
        if shadows(n, param_name) {
            return;
        }
        n.for_each_child(&mut |c| {
            visit(c, param_name, forwarded);
            false
        });
    }
    body.for_each_child(&mut |c| {
        visit(c, param_name, &mut forwarded);
        false
    });
    forwarded
}

/// `extractReturnedServices`: property names of the object literals the factory
/// returns, skipping spreads and nested functions.
fn extract_returned_services(f: P<Node>) -> Vec<String> {
    let mut returned: Vec<String> = Vec::new();
    fn collect(mut e: P<Node>, returned: &mut Vec<String>) {
        while ast::is_parenthesized_expression(e) {
            e = e.expression().unwrap();
        }
        if !ast::is_object_literal_expression(e) {
            return;
        }
        for p in e.properties() {
            if ast::is_spread_assignment(*p) {
                continue;
            }
            if let Some(n) = p.name() {
                if ast::is_identifier(n) || ast::is_string_literal(n) {
                    returned.push(n.text().to_string());
                }
            }
        }
    }
    let Some(body) = f.body() else { return returned };
    if !ast::is_block(body) {
        collect(body, &mut returned);
        return returned;
    }
    fn visit(n: P<Node>, returned: &mut Vec<String>) {
        if ast::is_function_declaration(n) || ast::is_function_expression(n) || ast::is_arrow_function(n) {
            return;
        }
        if ast::is_return_statement(n) {
            if let Some(e) = n.expression() {
                collect(e, returned);
            }
        }
        n.for_each_child(&mut |c| {
            visit(c, returned);
            false
        });
    }
    body.for_each_child(&mut |c| {
        visit(c, &mut returned);
        false
    });
    returned
}

#[allow(dead_code)]
fn _u() {
    let _ = util_props::extract_used_wires;
}

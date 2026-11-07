//! Port of Go `internal/tsjg/generator/generator.go`: wires the parser and
//! formatter chains into schema generation (src/SchemaGenerator.ts).
//!
//! pikku changes carried over from the Go copy: `find_named_node` builds its
//! project and all-files indexes once per generator, and a missing root type
//! is a [`GenError::Rootless`] so callers can tell it from other failures.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use tsrs_ast::{Kind, Node, SourceFile};
use tsrs_core::P;

use super::config::{Config, Expose, JsDocMode};
use super::formatter::TypeFormatter;
use super::parser::{Chk, Context, NodeParser};
use super::schema::{self, Def, Definition};
use super::types::{Ty, TypeKind};
use super::{catch, tsutils};

/// Why a schema could not be generated.
#[derive(Debug)]
pub enum GenError {
    /// The requested type name has no declaration (Go `*RootlessError`).
    Rootless(String),
    Other(String),
}

impl GenError {
    pub fn message(&self) -> String {
        match self {
            GenError::Rootless(n) => format!("no root type {n:?} found"),
            GenError::Other(m) => m.clone(),
        }
    }
}

/// An insertion-ordered node map (the `Map` used upstream).
#[derive(Clone, Default)]
struct OrderedNodeMap {
    keys: HashMap<String, usize>,
    values: Vec<P<Node>>,
}

impl OrderedNodeMap {
    fn set(&mut self, key: String, node: P<Node>) {
        if let Some(&i) = self.keys.get(&key) {
            self.values[i] = node;
            return;
        }
        self.keys.insert(key, self.values.len());
        self.values.push(node);
    }
    fn get(&self, key: &str) -> Option<P<Node>> {
        self.keys.get(key).map(|&i| self.values[i])
    }
}

/// Generates JSON Schema from a compiled program. Not safe for concurrent use.
pub struct SchemaGenerator {
    source_files: Vec<P<SourceFile>>,
    root_file_names: Vec<String>,
    type_checker: Chk,
    node_parser: Rc<dyn NodeParser>,
    type_formatter: Rc<dyn TypeFormatter>,
    config: Config,
    project_types: RefCell<Option<OrderedNodeMap>>,
    all_types: RefCell<Option<OrderedNodeMap>>,
}

impl SchemaGenerator {
    pub fn new(
        source_files: Vec<P<SourceFile>>,
        root_file_names: Vec<String>,
        type_checker: Chk,
        node_parser: Rc<dyn NodeParser>,
        type_formatter: Rc<dyn TypeFormatter>,
        config: Config,
    ) -> SchemaGenerator {
        SchemaGenerator {
            source_files,
            root_file_names,
            type_checker,
            node_parser,
            type_formatter,
            config,
            project_types: RefCell::new(None),
            all_types: RefCell::new(None),
        }
    }

    /// Generates a schema for the named types ("*" or empty means all exported
    /// root types). Failures raised by the parser/formatter pipeline are
    /// returned as errors.
    pub fn create_schema(&self, full_names: &[String]) -> Result<Def, GenError> {
        let root_nodes = self.root_nodes(full_names)?;
        catch(|| self.create_schema_from_nodes(&root_nodes)).map_err(GenError::Other)
    }

    fn create_schema_from_nodes(&self, root_nodes: &[P<Node>]) -> Def {
        let root_types: Vec<Ty> =
            root_nodes.iter().map(|n| self.node_parser.create_type(Some(*n), &Context::new(None), None)).collect();
        let root_type_definitions: Vec<Def> = root_types.iter().map(|t| self.type_formatter.get_definition(t)).collect();

        let mut definitions: HashMap<String, Def> = HashMap::new();
        for root_type in &root_types {
            self.append_root_child_definitions(root_type, &mut definitions);
        }

        // Object.assign over each root's reachable set: a name keeps the
        // position it was first given.
        let mut reachable: HashMap<String, Def> = HashMap::new();
        let mut order: Vec<String> = Vec::new();
        for d in &root_type_definitions {
            for name in schema::remove_unreachable(Some(d), &definitions) {
                if !reachable.contains_key(&name) {
                    order.push(name.clone());
                }
                reachable.insert(name.clone(), definitions[&name].clone());
            }
        }

        let mut out = Definition {
            id: self.config.schema_id.clone(),
            schema: "http://json-schema.org/draft-07/schema#".to_string(),
            ..Definition::default()
        };
        if root_type_definitions.len() == 1 {
            let mut merged = root_type_definitions[0].borrow().clone();
            merged.id = out.id.clone();
            merged.schema = out.schema.clone();
            out = merged;
        }
        out.definitions = Some(reachable);
        out.definition_order = order;
        schema::def(out)
    }

    fn append_root_child_definitions(&self, root_type: &Ty, child_definitions: &mut HashMap<String, Def>) {
        let mut seen = std::collections::HashSet::new();
        let mut children: Vec<Ty> = Vec::new();
        for child in self.type_formatter.get_children(root_type) {
            if matches!(&*child, TypeKind::Definition(_)) && seen.insert(child.id()) {
                children.push(child);
            }
        }

        let mut ids: HashMap<String, String> = HashMap::new();
        let mut base_ids: HashMap<String, String> = HashMap::new();
        for child in &children {
            let TypeKind::Definition(d) = &**child else { continue };
            let name = child.name();
            // DefinitionType IDs are prefixed with def-; nested definitions for
            // generic types stack prefixes, so strip them all when comparing.
            let child_id = child.id().replace("def-", "");
            let mut inner = d.ty.clone();
            if let TypeKind::Annotated(a) = &*d.ty {
                inner = a.ty.clone();
            }
            let base_child_id = inner.id();
            if let Some(prev) = ids.get(&name) {
                if &child_id != prev {
                    // Same base type with different annotations is not a conflict.
                    if base_ids.get(&name) == Some(&base_child_id) {
                        continue;
                    }
                    super::fail(&format!("type {name:?} has multiple definitions"));
                }
            }
            ids.insert(name.clone(), child_id);
            base_ids.insert(name, base_child_id);
        }

        for child in &children {
            let TypeKind::Definition(d) = &**child else { continue };
            let name = child.name();
            if !child_definitions.contains_key(&name) {
                child_definitions.insert(name, self.type_formatter.get_definition(&d.ty));
            }
        }
    }

    /// Resolves the requested type names to their AST nodes.
    fn root_nodes(&self, full_names: &[String]) -> Result<Vec<P<Node>>, GenError> {
        let star = full_names.iter().any(|n| n == "*");
        if star && full_names.len() > 1 {
            return Err(GenError::Other("cannot mix '*' with specific type names".into()));
        }
        let generate_all = full_names.is_empty() || star;

        if !generate_all {
            return full_names.iter().map(|n| self.find_named_node(n)).collect();
        }

        let root_source_files: Vec<P<SourceFile>> = self
            .source_files
            .iter()
            .filter(|sf| self.root_file_names.iter().any(|r| r == sf.file_name()))
            .copied()
            .collect();
        let mut root_nodes = OrderedNodeMap::default();
        self.append_types(&root_source_files, &mut root_nodes);
        Ok(root_nodes.values)
    }

    fn find_named_node(&self, full_name: &str) -> Result<P<Node>, GenError> {
        let (project_files, external_files) = self.partition_files();

        if self.project_types.borrow().is_none() {
            let mut m = OrderedNodeMap::default();
            self.append_types(&project_files, &mut m);
            *self.project_types.borrow_mut() = Some(m);
        }
        if let Some(n) = self.project_types.borrow().as_ref().and_then(|m| m.get(full_name)) {
            return Ok(n);
        }

        if self.all_types.borrow().is_none() {
            let mut m = self.project_types.borrow().clone().unwrap_or_default();
            self.append_types(&external_files, &mut m);
            *self.all_types.borrow_mut() = Some(m);
        }
        if let Some(n) = self.all_types.borrow().as_ref().and_then(|m| m.get(full_name)) {
            return Ok(n);
        }

        Err(GenError::Rootless(full_name.to_string()))
    }

    fn partition_files(&self) -> (Vec<P<SourceFile>>, Vec<P<SourceFile>>) {
        self.source_files.iter().partition(|sf| !sf.file_name().contains("/node_modules/"))
    }

    fn append_types(&self, source_files: &[P<SourceFile>], all_types: &mut OrderedNodeMap) {
        for sf in source_files {
            self.inspect_node(sf.as_node(), all_types);
        }
    }

    fn inspect_node(&self, node: P<Node>, all_types: &mut OrderedNodeMap) {
        match node.kind() {
            Kind::VariableDeclaration => {
                if let Some(init) = node.as_variable_declaration().initializer() {
                    if init.kind() == Kind::ArrowFunction || init.kind() == Kind::FunctionExpression {
                        self.inspect_node(init, all_types);
                    }
                }
                return;
            }
            Kind::InterfaceDeclaration | Kind::ClassDeclaration | Kind::EnumDeclaration | Kind::TypeAliasDeclaration => {
                if (self.config.expose == Expose::All || self.is_export_type(node)) && !is_generic_type(node) {
                    all_types.set(self.full_name(node), node);
                }
                return;
            }
            Kind::FunctionDeclaration | Kind::FunctionExpression | Kind::ArrowFunction | Kind::ConstructorType => {
                all_types.set(self.full_name(node), node);
                return;
            }
            Kind::ExportSpecifier => {
                let symbol = self.type_checker.with(|c| c.get_export_specifier_local_target_symbol(node));
                let Some(symbol) = symbol else { return };
                if symbol.declarations().len() != 1 {
                    return;
                }
                let declaration = symbol.declarations()[0];
                if declaration.kind() == Kind::ImportSpecifier {
                    // `import { Foo } from "./lib"; export { Foo };`
                    let typ = self.type_checker.with(|c| c.get_type_at_location(declaration));
                    if let Some(type_symbol) = typ.symbol() {
                        if type_symbol.declarations().len() == 1 {
                            self.inspect_node(type_symbol.declarations()[0], all_types);
                        }
                    }
                } else {
                    // `export { Bar } from './lib';`
                    self.inspect_node(declaration, all_types);
                }
                return;
            }
            Kind::ExportDeclaration => {
                let decl = node.as_export_declaration();
                if let Some(clause) = decl.export_clause() {
                    // export { Foo } from './lib' or export { Foo };
                    clause.for_each_child(&mut |sub| {
                        self.inspect_node(sub, all_types);
                        false
                    });
                    return;
                }
                let Some(spec) = decl.module_specifier() else { return };
                // export * from './lib'
                let Some(symbol) = self.type_checker.with(|c| c.get_symbol_at_location_exported(spec)) else { return };
                for source in symbol.declarations() {
                    let Some(source_symbol) = self.type_checker.with(|c| c.get_symbol_at_location_exported(*source)) else {
                        return;
                    };
                    let exports = self.type_checker.with(|c| c.get_exports_of_module_exported(source_symbol));
                    for module_export in exports {
                        let mut nodes: Vec<P<Node>> = module_export.declarations().to_vec();
                        if nodes.is_empty() {
                            if let Some(v) = module_export.value_declaration() {
                                nodes = vec![v];
                            }
                        }
                        if nodes.is_empty() {
                            return;
                        }
                        for sub in nodes {
                            self.inspect_node(sub, all_types);
                        }
                    }
                }
                return;
            }
            _ => {}
        }
        node.for_each_child(&mut |sub| {
            self.inspect_node(sub, all_types);
            false
        });
    }

    fn is_export_type(&self, node: P<Node>) -> bool {
        if self.config.js_doc != JsDocMode::None && tsutils::has_jsdoc_tag(node, "internal") {
            return false;
        }
        node.local_symbol().is_some_and(|s| s.export_symbol().is_some())
    }

    fn full_name(&self, node: P<Node>) -> String {
        let name = match tsutils::symbol_at_node(node) {
            Some(s) => self.type_checker.with(|c| c.get_fully_qualified_name_exported(s)),
            None => String::new(),
        };
        if name.starts_with('"') {
            if let Some(idx) = name.find("\".") {
                return name[idx + 2..].to_string();
            }
        }
        name
    }
}

fn is_generic_type(node: P<Node>) -> bool {
    match node.kind() {
        Kind::InterfaceDeclaration | Kind::ClassDeclaration | Kind::TypeAliasDeclaration => !node.type_parameters().is_empty(),
        _ => false,
    }
}

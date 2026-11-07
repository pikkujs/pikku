//! Port of Go `visit/group_cli.go`: add/add-cli.ts (`addCLI` and
//! `addCLIRenderers`).
//!
//! Program, command and option metadata are ordered JS objects whose keys
//! follow the source order of the wiring's properties, so they are built as
//! ordered records ([`JsObject`]) rather than structs.

use serde_json::Value;
use tsrs_ast::{self as ast, Kind, Node, Symbol};
use tsrs_checker::{LiteralValue, Type, TypeFlags};
use tsrs_core::P;

use super::util_channel_cli::{is_temp_id, line_and_character, make_context_based_id, raw_object, resolve_ref_contract, rewrite_func_id_raw};
use super::util_middleware::services_of;
use super::util_shared::{JsObject, strs_value};
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::{Raw, Record, State};
use crate::tsutil::{self, file_name_of, sort_strings_js, source_file_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addCLI", phase: Phase::Routes, order: order::ADD_CLI, visit: |c, n| c.add_cli(n) });
    r.register(Visitor { name: "addCLIRenderers", phase: Phase::Routes, order: order::ADD_CLI_RENDERERS, visit: |c, n| c.add_cli_renderers(n) });
}

/// Go `cliPositional`.
#[derive(Clone, Debug, PartialEq)]
pub struct CliPositional {
    pub name: String,
    pub required: bool,
    pub variadic: bool,
}

impl CliPositional {
    fn value(&self) -> Value {
        let mut o = JsObject::new();
        o.set_str("name", &self.name);
        o.set("required", Some(Value::Bool(self.required)));
        if self.variadic {
            o.set("variadic", Some(Value::Bool(true)));
        }
        o.into_value()
    }
}

/// Go `cliProgram`: the fields processCommands needs from its program.
#[derive(Clone, Debug, Default)]
struct CliProgram {
    name: String,
    tags: Vec<String>,
}

fn record_value(r: &Record<Raw>) -> Value {
    serde_json::to_value(r).expect("record serialises")
}

fn cli_property_name(p: P<Node>) -> Option<String> {
    let n = p.name()?;
    if ast::is_identifier(n) || ast::is_string_literal(n) { Some(n.text().to_string()) } else { None }
}

/// Go `parseCommandPattern` (add-cli.ts).
pub fn parse_command_pattern(pattern: &str) -> Result<Vec<CliPositional>, String> {
    let mut positionals = Vec::new();
    for part in pattern.split(' ') {
        if part.trim().is_empty() {
            continue;
        }
        let (name, required) = if part.starts_with('<') && part.ends_with('>') && part.len() >= 2 {
            (&part[1..part.len() - 1], true)
        } else if part.starts_with('[') && part.ends_with(']') && part.len() >= 2 {
            (&part[1..part.len() - 1], false)
        } else {
            return Err(format!(
                "Invalid parameters pattern '{pattern}': found literal word '{part}'. Parameters should only contain <required> or [optional] arguments. Example: \"<env> [region]\" or \"<files...>\""
            ));
        };
        if let Some(stripped) = name.strip_suffix("...") {
            positionals.push(CliPositional { name: stripped.to_string(), required, variadic: true });
        } else {
            positionals.push(CliPositional { name: name.to_string(), required, variadic: false });
        }
    }
    Ok(positionals)
}

fn enum_members_in_order(sym: P<Symbol>) -> Vec<P<Symbol>> {
    let mut out: Vec<P<Symbol>> = Vec::new();
    for d in sym.declarations() {
        if !ast::is_enum_declaration(*d) {
            continue;
        }
        for m in d.members() {
            if let Some(ms) = m.symbol() {
                if !out.contains(&ms) {
                    out.push(ms);
                }
            }
        }
    }
    out
}

fn string_literal_value(t: P<Type>) -> Option<String> {
    if !t.flags().intersects(TypeFlags::StringLiteral | TypeFlags::NumberLiteral) {
        return None;
    }
    match t.as_literal_type().value() {
        Some(LiteralValue::String(s)) => Some(s.to_string()),
        _ => None,
    }
}

impl Context<'_> {
    pub fn add_cli(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
            return;
        }
        let args = node.arguments();
        match node.expression().unwrap().text() {
            "defineCLICommands" => {
                let export_name = self.exported_variable_name_of(node);
                if !export_name.is_empty() && !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                    let cmds = self.process_cli_commands(args[0], &CliProgram { name: export_name.clone(), tags: vec![] });
                    self.state.exported_contracts.cli.set(export_name, Raw::of(record_value(&cmds)));
                }
                return;
            }
            "wireCLI" => {}
            _ => return,
        }
        if args.len() != 1 || !ast::is_object_literal_expression(args[0]) {
            return;
        }
        self.state.cli.files.add(file_name_of(node));
        let Some((name, meta)) = self.process_cli_config(args[0]) else { return };
        self.state.cli.meta.programs.set(name, meta.raw());
    }

    /// add-cli.ts processCLIConfig.
    fn process_cli_config(&mut self, obj: P<Node>) -> Option<(String, JsObject)> {
        let mut program = CliProgram::default();
        let mut meta = JsObject::new();
        meta.set("program", Some(Value::from("")));
        meta.set("commands", Some(record_value(&Record::new())));
        meta.set("options", Some(record_value(&Record::new())));

        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            match p.name().unwrap().text() {
                "program" => {
                    let init = p.initializer().unwrap();
                    if ast::is_string_literal(init) {
                        program.name = init.text().to_string();
                        meta.set_str("program", &program.name);
                    }
                }
                "tags" => program.tags = tsutil::get_property_value(obj, "tags").strs.unwrap_or_default(),
                _ => {}
            }
        }
        if program.name.is_empty() {
            return None;
        }
        if tsutil::get_property_value(obj, "disabled").bool == Some(true) {
            return None;
        }

        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "auth" => {
                    if let Some(v) = tsutil::get_property_value(obj, "auth").bool {
                        meta.set("auth", Some(Value::Bool(v)));
                    }
                }
                "commands" => {
                    if ast::is_object_literal_expression(init) {
                        let cmds = self.process_cli_commands(init, &program);
                        meta.set("commands", Some(record_value(&cmds)));
                    }
                }
                "options" => {
                    if ast::is_object_literal_expression(init) {
                        let (opts, _) = self.process_cli_options_checked(init, "");
                        meta.set("options", Some(record_value(&opts)));
                    }
                }
                "render" => {
                    let mut id = self.extract_function_name(init).pikku_func_id;
                    if is_temp_id(&id) {
                        id = make_context_based_id("cli-render", &[&program.name]);
                    }
                    meta.set_str("defaultRenderName", &id);
                }
                _ => {}
            }
        }
        Some((program.name, meta))
    }

    /// add-cli.ts processCommands.
    fn process_cli_commands(&mut self, obj: P<Node>, program: &CliProgram) -> Record<Raw> {
        let mut commands: Record<Raw> = Record::new();
        let mut default_command = String::new();
        let mut has_default = false;
        for p in obj.properties() {
            let p = *p;
            if ast::is_spread_assignment(p) {
                let expr = p.expression().unwrap();
                let mut target = Some(expr);
                if ast::is_identifier(expr) {
                    target = self.resolve_identifier(expr, &["defineCLICommands"]);
                }
                if let Some(t) = target.filter(|t| ast::is_object_literal_expression(*t)) {
                    let spread = self.process_cli_commands(t, program);
                    for (k, v) in spread.iter() {
                        commands.set(k, v.clone());
                    }
                } else if let Some(contract) = resolve_ref_contract(expr, "refCLI", &self.state.exported_contracts.addon_cli) {
                    if let Some(rec) = raw_object(&contract) {
                        for (k, v) in rec.iter() {
                            commands.set(k, v.clone());
                        }
                    }
                }
                continue;
            }
            if !ast::is_property_assignment(p) {
                continue;
            }
            let Some(name) = cli_property_name(p) else { continue };
            let Some(cmd) = self.process_cli_command(&name, p.initializer().unwrap(), program, &[]) else { continue };
            let raw = cmd.raw();
            let is_default = raw.value().and_then(|v| v.get("isDefault")) == Some(&Value::Bool(true));
            commands.set(name.clone(), raw);
            if is_default {
                if has_default {
                    let sf = source_file_of(p);
                    let (line, ch) = line_and_character(p);
                    // TS throws here, which aborts inspection.
                    self.log.error(format!(
                        "Multiple default commands found in CLI program \"{}\" at {}:{}:{}.\nCommands \"{}\" and \"{}\" are both marked as default.\nOnly one command can be marked as default per program.",
                        program.name,
                        sf.file_name(),
                        line + 1,
                        ch + 1,
                        default_command,
                        name
                    ));
                    return commands;
                }
                default_command = name;
                has_default = true;
            }
        }
        commands
    }

    fn new_cli_command(pikku_func_id: &str) -> JsObject {
        let mut cmd = JsObject::new();
        cmd.set_str("pikkuFuncId", pikku_func_id);
        cmd.set("positionals", Some(Value::Array(vec![])));
        cmd.set("options", Some(record_value(&Record::new())));
        cmd
    }

    /// add-cli.ts processCommand.
    fn process_cli_command(&mut self, name: &str, node: P<Node>, program: &CliProgram, parent_path: &[String]) -> Option<JsObject> {
        let mut full_path: Vec<String> = parent_path.to_vec();
        full_path.push(name.to_string());
        let program_and_path = || -> Vec<&str> {
            let mut v = vec![program.name.as_str()];
            v.extend(full_path.iter().map(|s| s.as_str()));
            v
        };

        if ast::is_identifier(node) || ast::is_arrow_function(node) || ast::is_function_expression(node) {
            let mut id = self.extract_function_name(node).pikku_func_id;
            if is_temp_id(&id) {
                id = make_context_based_id("cli", &program_and_path());
            }
            return Some(Self::new_cli_command(&id));
        }
        if ast::is_call_expression(node) {
            let callee = node.expression().unwrap();
            if ast::is_identifier(callee) && callee.text() == "pikkuCLICommand" {
                let a = node.arguments();
                if !a.is_empty() && ast::is_object_literal_expression(a[0]) {
                    return self.process_cli_command(name, a[0], program, parent_path);
                }
            }
            return None;
        }
        if !ast::is_object_literal_expression(node) {
            return None;
        }

        let mut meta = Self::new_cli_command("");
        let mut pikku_func_id = String::new();
        let mut options_node: Option<P<Node>> = None;
        let mut tags: Vec<String> = Vec::new();

        for p in node.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "func" => {
                    if ast::is_call_expression(init) && init.expression().is_some_and(|e| ast::is_identifier(e) && e.text() == "ref") {
                        let a = init.arguments();
                        if a.is_empty() || !ast::is_string_literal(a[0]) {
                            // TS throws here, which aborts inspection.
                            self.log.error("ref() call requires a string literal argument");
                            return None;
                        }
                        pikku_func_id = a[0].text().to_string();
                        let ns = match pikku_func_id.find(':') {
                            Some(i) => pikku_func_id[..i].to_string(),
                            None => String::new(),
                        };
                        let pkg = if ns.is_empty() { None } else { self.addon_package(&ns) };
                        if !ns.is_empty() && pkg.is_none() {
                            self.log.error(format!(
                                "Unknown addon namespace \"{ns}\" in \"{pikku_func_id}\": no matching wireAddonDeclarations entry found"
                            ));
                            return None;
                        }
                        meta.set_str("pikkuFuncId", &pikku_func_id);
                        if let Some(pkg) = pkg {
                            meta.set_str("packageName", &pkg);
                        }
                    } else {
                        let extracted = self.extract_function_name(init);
                        pikku_func_id = extracted.pikku_func_id;
                        if is_temp_id(&pikku_func_id) {
                            pikku_func_id = make_context_based_id("cli", &program_and_path());
                            self.ensure_inline_wiring_function(&pikku_func_id, &full_path.join(" "), Some(init), extracted.is_helper);
                        }
                        meta.set_str("pikkuFuncId", &pikku_func_id);
                        if ast::is_identifier(init) {
                            let pkg = self.resolve_addon_name(init);
                            if !pkg.is_empty() {
                                meta.set_str("packageName", &pkg);
                            }
                        }
                    }
                }
                "options" => {
                    if ast::is_object_literal_expression(init) {
                        options_node = Some(init);
                    }
                }
                "tags" => tags = tsutil::get_property_value(node, "tags").strs.unwrap_or_default(),
                _ => {}
            }
        }

        let mut all_tags: Vec<String> = program.tags.clone();
        all_tags.extend(tags);
        let tag_arg: Option<&[String]> = if all_tags.is_empty() { None } else { Some(&all_tags) };
        let middleware = self.resolve_middleware(node, tag_arg);
        if !middleware.is_empty() {
            meta.set("middleware", Some(serde_json::to_value(&middleware).expect("WireRef serialises")));
        }
        if !all_tags.is_empty() {
            meta.set("tags", Some(strs_value(&all_tags)));
        }

        for p in node.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "parameters" => {
                    if ast::is_string_literal(init) {
                        match parse_command_pattern(init.text()) {
                            Ok(positionals) => {
                                meta.set_str("parameters", init.text());
                                meta.set("positionals", Some(Value::Array(positionals.iter().map(|p| p.value()).collect())));
                            }
                            Err(e) => {
                                // TS throws here, which aborts inspection.
                                self.log.error(e);
                                return None;
                            }
                        }
                    }
                }
                "description" => {
                    if ast::is_string_literal(init) {
                        meta.set_str("description", init.text());
                    }
                }
                "render" => {
                    let mut id = self.extract_function_name(init).pikku_func_id;
                    if is_temp_id(&id) {
                        id = make_context_based_id("cli-render", &program_and_path());
                    }
                    meta.set_str("renderName", &id);
                }
                "options" => {
                    if let Some(on) = options_node {
                        let (opts, ok) = self.process_cli_options_checked(on, &pikku_func_id);
                        if !ok {
                            return None;
                        }
                        meta.set("options", Some(record_value(&opts)));
                    }
                }
                "subcommands" => {
                    let mut subcommands: Record<Raw> = Record::new();
                    self.collect_cli_subcommands(init, program, &full_path, &mut subcommands);
                    meta.set("subcommands", Some(record_value(&subcommands)));
                }
                "isDefault" => match init.kind() {
                    Kind::TrueKeyword => meta.set("isDefault", Some(Value::Bool(true))),
                    Kind::FalseKeyword => meta.set("isDefault", Some(Value::Bool(false))),
                    _ => {}
                },
                "hidden" => {
                    if init.kind() == Kind::TrueKeyword {
                        meta.set("hidden", Some(Value::Bool(true)));
                    }
                }
                _ => {}
            }
        }

        if !pikku_func_id.is_empty() && !self.validate_auth_sessionless(node, &pikku_func_id, &format!("CLI command '{name}'"), None) {
            return None;
        }
        self.state.service_aggregation.used_functions.add(pikku_func_id);
        self.add_used_middleware(&middleware);
        Some(meta)
    }

    fn collect_cli_subcommands(&mut self, n: P<Node>, program: &CliProgram, full_path: &[String], subcommands: &mut Record<Raw>) {
        if let Some(contract) = resolve_ref_contract(n, "refCLI", &self.state.exported_contracts.addon_cli) {
            if let Some(rec) = raw_object(&contract) {
                for (k, v) in rec.iter() {
                    subcommands.set(k, v.clone());
                }
            }
            return;
        }
        let mut target = Some(n);
        if ast::is_identifier(n) {
            target = self.resolve_identifier(n, &["defineCLICommands"]);
        }
        let Some(target) = target.filter(|t| ast::is_object_literal_expression(*t)) else { return };
        for sp in target.properties() {
            let sp = *sp;
            if ast::is_spread_assignment(sp) {
                self.collect_cli_subcommands(sp.expression().unwrap(), program, full_path, subcommands);
                continue;
            }
            if !ast::is_property_assignment(sp) {
                continue;
            }
            let Some(sub_name) = cli_property_name(sp) else { continue };
            if let Some(sub) = self.process_cli_command(&sub_name, sp.initializer().unwrap(), program, full_path) {
                subcommands.set(sub_name, sub.raw());
            }
        }
    }

    /// add-cli.ts processOptions; the bool is false where TS throws (manual
    /// choices outside the type's).
    fn process_cli_options_checked(&mut self, obj: P<Node>, pikku_func_id: &str) -> (Record<Raw>, bool) {
        let mut options: Record<Raw> = Record::new();
        for p in obj.properties() {
            let p = *p;
            if !ast::is_property_assignment(p) {
                continue;
            }
            let Some(option_name) = cli_property_name(p) else { continue };
            let pinit = p.initializer().unwrap();
            if !ast::is_object_literal_expression(pinit) {
                continue;
            }
            let mut option = JsObject::new();
            let mut manual_choices: Vec<String> = Vec::new();
            let mut has_manual = false;
            for op in pinit.properties() {
                if !ast::is_property_assignment(*op) || !op.name().is_some_and(ast::is_identifier) {
                    continue;
                }
                let init = op.initializer().unwrap();
                let key = op.name().unwrap().text();
                match key {
                    "description" | "short" | "type" => {
                        if ast::is_string_literal(init) {
                            option.set_str(key, init.text());
                        }
                    }
                    "default" => {
                        if ast::is_string_literal(init) {
                            option.set_str("default", init.text());
                        } else if ast::is_numeric_literal(init) {
                            let f = init.text().parse::<f64>().unwrap_or(0.0);
                            option.set("default", Some(num_value(f)));
                        } else if init.kind() == Kind::TrueKeyword {
                            option.set("default", Some(Value::Bool(true)));
                        } else if init.kind() == Kind::FalseKeyword {
                            option.set("default", Some(Value::Bool(false)));
                        }
                    }
                    "choices" => {
                        if ast::is_array_literal_expression(init) {
                            has_manual = true;
                            manual_choices = init.elements().iter().filter(|e| ast::is_string_literal(**e)).map(|e| e.text().to_string()).collect();
                        }
                    }
                    _ => {}
                }
            }

            let mut derived: Option<Vec<String>> = None;
            if !pikku_func_id.is_empty() {
                if let Some(t) = self.types_lookup.get(pikku_func_id).and_then(|ts| ts.first().copied()) {
                    derived = self.enum_from_property_type(t, &option_name);
                }
                if derived.is_none() {
                    derived = self.enum_from_json_schema(pikku_func_id, &option_name);
                }
            }
            if derived.is_none() {
                derived = self.enum_from_config_type(&option_name);
            }

            match (has_manual, &derived) {
                (true, Some(d)) => {
                    let invalid: Vec<&String> = manual_choices.iter().filter(|c| !d.contains(c)).collect();
                    if !invalid.is_empty() {
                        let sf = source_file_of(obj);
                        let (line, ch) = line_and_character(p);
                        // TS throws here, which aborts inspection.
                        self.log.error(format!(
                            "Invalid choices for option \"{option_name}\" at {}:{}:{}.\nThe following choices are not valid according to the type: {}.\nValid choices from type: {}.",
                            sf.file_name(),
                            line + 1,
                            ch + 1,
                            invalid.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "),
                            d.join(", ")
                        ));
                        return (options, false);
                    }
                    option.set("choices", Some(strs_value(&manual_choices)));
                }
                (true, None) => option.set("choices", Some(strs_value(&manual_choices))),
                (false, Some(d)) => option.set("choices", Some(strs_value(d))),
                (false, None) => {}
            }
            options.set(option_name, option.raw());
        }
        (options, true)
    }

    /// add-cli.ts extractEnumFromPropertyType.
    fn enum_from_property_type(&mut self, t: P<Type>, property_name: &str) -> Option<Vec<String>> {
        let prop = self.checker.get_property_of_type_exported(t, property_name)?;
        // TS asks for the type at an undefined location, which is the error type.
        let vd = prop.value_declaration()?;
        let pt = self.checker.get_type_of_symbol_at_location(prop, Some(vd))?;
        let mut values: Vec<String> = Vec::new();
        if pt.flags().intersects(TypeFlags::Union) {
            let mut from_enum = false;
            for m in tsutil::typeorder::union_types_in_id_order(pt) {
                if m.flags().intersects(TypeFlags::StringLiteral) {
                    if let Some(v) = string_literal_value(m) {
                        values.push(v);
                    }
                } else if m.flags().intersects(TypeFlags::EnumLiteral) {
                    from_enum = true;
                    if let Some(v) = string_literal_value(m) {
                        values.push(v);
                    } else if let Some(sym) = m.symbol() {
                        if !sym.name().is_empty() {
                            values.push(tsutil::symbol_name(sym));
                        }
                    }
                }
            }
            if !from_enum {
                sort_strings_js(&mut values);
            }
        } else if pt.flags().intersects(TypeFlags::Enum) {
            if let Some(sym) = pt.symbol() {
                for member in enum_members_in_order(sym) {
                    let Some(mvd) = member.value_declaration() else { continue };
                    let Some(mt) = self.checker.get_type_of_symbol_at_location(member, Some(mvd)) else { continue };
                    if mt.flags().intersects(TypeFlags::StringLiteral | TypeFlags::NumberLiteral | TypeFlags::EnumLiteral) {
                        if let Some(v) = string_literal_value(mt) {
                            values.push(v);
                        }
                    }
                }
            }
        } else if pt.flags().intersects(TypeFlags::EnumLiteral) {
            if let Some(v) = string_literal_value(pt) {
                values.push(v);
            }
        }
        if values.is_empty() { None } else { Some(values) }
    }

    /// add-cli.ts extractEnumFromJsonSchema.
    fn enum_from_json_schema(&mut self, pikku_func_id: &str, property_name: &str) -> Option<Vec<String>> {
        let f = self.resolve_function_meta(pikku_func_id)?;
        let schema_name = f.input_schema_name.clone().filter(|s| !s.is_empty())?;
        let raw = self.state.schemas.get(&schema_name)?;
        let schema = raw.value()?.as_object()?;
        let prop = schema.get("properties")?.as_object()?.get(property_name)?.as_object()?;
        let strings_of = |v: Option<&Value>| -> Vec<String> {
            v.and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default()
        };
        let out = strings_of(prop.get("enum"));
        if !out.is_empty() {
            return Some(out);
        }
        if prop.get("type").and_then(|t| t.as_str()) == Some("array") {
            if let Some(items) = prop.get("items").and_then(|i| i.as_object()) {
                let out = strings_of(items.get("enum"));
                if !out.is_empty() {
                    return Some(out);
                }
            }
        }
        None
    }

    /// add-cli.ts extractEnumFromConfigType: the property on the project's
    /// CoreConfig extension (resolveCoreType over the config import map).
    fn enum_from_config_type(&mut self, property_name: &str) -> Option<Vec<String>> {
        let mut config_sym: Option<P<Symbol>> = None;
        'outer: for (_, entries) in self.state.config_type_import_map.iter() {
            for e in entries {
                let Some(ty) = &e.ty else { continue };
                for ct in &self.core_types {
                    if &ct.name == ty {
                        config_sym = Some(ct.sym);
                        break 'outer;
                    }
                }
            }
        }
        let Some(sym) = config_sym else {
            if !self.cli_config_type_warned {
                self.cli_config_type_warned = true;
                self.log.warn("Could not find Config type in typesLookup. Make sure you have a Config interface extending CoreConfig in your codebase.");
            }
            return None;
        };
        let t = self.checker.get_declared_type_of_symbol_exported(sym);
        self.enum_from_property_type(t, property_name)
    }

    /// add-cli.ts addCLIRenderers.
    pub fn add_cli_renderers(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(|e| ast::is_identifier(e) && e.text() == "pikkuCLIRender") {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let r = self.extract_function_name(node);
        let file_path = file_name_of(node);
        let fn_node = args[0];
        let services = if ast::is_arrow_function(fn_node) || ast::is_function_expression(fn_node) {
            services_of(fn_node)
        } else {
            crate::state::ServicesMeta { optimized: true, services: vec![] }
        };
        let mut o = JsObject::new();
        o.set_str("name", &r.pikku_func_id);
        if !r.exported_name.is_empty() {
            o.set_str("exportedName", &r.exported_name);
        }
        o.set("services", Some(serde_json::to_value(&services).expect("services serialise")));
        o.set_str("filePath", file_path);
        self.state.cli.meta.renderers.set(r.pikku_func_id.clone(), o.raw());
        if !r.exported_name.is_empty() {
            self.state.cli.files.add(file_path);
        }
    }
}

/// The channels and CLI part of resolve-versions.ts updateWiringReferences
/// (Go `updateChannelAndCLIReferences`).
pub fn update_channel_and_cli_references(st: &mut State, old_id: &str, new_id: &str) {
    let names: Vec<String> = st.channels.meta.keys().into_iter().map(|k| k.to_string()).collect();
    for name in names {
        let Some(mut rec) = st.channels.meta.get(&name).and_then(raw_object) else { continue };
        for slot in ["connect", "disconnect", "message"] {
            if let Some(v) = rec.get(slot).cloned() {
                rec.set(slot, rewrite_func_id_raw(v, old_id, new_id));
            }
        }
        if let Some(mw) = rec.get("messageWirings").cloned() {
            if let Some(mut channels) = raw_object(&mw) {
                let cks: Vec<String> = channels.keys().into_iter().map(|k| k.to_string()).collect();
                for ck in cks {
                    let Some(mut routes) = channels.get(&ck).and_then(raw_object) else { continue };
                    let rks: Vec<String> = routes.keys().into_iter().map(|k| k.to_string()).collect();
                    for rk in rks {
                        let r = routes.get(&rk).cloned().unwrap_or_default();
                        routes.set(rk, rewrite_func_id_raw(r, old_id, new_id));
                    }
                    channels.set(ck, Raw::of(record_value(&routes)));
                }
                rec.set("messageWirings", Raw::of(record_value(&channels)));
            }
        }
        st.channels.meta.set(name, Raw::of(record_value(&rec)));
    }

    fn update_commands(r: Raw, old_id: &str, new_id: &str) -> Raw {
        let Some(mut cmds) = raw_object(&r) else { return r };
        let keys: Vec<String> = cmds.keys().into_iter().map(|k| k.to_string()).collect();
        for k in keys {
            let mut cmd = rewrite_func_id_raw(cmds.get(&k).cloned().unwrap_or_default(), old_id, new_id);
            if let Some(mut rec) = raw_object(&cmd) {
                if let Some(sub) = rec.get("subcommands").cloned() {
                    rec.set("subcommands", update_commands(sub, old_id, new_id));
                    cmd = Raw::of(record_value(&rec));
                }
            }
            cmds.set(k, cmd);
        }
        Raw::of(record_value(&cmds))
    }
    let names: Vec<String> = st.cli.meta.programs.keys().into_iter().map(|k| k.to_string()).collect();
    for name in names {
        let Some(mut rec) = st.cli.meta.programs.get(&name).and_then(raw_object) else { continue };
        if let Some(c) = rec.get("commands").cloned() {
            rec.set("commands", update_commands(c, old_id, new_id));
        }
        st.cli.meta.programs.set(name, Raw::of(record_value(&rec)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Go `TestParseCommandPattern`.
    #[test]
    fn parse_command_pattern_cases() {
        let got = parse_command_pattern("<env>  [region] <files...> [rest...]").unwrap();
        let want = vec![
            CliPositional { name: "env".into(), required: true, variadic: false },
            CliPositional { name: "region".into(), required: false, variadic: false },
            CliPositional { name: "files".into(), required: true, variadic: true },
            CliPositional { name: "rest".into(), required: false, variadic: true },
        ];
        assert_eq!(got, want);
        assert!(parse_command_pattern("").unwrap().is_empty());
        let err = parse_command_pattern("deploy <env>").unwrap_err();
        assert_eq!(
            err,
            "Invalid parameters pattern 'deploy <env>': found literal word 'deploy'. Parameters should only contain <required> or [optional] arguments. Example: \"<env> [region]\" or \"<files...>\""
        );
    }

    /// Go `TestCLIPositionalJSON`.
    #[test]
    fn positional_json() {
        let v = Value::Array(vec![
            CliPositional { name: "a".into(), required: true, variadic: false }.value(),
            CliPositional { name: "b".into(), required: false, variadic: true }.value(),
        ]);
        assert_eq!(serde_json::to_string(&v).unwrap(), r#"[{"name":"a","required":true},{"name":"b","required":false,"variadic":true}]"#);
    }

    /// Go `updateChannelAndCLIReferences`: a versioned id rewrites every
    /// channel slot / message route and every (nested) CLI command.
    #[test]
    fn rewrites_channel_and_cli_references() {
        let mut st = State::new("/tmp/x");
        let j = |s: &str| Raw::of(serde_json::from_str(s).unwrap());
        st.channels.meta.set(
            "chat",
            j(r#"{"name":"chat","connect":{"pikkuFuncId":"old"},"disconnect":null,"message":{"pikkuFuncId":"other"},"messageWirings":{"a":{"go":{"pikkuFuncId":"old"},"stay":{"pikkuFuncId":"x"}}}}"#),
        );
        st.cli.meta.programs.set(
            "prog",
            j(r#"{"program":"prog","commands":{"c":{"pikkuFuncId":"old","subcommands":{"s":{"pikkuFuncId":"old"}}}},"options":{}}"#),
        );
        update_channel_and_cli_references(&mut st, "old", "new");
        assert_eq!(
            serde_json::to_string(st.channels.meta.get("chat").unwrap()).unwrap(),
            r#"{"name":"chat","connect":{"pikkuFuncId":"new"},"disconnect":null,"message":{"pikkuFuncId":"other"},"messageWirings":{"a":{"go":{"pikkuFuncId":"new"},"stay":{"pikkuFuncId":"x"}}}}"#
        );
        assert_eq!(
            serde_json::to_string(st.cli.meta.programs.get("prog").unwrap()).unwrap(),
            r#"{"program":"prog","commands":{"c":{"pikkuFuncId":"new","subcommands":{"s":{"pikkuFuncId":"new"}}}},"options":{}}"#
        );
    }
}

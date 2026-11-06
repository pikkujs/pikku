//! Port of Go `visit/util_schema.go`: add-functions.ts resolveSchemaRef and
//! utils/detect-schema-vendor.ts.

use tsrs_ast::{self as ast, Node, Symbol};
use tsrs_checker::{ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::SchemaRef;
use crate::tsutil::file_name_of;

/// `symbolDecl`: the value declaration, else the first declaration.
pub fn symbol_decl(sym: P<Symbol>) -> Option<P<Node>> {
    sym.value_declaration().or_else(|| sym.declarations().first().copied())
}

const SCHEMA_VENDOR_DIRS: [(&str, &str); 4] = [
    ("node_modules/zod", "zod"),
    ("node_modules/valibot", "valibot"),
    ("node_modules/arktype", "arktype"),
    ("node_modules/@effect/schema", "effect"),
];

/// The vendor whose package directory a file path lies in, if any.
pub fn vendor_of_path(file: &str) -> Option<&'static str> {
    SCHEMA_VENDOR_DIRS.iter().find(|(dir, _)| file.contains(dir)).map(|(_, v)| *v)
}

impl Context<'_> {
    /// `resolveSchemaRef` is add-functions.ts resolveSchemaRef: the schema
    /// variable's declaring file (through an import) and its vendor, or `None`
    /// after logging when the vendor cannot be determined.
    pub fn resolve_schema_ref(&mut self, ident: P<Node>, context: &str) -> Option<SchemaRef> {
        let sym = self.symbol_at(ident)?;
        let mut decl = symbol_decl(sym)?;
        if ast::is_import_specifier(decl) {
            let aliased = self.checker.get_aliased_symbol(sym);
            decl = symbol_decl(aliased)?;
        }
        let source_file = file_name_of(decl);
        let vendor = self.detect_schema_vendor_or_error(ident, context, source_file);
        if vendor.is_empty() {
            return None;
        }
        Some(SchemaRef { variable_name: ident.text().to_string(), source_file: source_file.to_string(), vendor })
    }

    /// `detectSchemaVendor` ports utils/detect-schema-vendor.ts: trace the type
    /// (its bases, then its type arguments) back to the library that declares
    /// it. "" stands for 'unknown'.
    pub fn detect_schema_vendor(&mut self, ident: P<Node>) -> String {
        let t = self.checker.get_type_at_location(ident);
        let v = self.schema_type_origin(t);
        if !v.is_empty() {
            return v;
        }
        if t.object_flags().intersects(ObjectFlags::Reference) {
            for arg in self.checker.get_type_arguments_exported(t) {
                let v = self.schema_type_origin(*arg);
                if !v.is_empty() {
                    return v;
                }
            }
        }
        String::new()
    }

    fn schema_type_origin(&mut self, t: P<Type>) -> String {
        let mut sym = t.symbol();
        if sym.is_none() {
            sym = t.alias().and_then(|a| a.symbol());
        }
        if let Some(sym) = sym {
            for decl in sym.declarations() {
                if let Some(v) = vendor_of_path(file_name_of(*decl)) {
                    return v.to_string();
                }
            }
        }
        if t.object_flags().intersects(ObjectFlags::ClassOrInterface) {
            for base in self.checker.get_base_types_exported(t) {
                let v = self.schema_type_origin(*base);
                if !v.is_empty() {
                    return v;
                }
            }
        }
        String::new()
    }

    pub(super) fn detect_schema_vendor_or_error(&mut self, ident: P<Node>, context: &str, source_file: &str) -> String {
        let v = self.detect_schema_vendor(ident);
        if !v.is_empty() {
            return v;
        }
        let t = self.checker.get_type_at_location(ident);
        let name = ident.text();
        if t.flags().intersects(TypeFlags::Any | TypeFlags::Unknown) {
            self.log.critical(
                codes::INLINE_SCHEMA,
                format!(
                    "{context} schema '{name}' could not be TYPED from '{source_file}' — \
TypeScript resolved it to 'any', so its vendor cannot be traced. This is a \
resolution problem, not a schema problem: the file it is imported from is either \
outside your tsconfig 'include', or has not been generated yet (a schema built \
from '.pikku/db/zod.gen.ts' needs 'pikku db generate' to have run first). \
Fix the import so the type resolves, then re-run."
                ),
            );
            return String::new();
        }
        self.log.critical(
            codes::INLINE_SCHEMA,
            format!(
                "{context} schema vendor could not be determined from '{source_file}'. \
Supported vendors: zod, valibot, arktype, @effect/schema. \
Ensure your schema is imported from a supported validation library."
            ),
        );
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendors_by_path() {
        assert_eq!(vendor_of_path("/x/node_modules/zod/lib/types.d.ts"), Some("zod"));
        assert_eq!(vendor_of_path("/x/node_modules/@effect/schema/dist/a.d.ts"), Some("effect"));
        assert_eq!(vendor_of_path("/x/src/zod.ts"), None);
    }
}

//! Port of Go `tsjg/formatter/function_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::config::FunctionOptions;
use crate::tsjg::schema::{Def, Definition, Properties, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct FunctionTypeFormatter {
    pub(super) child_type_formatter: Rc<dyn TypeFormatter>,
    #[allow(dead_code)]
    functions: FunctionOptions,
}

impl FunctionTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>, functions: FunctionOptions) -> Rc<FunctionTypeFormatter> {
        Rc::new(FunctionTypeFormatter { child_type_formatter, functions })
    }

    pub(super) fn definition_of(&self, t: &Ty) -> Def {
        let (comment, named_args) = function_parts(t);
        if let Some(named_args) = named_args {
            let mut properties = Properties::new();
            properties.set("namedArgs".into(), self.child_type_formatter.get_definition(&named_args));
            return def(Definition { comment, properties: Some(properties), ..Definition::with_type("object") });
        }
        def(Definition { comment, ..Definition::default() })
    }

    pub(super) fn children_of(&self, t: &Ty) -> Vec<Ty> {
        let (_, named_args) = function_parts(t);
        match named_args {
            Some(n) => self.child_type_formatter.get_children(&n),
            None => Vec::new(),
        }
    }
}

impl TypeFormatter for FunctionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Function(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        self.definition_of(t)
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.children_of(t)
    }
}

/// Extracts the comment and named arguments from a function or constructor
/// type (ConstructorType subclasses FunctionType in TypeScript).
fn function_parts(t: &Ty) -> (String, Option<Ty>) {
    match &**t {
        TypeKind::Function(ft) => (ft.comment.clone(), Some(ft.named_arguments.clone())),
        TypeKind::Constructor(ft) => (ft.comment.clone(), Some(ft.named_arguments.clone())),
        _ => (String::new(), None),
    }
}

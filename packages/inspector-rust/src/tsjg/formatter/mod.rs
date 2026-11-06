//! Port of Go `internal/tsjg/formatter`: turns intermediate types into JSON
//! Schema definitions (src/TypeFormatter*). Core: the [`TypeFormatter`] trait,
//! the chain and the circular-reference formatter (formatter.go).
//!
//! Failures are `super::fail(msg)` (Go `panic(err)`).

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use super::fail;
use super::schema::{Def, def, def_key};
use super::types::{Ty, go_type_name, ty_key};

/// Renders a type as a schema definition. `get_children` returns the types a
/// type references (used to collect definitions). `supports_type` is only
/// meaningful on sub-formatters (the chain and the circular wrapper delegate).
pub trait TypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool;
    fn get_definition(&self, t: &Ty) -> Def;
    fn get_children(&self, t: &Ty) -> Vec<Ty>;
}

pub fn unknown_type_error(t: &Ty) -> ! {
    fail(&format!("unknown type {} (id {:?})", go_type_name(t), t.id()))
}

/// Delegates to the first sub-formatter supporting a type (src/ChainTypeFormatter.ts).
pub struct ChainTypeFormatter {
    formatters: RefCell<Vec<Rc<dyn TypeFormatter>>>,
}

impl ChainTypeFormatter {
    pub fn new() -> Rc<ChainTypeFormatter> {
        Rc::new(ChainTypeFormatter { formatters: RefCell::new(Vec::new()) })
    }
    pub fn add_type_formatter(&self, f: Rc<dyn TypeFormatter>) -> &Self {
        self.formatters.borrow_mut().push(f);
        self
    }
    fn formatter_for(&self, t: &Ty) -> Rc<dyn TypeFormatter> {
        match self.formatters.borrow().iter().find(|f| f.supports_type(t)) {
            Some(f) => f.clone(),
            None => unknown_type_error(t),
        }
    }
}

impl TypeFormatter for ChainTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        self.formatters.borrow().iter().any(|f| f.supports_type(t))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        self.formatter_for(t).get_definition(t)
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.formatter_for(t).get_children(t)
    }
}

/// Memoizes definitions and children per type instance to support recursive
/// types (src/CircularReferenceTypeFormatter.ts).
pub struct CircularReferenceTypeFormatter {
    child: Rc<dyn TypeFormatter>,
    definitions: RefCell<HashMap<usize, (Ty, Def)>>,
    children: RefCell<HashMap<usize, (Ty, Rc<RefCell<Vec<Ty>>>)>>,
}

impl CircularReferenceTypeFormatter {
    pub fn new(child: Rc<dyn TypeFormatter>) -> Rc<CircularReferenceTypeFormatter> {
        Rc::new(CircularReferenceTypeFormatter {
            child,
            definitions: RefCell::new(HashMap::new()),
            children: RefCell::new(HashMap::new()),
        })
    }
}

impl TypeFormatter for CircularReferenceTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        self.child.supports_type(t)
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let key = ty_key(t);
        if let Some((_, d)) = self.definitions.borrow().get(&key) {
            return d.clone();
        }
        let definition = def(Default::default());
        self.definitions.borrow_mut().insert(key, (t.clone(), definition.clone()));
        let filled = self.child.get_definition(t);
        let value = filled.borrow().clone();
        *definition.borrow_mut() = value;
        definition
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let key = ty_key(t);
        if let Some((_, c)) = self.children.borrow().get(&key) {
            return c.borrow().clone();
        }
        let cell = Rc::new(RefCell::new(Vec::new()));
        self.children.borrow_mut().insert(key, (t.clone(), cell.clone()));
        let got = self.child.get_children(t);
        let mut all = cell.borrow().clone();
        all.extend(got);
        let all = unique_types(all);
        *cell.borrow_mut() = all.clone();
        all
    }
}

/// De-duplicates types by instance identity, first occurrence wins
/// (src/Utils/uniqueArray.ts).
pub fn unique_types(list: Vec<Ty>) -> Vec<Ty> {
    let mut seen = std::collections::HashSet::new();
    list.into_iter().filter(|t| seen.insert(ty_key(t))).collect()
}

/// De-duplicates definitions by instance identity.
pub fn unique_defs(list: Vec<Def>) -> Vec<Def> {
    let mut seen = std::collections::HashSet::new();
    list.into_iter().filter(|d| seen.insert(def_key(d))).collect()
}

/// De-duplicates comparable values keeping first occurrences.
pub fn unique<T: Clone + Eq + std::hash::Hash>(list: &[T]) -> Vec<T> {
    let mut seen = std::collections::HashSet::new();
    list.iter().filter(|v| seen.insert((*v).clone())).cloned().collect()
}

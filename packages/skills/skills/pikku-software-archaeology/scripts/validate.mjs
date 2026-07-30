#!/usr/bin/env node
// Validates a .knowledge/ blueprint directory against references/blueprint.schema.json,
// then runs cross-file referential checks (does every command's domain exist, does every
// api surface map to a real command/query, ...). Exit 0 = valid, 1 = errors.
//
// Usage: node validate.mjs <path-to-.knowledge-dir>

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDoc = JSON.parse(readFileSync(join(here, '..', 'references', 'blueprint.schema.json'), 'utf8'));

const dir = process.argv[2];
if (!dir) { console.error('usage: node validate.mjs <.knowledge dir>'); process.exit(2); }

const errors = [];
const warnings = [];

// --- minimal JSON-Schema-subset validator (type, required, properties, items, enum, minItems, pattern, $ref -> $defs) ---
function resolveRef(ref) {
  const m = /^#\/\$defs\/(\w+)$/.exec(ref);
  if (!m || !schemaDoc.$defs[m[1]]) throw new Error(`unresolvable $ref ${ref}`);
  return schemaDoc.$defs[m[1]];
}

function check(value, schema, path) {
  if (schema.$ref) schema = { ...resolveRef(schema.$ref), ...schema, $ref: undefined };
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of [${schema.enum.join(', ')}], got ${JSON.stringify(value)}`);
    return;
  }
  const t = schema.type;
  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${path}: expected object`); return;
    }
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}: missing required field "${req}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) check(v, schema.properties[k], `${path}.${k}`);
    }
  } else if (t === 'array') {
    if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} item(s), has ${value.length}`);
    }
    if (schema.items) value.forEach((v, i) => check(v, schema.items, `${path}[${i}]`));
  } else if (t === 'string') {
    if (typeof value !== 'string') { errors.push(`${path}: expected string`); return; }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
    }
  } else if (t === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${path}: expected boolean`);
  } else if (t === 'number' && typeof value !== 'number') {
    errors.push(`${path}: expected number`);
  }
}

// --- load + per-file validation ---
// Files marked `x-optional` (the frontend layer) only validate when present, so a
// backend-only repo does not fail for lacking them.
const docs = {};
for (const [filename, fileSchema] of Object.entries(schemaDoc.files)) {
  const p = join(dir, filename);
  if (!existsSync(p)) {
    if (!fileSchema['x-optional']) errors.push(`${filename}: missing`);
    continue;
  }
  try {
    docs[filename] = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${filename}: invalid JSON (${e.message})`); continue;
  }
  check(docs[filename], fileSchema, filename);
}
if (!existsSync(join(dir, 'blueprint.md'))) errors.push('blueprint.md: missing');

// --- cross-file referential checks ---
if (docs['domains.json'] && docs['commands.json']) {
  const domains = new Set((docs['domains.json'].domains || []).map((d) => d.name));
  const commandNames = new Set((docs['commands.json'].commands || []).map((c) => c.name));
  const queryNames = new Set((docs['queries.json']?.queries || []).map((q) => q.name));
  const eventNames = new Set((docs['events.json']?.events || []).map((e) => e.name));

  const wantDomain = (owner, d) => {
    if (d && !domains.has(d)) errors.push(`${owner}: domain "${d}" not defined in domains.json`);
  };
  for (const c of docs['commands.json'].commands || []) {
    wantDomain(`commands.json:${c.name}`, c.domain);
    for (const ev of c.eventsProduced || []) {
      if (!eventNames.has(ev)) warnings.push(`commands.json:${c.name} produces "${ev}" which is not in events.json`);
    }
  }
  for (const q of docs['queries.json']?.queries || []) wantDomain(`queries.json:${q.name}`, q.domain);
  for (const e of docs['entities.json']?.entities || []) wantDomain(`entities.json:${e.name}`, e.domain);
  for (const ev of docs['events.json']?.events || []) wantDomain(`events.json:${ev.name}`, ev.domain);

  for (const s of docs['api.json']?.surfaces || []) {
    const { type, name } = s.mapsTo || {};
    if (type === 'command' && !commandNames.has(name)) errors.push(`api.json:${s.method || ''} ${s.path}: maps to unknown command "${name}"`);
    if (type === 'query' && !queryNames.has(name)) errors.push(`api.json:${s.method || ''} ${s.path}: maps to unknown query "${name}"`);
    if (type === 'event-ingress' && !eventNames.has(name)) errors.push(`api.json:${s.method || ''} ${s.path}: event-ingress maps to unknown event "${name}" (state-changing webhooks should map to a command instead)`);
  }
  // every domain's listed concepts should exist
  for (const d of docs['domains.json'].domains || []) {
    for (const c of d.commands || []) if (!commandNames.has(c)) warnings.push(`domains.json:${d.name}: lists command "${c}" not in commands.json`);
    for (const q of d.queries || []) if (!queryNames.has(q)) warnings.push(`domains.json:${d.name}: lists query "${q}" not in queries.json`);
    for (const e of d.events || []) if (!eventNames.has(e)) warnings.push(`domains.json:${d.name}: lists event "${e}" not in events.json`);
    const policyNames = new Set((docs['policies.json']?.policies || []).map((p) => p.name));
    for (const p of d.policies || []) if (!policyNames.has(p)) warnings.push(`domains.json:${d.name}: lists policy "${p}" not in policies.json`);
  }
  // commands with no policies and no preconditions are suspicious for mutating ops
  for (const c of docs['commands.json'].commands || []) {
    if (!(c.policies || []).length && !(c.preconditions || []).length) {
      warnings.push(`commands.json:${c.name}: no policies or preconditions — really unguarded, or missed extraction?`);
    }
  }
}

// --- frontend layer cross-checks (only when the optional frontend files exist) ---
if (docs['frontend-components.json']) {
  const componentNames = new Set(
    (docs['frontend-components.json'].components || []).map((c) => c.name),
  );
  // routes should reference components that were actually inventoried
  for (const r of docs['frontend-routes.json']?.routes || []) {
    for (const c of r.usesComponents || []) {
      if (!componentNames.has(c)) {
        warnings.push(`frontend-routes.json:${r.path}: uses component "${c}" not in frontend-components.json`);
      }
    }
  }
  // a component flagged as needing a port must say WHY (the custom logic), or the
  // port-risk is unactionable
  for (const c of docs['frontend-components.json'].components || []) {
    if (c.rebuild === 'custom-logic' && !c.customLogic) {
      warnings.push(`frontend-components.json:${c.name}: rebuild=custom-logic but no customLogic description — port risk is unactionable`);
    }
  }
  // data-fetching queries named on routes should resolve to a real query/command
  if (docs['queries.json'] || docs['commands.json']) {
    const known = new Set([
      ...(docs['queries.json']?.queries || []).map((q) => q.name),
      ...(docs['commands.json']?.commands || []).map((c) => c.name),
    ]);
    for (const r of docs['frontend-routes.json']?.routes || []) {
      for (const d of r.dataFrom || []) {
        if (!known.has(d)) {
          warnings.push(`frontend-routes.json:${r.path}: reads "${d}" which is not a known query/command`);
        }
      }
    }
  }
}

// an inconsistent UI with no specific design findings = under-extraction
// (guarded on frontend.json alone — independent of the component inventory)
if (docs['frontend.json']) {
  const consistency = docs['frontend.json'].designSystemConsistency;
  const findingCount = (docs['frontend.json'].designFindings || []).length;
  if ((consistency === 'mixed' || consistency === 'ad-hoc') && findingCount === 0) {
    warnings.push(`frontend.json: designSystemConsistency="${consistency}" but designFindings is empty — name the specific broken patterns (interaction/theming/cross-page/…)`);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${Object.keys(docs).length} files`);
process.exit(errors.length ? 1 : 0);

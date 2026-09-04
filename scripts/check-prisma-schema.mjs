#!/usr/bin/env node
/**
 * Offline Prisma schema sanity check — verifies that every relation has its
 * opposite field on the target model (the class of error prisma db push
 * reports as "missing an opposite relation field"). Runs without downloading
 * engines, so it works in restricted environments and CI pre-checks.
 *
 * Usage: node scripts/check-prisma-schema.mjs [path-to-schema.prisma]
 */
import fs from 'fs';
import path from 'path';

const schemaPath =
  process.argv[2] || path.resolve('packages/backend/prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

// ---- parse models ----
const models = new Map(); // name -> { fields: [{name, type, isList, relationName, hasFields}]
const blockRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let m;
while ((m = blockRe.exec(schema))) {
  const name = m[1];
  const body = m[2];
  const fields = [];
  // every field that is unique on its own (@unique / @id) or as part of a
  // model-level @@unique([...]) — needed to validate one-to-one relations
  const uniqueFields = new Set();
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (line.startsWith('@@')) {
      const cm = line.match(/^@@unique\(\s*\[([^\]]*)\]/);
      if (cm) for (const f of cm[1].split(',')) uniqueFields.add(f.trim());
      continue;
    }
    const fm0 = line.match(/^(\w+)\s+(.+)$/);
    if (fm0 && /@unique|@id/.test(line)) uniqueFields.add(fm0[1]);
  }
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('@@')) continue;
    const fm = line.match(/^(\w+)\s+(\w+)(\[\])?\s*(.*)$/);
    if (!fm) continue;
    const [, fName, fType, listBracket, rest] = fm;
    // capture the relation name whether it is @relation("x"), @relation("x", fields: […]) or plain @relation(fields: […])
    const relMatch = rest.match(/@relation\s*\(\s*(?:"([^"]+)"\s*,?\s*)?/);
    const hasFields = /@relation[^)]*fields\s*:/.test(rest);
    if (relMatch || (fType[0].toUpperCase() === fType[0] && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(fType))) {
      const relFields = (rest.match(/fields\s*:\s*\[([^\]]*)\]/) || [])[1];
      fields.push({
        name: fName,
        type: fType,
        isList: !!listBracket,
        relationName: relMatch ? relMatch[1] || null : null,
        hasFields,
        isOptional: /\?\s*(?:@|$)/.test(fName + ' ' + rest) ? fType.includes('?') || rawLine.trim().includes(fName + '?') : false,
        isUnique: /@unique/.test(rest),
        isId: /@id/.test(rest),
        relationFields: relFields ? relFields.split(',').map((x) => x.trim()).filter(Boolean) : [],
        rest,
        isRelation: /@relation/.test(rest) || !!listBracket && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(fType),
        line: rawLine.trim(),
      });
    }
  }
  const entry = { name, fields, body, uniqueFields };
  for (const f of fields) f.model = entry;
  models.set(name, entry);
}

const typeIsScalar = (t) => ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(t);


/**
 * The field on `target` that is the other side of `f`. When the relation is
 * named, the name decides — a named relation whose opposite is unnamed (or
 * named differently) is what prisma rejects with "missing an opposite
 * relation field".
 */
function findOpposite(target, modelName, f) {
  // a self-relation (ProductCategory.parent ↔ ProductCategory.children) must
  // never pair a field with itself
  const other = (o) => o.type === modelName && !(target === f.model && o.name === f.name);
  if (f.relationName) {
    const named = target.fields.find((o) => other(o) && o.relationName === f.relationName);
    if (named) return named;
    return target.fields.find((o) => other(o)) || null;
  }
  return (
    target.fields.find((o) => other(o) && !o.relationName) ||
    target.fields.find((o) => other(o)) ||
    null
  );
}

let errors = 0;
const fail = (model, message) => {
  console.error(`✗ ${model}: ${message}`);
  errors++;
};

for (const [modelName, model] of models) {
  for (const f of model.fields) {
    if (!models.has(f.type)) {
      fail(modelName, `field "${f.name}" references unknown model "${f.type}"`);
      continue;
    }
    const target = models.get(f.type);
    // scalar side (has fields: [...]) → target needs an opposite field of
    // this model (list for 1-to-many, scalar relation for one-to-one)
    if (!f.isList && f.hasFields) {
      const opposite = findOpposite(target, modelName, f);
      if (!opposite) {
        fail(modelName, `relation field "${f.name}" → ${f.type} is missing an opposite field on model ${f.type}`);
        continue;
      }

      // A named @relation("x") must be named on BOTH sides — prisma rejects a
      // named relation whose opposite field is unnamed (and vice versa).
      if (f.relationName && opposite.relationName !== f.relationName) {
        fail(
          modelName,
          `relation field "${f.name}" is named @relation("${f.relationName}") but the opposite field "${opposite.name}" on ${f.type} is ${opposite.relationName ? `named @relation("${opposite.relationName}")` : 'not named'} — both sides must use the same name`,
        );
      }

      // One-to-one relations need a unique foreign key on the defining side.
      if (!opposite.isList) {
        for (const fk of f.relationFields) {
          if (!model.uniqueFields.has(fk)) {
            fail(
              modelName,
              `one-to-one relation "${f.name}" → ${f.type} needs @unique on the foreign key "${fk}" (or a @@unique([${fk}]) on the model)`,
            );
          }
        }
      }
    }
    // list side → target needs a scalar relation back (or it's an implicit m-n which prisma also accepts — flag only when target has NO relation to us)
    if (f.isList) {
      const opposite = findOpposite(target, modelName, f);
      if (!opposite) {
        fail(modelName, `list field "${f.name}" (${f.type}[]) has no opposite relation field on model ${f.type}`);
      } else if (f.relationName && opposite.relationName !== f.relationName) {
        fail(
          modelName,
          `list field "${f.name}" is named @relation("${f.relationName}") but the opposite field "${opposite.name}" on ${f.type} is ${opposite.relationName ? `named @relation("${opposite.relationName}")` : 'not named'} — both sides must use the same name`,
        );
      }
    }
  }
}

if (errors) {
  console.error(`\n${errors} relation problem(s) found in ${schemaPath}`);
  process.exit(1);
}
console.log(`✓ ${schemaPath}: all relations consistent across ${models.size} models`);

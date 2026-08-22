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
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('@@')) continue;
    const fm = line.match(/^(\w+)\s+(\w+)(\[\])?\s*(.*)$/);
    if (!fm) continue;
    const [, fName, fType, listBracket, rest] = fm;
    const relMatch = rest.match(/@relation(?:\("([^"]+)"\))?(?:\(|\s|$)/);
    const hasFields = /@relation[^)]*fields\s*:/.test(rest);
    if (relMatch || (fType[0].toUpperCase() === fType[0] && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(fType))) {
      fields.push({
        name: fName,
        type: fType,
        isList: !!listBracket,
        relationName: relMatch ? relMatch[1] || null : null,
        hasFields,
        isRelation: /@relation/.test(rest) || !!listBracket && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(fType),
        line: rawLine.trim(),
      });
    }
  }
  models.set(name, { name, fields });
}

const typeIsScalar = (t) => ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal', 'Bytes'].includes(t);

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
      const opposite = target.fields.find(
        (o) => o.type === modelName && (!f.relationName || !o.relationName || o.relationName === f.relationName),
      );
      if (!opposite) {
        fail(modelName, `relation field "${f.name}" → ${f.type} is missing an opposite field on model ${f.type}`);
      }
    }
    // list side → target needs a scalar relation back (or it's an implicit m-n which prisma also accepts — flag only when target has NO relation to us)
    if (f.isList) {
      const opposite = target.fields.find(
        (o) => o.type === modelName && (!f.relationName || !o.relationName || o.relationName === f.relationName),
      );
      if (!opposite) {
        fail(modelName, `list field "${f.name}" (${f.type}[]) has no opposite relation field on model ${f.type}`);
      }
    }
  }
}

if (errors) {
  console.error(`\n${errors} relation problem(s) found in ${schemaPath}`);
  process.exit(1);
}
console.log(`✓ ${schemaPath}: all relations consistent across ${models.size} models`);

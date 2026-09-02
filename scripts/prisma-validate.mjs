#!/usr/bin/env node
/**
 * Validate the Prisma schema with Prisma's OWN parser (get-dmmf wasm) —
 * without downloading engines and without touching a database.
 *
 * `prisma validate` / `prisma db push` insist on downloading the query engine
 * first, which fails on restricted networks. This script loads the schema
 * engine wasm that already ships inside the `prisma` package and runs the same
 * validation, so schema mistakes (relations, @unique, attributes, …) surface
 * immediately with Prisma's own error messages.
 *
 * Usage: node scripts/prisma-validate.mjs [path-to-schema.prisma]
 */
import fs from 'node:fs';
import path from 'node:path';

const schemaPath = process.argv[2] || path.resolve('packages/backend/prisma/schema.prisma');
const wasmPath = path.resolve('node_modules/prisma/build/prisma_schema_build_bg.wasm');

if (!fs.existsSync(wasmPath)) {
  console.error(`✗ ${path.relative(process.cwd(), wasmPath)} not found — run "npm install" first`);
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf8');
const bytes = fs.readFileSync(wasmPath);
const decoder = new TextDecoder('utf-8');

// --- wasm-bindgen host glue (kept minimal: validate() only needs errors) -----
const slots = new Map();
let nextSlot = 1000;
let memory = null;
const decode = (ptr, len) => decoder.decode(new Uint8Array(memory.buffer, ptr, len));

// The import names carry a version-specific hash, so build the import object
// from what the module actually asks for.
const importObject = {};
for (const { module, name } of WebAssembly.Module.imports(new WebAssembly.Module(bytes))) {
  importObject[module] = importObject[module] || {};
  if (/error_new/.test(name)) {
    importObject[module][name] = (ptr, len) => {
      const idx = nextSlot++;
      slots.set(idx, new Error(decode(ptr, len)));
      return idx;
    };
  } else if (/setmessage/.test(name)) {
    importObject[module][name] = (slot, ptr, len) => {
      const err = slots.get(slot);
      if (err) err.message = decode(ptr, len);
    };
  } else if (/throw/.test(name)) {
    importObject[module][name] = (ptr, len) => {
      throw new Error(decode(ptr, len));
    };
  } else {
    importObject[module][name] = () => 0;
  }
}

const { instance } = await WebAssembly.instantiate(bytes, importObject);
memory = instance.exports.memory;
const { __wbindgen_malloc, __wbindgen_add_to_stack_pointer, validate } = instance.exports;

// validate() takes the schema wrapped in the same JSON envelope the CLI uses
const input = JSON.stringify({ prismaSchema: schema });
const utf8 = new TextEncoder().encode(input);
const ptr = __wbindgen_malloc(utf8.length, 1);
new Uint8Array(memory.buffer, ptr, utf8.length).set(utf8);
const ret = __wbindgen_add_to_stack_pointer(-16);

let status = 0;
try {
  validate(ret, ptr, utf8.length);
  status = new DataView(memory.buffer).getUint32(ret, true);
} catch (e) {
  console.error(`✗ ${schemaPath}\n${readable(e?.message || String(e))}`);
  process.exit(1);
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

/** Prisma hands the diagnostics back as a JSON envelope — unwrap it. */
function readable(raw) {
  const text = stripAnsi(raw);
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return stripAnsi(parsed.message);
  } catch {
    /* not JSON — print as-is */
  }
  return text;
}

if (status === 0) {
  console.log(`✓ ${schemaPath}: schema is valid`);
  process.exit(0);
}

const err = slots.get(status);
console.error(`✗ ${schemaPath}\n${readable(err?.message || 'invalid schema')}`);
process.exit(1);

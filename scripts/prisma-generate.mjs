#!/usr/bin/env node

/**
 * Generate a Prisma client without needlessly replacing its native query
 * engine on every build.
 *
 * On Windows, a running Node/Electron process keeps query_engine-*.dll.node
 * open. Prisma replaces that file atomically, so an otherwise harmless second
 * build fails with EPERM while the app or license server is running. A build
 * only needs to regenerate when the schema (or the installed Prisma version)
 * has changed; explicit db:generate scripts pass --force when regeneration is
 * requested.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  if (message) console.error(`[prisma] ${message}`);
  console.error('Usage: node scripts/prisma-generate.mjs --schema <path> [--force]');
  process.exit(2);
}

function readArguments() {
  const args = process.argv.slice(2);
  let schema;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      force = true;
    } else if (argument === '--schema' && args[index + 1]) {
      schema = args[++index];
    } else if (argument.startsWith('--schema=')) {
      schema = argument.slice('--schema='.length);
    } else {
      usage(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!schema) usage('A Prisma schema is required.');
  return { schema: resolve(process.cwd(), schema), force };
}

function parseClientOutput(schemaText, schemaPath) {
  const generatorBlock = schemaText.match(/generator\s+client\s*\{([\s\S]*?)\n?\}/m)?.[1] ?? '';
  const output = generatorBlock.match(/^\s*output\s*=\s*"([^"]+)"\s*$/m)?.[1];

  // prisma-client-js uses node_modules/.prisma/client when output is omitted.
  return output
    ? resolve(dirname(schemaPath), output)
    : resolve(repositoryRoot, 'node_modules', '.prisma', 'client');
}

function normaliseSchema(text) {
  return text.replace(/\r\n/g, '\n').trim();
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function prismaVersion() {
  try {
    return require('prisma/package.json').version;
  } catch {
    return 'unknown';
  }
}

function engineIsPresent(outputDirectory) {
  if (!existsSync(outputDirectory)) return false;
  return readdirSync(outputDirectory).some((file) => /^(?:lib)?query_engine[-_.].+/.test(file));
}

function generatedSchemaMatches(outputDirectory, schemaText) {
  const generatedSchema = join(outputDirectory, 'schema.prisma');
  if (!existsSync(generatedSchema)) return false;

  try {
    return normaliseSchema(readFileSync(generatedSchema, 'utf8')) === normaliseSchema(schemaText);
  } catch {
    return false;
  }
}

function markerPath(outputDirectory) {
  return join(outputDirectory, '.schema-hash.json');
}

function isUpToDate(outputDirectory, schemaText, schemaHash, version) {
  if (!engineIsPresent(outputDirectory)) return false;

  // Prefer the marker after this helper has generated the client so a Prisma
  // version or platform change is not hidden by an unchanged schema.
  if (existsSync(markerPath(outputDirectory))) {
    try {
      const marker = JSON.parse(readFileSync(markerPath(outputDirectory), 'utf8'));
      return (
        marker.schemaHash === schemaHash &&
        marker.prismaVersion === version &&
        marker.platform === process.platform &&
        marker.arch === process.arch
      );
    } catch {
      return false;
    }
  }

  // Clients generated before this helper was introduced do not have a marker.
  // Prisma copies the source schema into the generated client, which lets us
  // safely recognise those clients without replacing a DLL that may be in use.
  return generatedSchemaMatches(outputDirectory, schemaText);
}

function resolvePrismaCli(schemaPath) {
  try {
    return require.resolve('prisma/build/index.js', { paths: [dirname(schemaPath), repositoryRoot] });
  } catch (error) {
    console.error('[prisma] Could not locate the Prisma CLI. Run npm install first.');
    throw error;
  }
}

function generate(schemaPath) {
  const cli = resolvePrismaCli(schemaPath);
  // Keep Prisma's working directory at the package root, matching the
  // original workspace script so package-local .env files are still loaded.
  const packageRoot = resolve(dirname(schemaPath), '..');
  execFileSync(process.execPath, [cli, 'generate', '--schema', schemaPath], {
    cwd: packageRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

function main() {
  const { schema: schemaPath, force } = readArguments();
  if (!existsSync(schemaPath)) usage(`Schema not found: ${schemaPath}`);

  const schemaText = readFileSync(schemaPath, 'utf8');
  const schemaHash = sha256(normaliseSchema(schemaText));
  const version = prismaVersion();
  const outputDirectory = parseClientOutput(schemaText, schemaPath);

  if (!force && isUpToDate(outputDirectory, schemaText, schemaHash, version)) {
    console.log(`[prisma] Client is up to date; skipped generation (${outputDirectory}).`);
    return;
  }

  try {
    generate(schemaPath);
  } catch (error) {
    if (process.platform === 'win32') {
      console.error(
        '\n[prisma] Windows could not replace the generated query engine. ' +
          'Stop the license server, backend, Electron app, Prisma Studio, or any other Node process using this client, then rerun the build. ' +
          'Windows Defender can also hold the file briefly.\n',
      );
    }
    throw error;
  }

  writeFileSync(
    markerPath(outputDirectory),
    `${JSON.stringify(
      {
        schemaHash,
        prismaVersion: version,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  main();
} catch (error) {
  process.exitCode = error?.status ?? 1;
}

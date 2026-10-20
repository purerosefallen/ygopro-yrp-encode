import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { buildSync } from 'esbuild';

const ROOT = path.resolve(__dirname, '..');
let buildDir: string;

beforeAll(() => {
  buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yrp-entrypoints-'));
  fs.symlinkSync(
    path.join(ROOT, 'node_modules'),
    path.join(buildDir, 'node_modules'),
    'dir',
  );
  for (const format of ['cjs', 'esm'] as const) {
    buildSync({
      entryPoints: [path.join(ROOT, 'index.ts')],
      outfile: path.join(
        buildDir,
        format === 'cjs' ? 'index.cjs' : 'index.mjs',
      ),
      bundle: true,
      format,
      platform: format === 'cjs' ? 'node' : 'neutral',
      target: 'es2021',
      external: ['ygopro-deck-encode', '@cjser/lzma1'],
      logLevel: 'silent',
    });
  }
});

afterAll(() => {
  if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
});

it.each(['cjs', 'esm'])(
  'reads, clones, and writes decks from a native %s entrypoint',
  (format) => {
    const entry = path.join(
      buildDir,
      format === 'cjs' ? 'index.cjs' : 'index.mjs',
    );
    const fixture = path.join(ROOT, 'tests/ygopro-yrp-test.yrp');
    const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const entry = process.argv[1];
    const api = entry.endsWith('.cjs')
      ? createRequire(import.meta.url)(entry)
      : await import(pathToFileURL(entry));
    const replay = new api.YGOProYrp().fromYrp(fs.readFileSync(process.argv[2]));
    assert.equal(replay.hostName, 'p1');
    assert(replay.hostDeck.main.length > 0);
    replay.header.value.set(Array.from({ length: 15 }, (_, i) => i + 1));
    const copy = new api.YGOProYrp(replay);
    assert.deepEqual(copy.hostDeck, replay.hostDeck);
    assert.notEqual(copy.hostDeck.main, replay.hostDeck.main);
    for (const compressed of [false, true]) {
      copy.header.flag = compressed ? api.REPLAY_COMPRESSED_FLAG : 0;
      const parsed = new api.YGOProYrp().fromYrp(copy.toYrp());
      assert.deepEqual(parsed, copy);
    }
  `;
    expect(() =>
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script, entry, fixture],
        { stdio: 'pipe' },
      ),
    ).not.toThrow();
  },
);

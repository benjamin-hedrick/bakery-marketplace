// A .NET test must not block a thread on a task: .GetAwaiter().GetResult(), .Result, .Wait() in a test file.
//
// xUnit v2 runs tests on one worker thread per core and resumes awaited work on those same threads. A test or a constructor that blocks one of
// them on a call that yields (every call of the in-memory repository does, with Task.Yield) can leave no thread to resume it. With many cores
// that almost never happens; on the 2-core Azure agent the catalog tests ran for 38 minutes (2026-11-01) and passed in 4 seconds on a laptop.
// Use IAsyncLifetime (InitializeAsync) for set-up and await in the test body. A line may opt out with a `blocking-ok` comment and a reason.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BLOCKING = /\.GetAwaiter\(\)\.GetResult\(\)|\)\.Result\b|\bTask\.Result\b|\.Wait\(\s*\)|\.WaitAll\(|\.WaitAny\(/;

function* csFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'bin' || name === 'obj' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* csFiles(full);
    else if (name.endsWith('.cs')) yield full;
  }
}

function testDirectories() {
  const dirs = [path.join(root, 'tools', 'tests')];
  for (const service of readdirSync(path.join(root, 'services'))) {
    const tests = path.join(root, 'services', service, 'tests');
    try {
      if (statSync(tests).isDirectory()) dirs.push(tests);
    } catch {
      // a service without tests
    }
  }
  return dirs;
}

test('no .NET test file blocks a thread on a task', () => {
  const found = [];
  for (const dir of testDirectories()) {
    for (const file of csFiles(dir)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (BLOCKING.test(line) && !line.includes('blocking-ok')) {
            found.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
  }
  assert.deepEqual(
    found,
    [],
    `Blocking on a task in a test can deadlock xUnit on a machine with few cores:\n${found.join('\n')}`,
  );
});

test('the pattern finds what it is meant to find', () => {
  for (const line of [
    'x.VerifyVendorAsync(v).GetAwaiter().GetResult();',
    'var id = JsonOf(r).Result.GetProperty("id");',
    'task.Wait();',
    'Task.WaitAll(a, b);',
  ]) {
    assert.ok(BLOCKING.test(line), line);
  }
  for (const line of [
    'var result = await Run();',
    'Assert.Equal(1, outcome.Results.Count);',
    'await Task.WhenAll(a, b);',
  ]) {
    assert.ok(!BLOCKING.test(line), line);
  }
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { builtImages, exitCodeFor, pulledImages, renderSummary, summarize, TRIVY_IMAGE } from '../image-scan.mjs';

// WI-SEC-007: the exit-code logic and the reading of Trivy's report, on canned reports (no Docker, no network).

const vuln = (id, severity, fixed) => ({
  VulnerabilityID: id,
  PkgName: 'libexample',
  InstalledVersion: '1.0',
  ...(fixed ? { FixedVersion: fixed } : {}),
  Severity: severity,
});
const report = (...vulns) => ({ Results: [{ Target: 'alpine 3.20', Class: 'os-pkgs', Vulnerabilities: vulns }] });

describe('summarize', () => {
  test('counts each severity and lists only the high or critical findings that have a fix', () => {
    const s = summarize(
      report(
        vuln('CVE-1', 'CRITICAL', '1.1'),
        vuln('CVE-2', 'HIGH', undefined),
        vuln('CVE-3', 'HIGH', '2.0'),
        vuln('CVE-4', 'MEDIUM', '1.2'),
        vuln('CVE-5', 'LOW'),
      ),
    );
    assert.deepEqual(s.counts, { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1, UNKNOWN: 0 });
    assert.deepEqual(
      s.fixableHigh.map((f) => [f.id, f.fixed, f.severity]),
      [
        ['CVE-1', '1.1', 'CRITICAL'],
        ['CVE-3', '2.0', 'HIGH'],
      ],
    );
  });

  test('a report with no results or no vulnerabilities is clean, and an odd severity counts as unknown', () => {
    assert.deepEqual(summarize({}).counts, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 });
    assert.deepEqual(summarize({ Results: [{ Target: 'x' }] }).fixableHigh, []);
    assert.equal(summarize(report(vuln('CVE-6', 'SEVERE', '1'))).counts.UNKNOWN, 1);
  });

  test('findings in every layer of the report are read', () => {
    const two = {
      Results: [
        { Target: 'a', Vulnerabilities: [vuln('CVE-7', 'HIGH', '1')] },
        { Target: 'b', Vulnerabilities: [vuln('CVE-8', 'HIGH', '2')] },
      ],
    };
    assert.deepEqual(
      summarize(two).fixableHigh.map((f) => f.target),
      ['a', 'b'],
    );
  });
});

describe('exitCodeFor', () => {
  const clean = { reference: 'a', summary: summarize(report(vuln('CVE-1', 'LOW'))) };
  const unfixedHigh = { reference: 'b', summary: summarize(report(vuln('CVE-2', 'HIGH'))) };
  const fixableHigh = { reference: 'c', summary: summarize(report(vuln('CVE-3', 'CRITICAL', '9'))) };
  const failed = { reference: 'd', error: 'could not be pulled' };

  test('0 when nothing fixable is high or critical and every scan ran (unfixed and low findings are reported, not failed)', () => {
    assert.equal(exitCodeFor([clean, unfixedHigh]), 0);
    assert.equal(exitCodeFor([]), 0);
  });
  test('1 when any image has a high or critical finding with a fix', () => {
    assert.equal(exitCodeFor([clean, fixableHigh]), 1);
  });
  test('2 when a scan did not run and nothing failed: an image that was not scanned is not a pass', () => {
    assert.equal(exitCodeFor([clean, failed]), 2);
  });
  test('1 when there is a finding and a scan also did not run', () => {
    assert.equal(exitCodeFor([fixableHigh, failed]), 1);
  });
});

describe('the images', () => {
  test('the built images are the six the dev stack deploys, each tagged scan', () => {
    const refs = builtImages().map((b) => b.reference);
    assert.deepEqual(refs, [
      'bakery-catalog:scan',
      'bakery-ordering:scan',
      'bakery-bff:scan',
      'bakery-web:scan',
      'bakery-mock-oidc:scan',
      'bakery-seed:scan',
    ]);
  });

  test('the pulled images are the Compose services that have an image and no build, each once, sorted', () => {
    const config = {
      services: {
        a: { image: 'redis:7.4-alpine' },
        b: { image: 'redis:7.4-alpine' },
        c: { image: 'bakery-catalog:dev', build: { context: '.' } },
        d: { build: { context: '.' } },
        e: { image: 'jaegertracing/jaeger:2.22.0' },
      },
    };
    assert.deepEqual(pulledImages(config), ['jaegertracing/jaeger:2.22.0', 'redis:7.4-alpine']);
  });

  test('Trivy is pinned by digest', () => {
    assert.match(TRIVY_IMAGE, /^aquasec\/trivy@sha256:[0-9a-f]{64}$/);
  });
});

describe('renderSummary', () => {
  test('one row per image, the fixable findings listed, and an unscanned image named', () => {
    const results = [
      { reference: 'bakery-web:scan', summary: summarize(report(vuln('CVE-9', 'HIGH', '3.1'))) },
      { reference: 'redis:7.4-alpine', error: 'no such image' },
    ];
    const text = renderSummary(results, { when: '2026-11-23', trivy: 'aquasec/trivy sha256:8f6bb947' });
    assert.match(text, /\| `bakery-web:scan` \| 0 \| 1 \| 0 \| 0 \| 0 \| 1 \|/);
    assert.match(text, /\| CVE-9 \| libexample \| 1\.0 \| 3\.1 \| HIGH \|/);
    assert.match(text, /\| `redis:7\.4-alpine` \| not scanned: no such image/);
  });
});

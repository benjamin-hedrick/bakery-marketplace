#!/usr/bin/env node
// Turns the recordings of a film run (scripts/dev/film/film.mjs) into one video: the bakery's queue and the web customer stacked on the left, the captions in the middle,
// the phone on the right (register 163, docs/operations/demo-film.md).
//
//   node scripts/dev/film/compose.mjs --run artifacts/film/run-<time> [--out film.mp4]
//   node scripts/dev/film/compose.mjs --selftest        makes synthetic recordings and composes them (checks ffmpeg and the layout; no stack, no emulator)
//
// Needs ffmpeg and ffprobe (winget install Gyan.FFmpeg; found on PATH or in the winget package folder). Reads <run>/timeline.json: the wall-clock start of each recording and of
// each phone chunk, and the captions. Every source is put on one timeline measured from the earliest start. The phone's screenrecord writes frames only when the screen
// changes, so each chunk is padded at its end to its wall-clock length; gaps between chunks and before the first one are black.
// STATUS: written 2026-11-07; only --selftest has been run (and not against real recordings): the sync accuracy of real recordings is unchecked (register 163).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from '../../lib/local-stack.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const log = (m) => console.log(`[compose] ${m}`);
const FPS = 25;
const LAYOUT = {
  w: 1920,
  h: 1080,
  vendor: { x: 30, y: 30, w: 900, h: 506 },
  web: { x: 30, y: 544, w: 900, h: 506 },
  phone: { x: 1440, y: 40, w: 450, h: 1000 },
  text: { x: 975, w: 430 },
};

function findTool(name) {
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(base))
    for (const pkg of readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
      const inner = path.join(base, pkg);
      for (const v of readdirSync(inner).filter((d) => d.startsWith('ffmpeg-'))) {
        const exe = path.join(inner, v, 'bin', process.platform === 'win32' ? `${name}.exe` : name);
        if (existsSync(exe)) return exe;
      }
    }
  throw new Error(`${name} not found (winget install Gyan.FFmpeg)`);
}
const ffmpeg = () => findTool('ffmpeg');
const ffprobe = () => findTool('ffprobe');

/** The end of a recording's last frame, in seconds: the last packet's time plus one frame (the container's own duration is not reliable for these files). */
function videoSeconds(file) {
  const r = spawnSync(
    ffprobe(),
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const times = r.stdout.split(/\r?\n/).filter(Boolean).map(Number).filter(Number.isFinite);
  return times.length ? Math.max(...times) + 1 / FPS : 0;
}

/** Wraps a caption for the narrow middle column. */
function wrap(text, width = 22) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > width && line) (lines.push(line), (line = word));
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const fontOption = () => {
  const arial = 'C:/Windows/Fonts/arial.ttf';
  return process.platform === 'win32' && existsSync(arial) ? `fontfile='C\\:/Windows/Fonts/arial.ttf':` : '';
};

function compose(runDir, outFile) {
  const timeline = JSON.parse(readFileSync(path.join(runDir, 'timeline.json'), 'utf8'));
  const rec = timeline.recordings;
  const chunks = (rec.phone?.chunks ?? []).filter((c) =>
    existsSync(path.join(runDir, rec.phone.dir ?? 'phone', c.file)),
  );
  const starts = [rec.vendor?.startedAt, rec.web?.startedAt, chunks[0]?.startedAt].filter(Boolean);
  if (!rec.vendor?.file || !rec.web?.file)
    throw new Error('the timeline has no vendor or web recording (did the run fail? see timeline.json notes)');
  const t0 = Math.min(...starts);
  const end = rec.endedAt ?? Math.max(...starts) + 60000;
  const D = Math.ceil(((end - t0) / 1000) * 10) / 10 + 1;
  const off = (ms) => Math.max(0, (ms - t0) / 1000);
  log(
    `timeline: ${D.toFixed(1)} s from the earliest start; ${chunks.length} phone chunk(s); ${timeline.captions.length} caption(s)`,
  );

  const inputs = [path.join(runDir, rec.vendor.file), path.join(runDir, rec.web.file)];
  const chains = [];
  const L = LAYOUT;
  const fit = (i, name, box, startOffset) =>
    `[${i}:v]fps=${FPS},scale=${box.w}:${box.h},tpad=start_duration=${startOffset.toFixed(3)}:start_mode=clone,tpad=stop_duration=${D}:stop_mode=clone,trim=duration=${D},setpts=PTS-STARTPTS[${name}]`;
  chains.push(fit(0, 'vendor', L.vendor, off(rec.vendor.startedAt)));
  chains.push(fit(1, 'web', L.web, off(rec.web.startedAt)));

  // the phone: each chunk padded to its wall-clock length, black for gaps, joined in order
  const parts = [];
  let cursor = t0;
  chunks.forEach((c, k) => {
    const file = path.join(runDir, rec.phone.dir ?? 'phone', c.file);
    const idx = inputs.push(file) - 1;
    const wall = Math.max(0.5, (c.endedAt - c.startedAt) / 1000);
    const have = videoSeconds(file);
    const gap = Math.max(0, (c.startedAt - cursor) / 1000);
    const padEnd = Math.max(0, wall - have);
    chains.push(
      `[${idx}:v]fps=${FPS},scale=${L.phone.w}:${L.phone.h},tpad=start_duration=${gap.toFixed(3)}:start_mode=add:color=black,tpad=stop_duration=${padEnd.toFixed(3)}:stop_mode=clone,setpts=PTS-STARTPTS[p${k}]`,
    );
    parts.push(`[p${k}]`);
    cursor = c.endedAt;
  });
  if (parts.length)
    chains.push(
      `${parts.join('')}concat=n=${parts.length}:v=1:a=0,tpad=stop_duration=${D}:stop_mode=add:color=black,trim=duration=${D},setpts=PTS-STARTPTS[phone]`,
    );

  // captions: one text file each (the column is narrow; the text is wrapped here)
  const capDir = path.join(runDir, 'captions');
  rmSync(capDir, { recursive: true, force: true });
  mkdirSync(capDir, { recursive: true });
  const draw = [];
  // One caption at a time: each is held only as long as it takes to read (at most what the director asked for) and starts
  // after the previous one has gone, so a later one can be pushed back; a push of more than 3 s is reported so the director's timing can be tuned.
  let shownUntil = 0;
  [...timeline.captions]
    .sort((x, y) => x.at - y.at)
    .forEach((c, k) => {
      writeFileSync(path.join(capDir, `c${k}.txt`), wrap(c.text));
      const start = Math.max(off(c.at), shownUntil);
      const hold = Math.min(c.ms / 1000, 2 + 0.065 * c.text.length);
      if (start - off(c.at) > 3) log(`caption pushed back ${(start - off(c.at)).toFixed(1)} s: "${c.text}"`);
      shownUntil = start + hold + 0.4;
      const a = start.toFixed(2);
      const b = (start + hold).toFixed(2);
      draw.push(
        `drawtext=${fontOption()}textfile='captions/c${k}.txt':x=${L.text.x}:y=(h-text_h)/2:fontsize=44:line_spacing=12:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=18:enable='between(t,${a},${b})'`,
      );
    });
  // The vendor page's own heading sits at the top left of its frame, so its label goes to the empty middle of that header
  for (const [label, box, dx] of [
    ['Bakery queue (live)', L.vendor, 300],
    ['Web customer', L.web, 10],
    ['Phone customer', L.phone, 10],
  ])
    draw.push(
      `drawtext=${fontOption()}text='${label}':x=${box.x + dx}:y=${box.y + 8}:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6`,
    );

  const stage = [
    `color=c=0x1b1410:s=${L.w}x${L.h}:r=${FPS}:d=${D}[bg]`,
    ...chains,
    `[bg][vendor]overlay=${L.vendor.x}:${L.vendor.y}[a]`,
    `[a][web]overlay=${L.web.x}:${L.web.y}[b]`,
  ];
  stage.push(parts.length ? `[b][phone]overlay=${L.phone.x}:${L.phone.y}[c]` : '[b]null[c]');
  stage.push(`[c]${draw.join(',')}[out]`);

  const outPath = path.resolve(runDir, outFile);
  const argv = [
    '-y',
    '-v',
    'error',
    ...inputs.flatMap((f) => ['-i', f]),
    '-filter_complex',
    stage.join(';'),
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-t',
    String(D),
    outPath,
  ];
  const r = spawnSync(ffmpeg(), argv, { cwd: runDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr}`);
  const poster = path.join(runDir, 'poster.png');
  spawnSync(ffmpeg(), [
    '-y',
    '-v',
    'error',
    '-ss',
    String(Math.min(20, D / 2)),
    '-i',
    outPath,
    '-frames:v',
    '1',
    poster,
  ]);
  log(`written ${outPath} (${D.toFixed(0)} s) and ${poster}`);
  return outPath;
}

function selftest() {
  const dir = path.join(root, 'artifacts', 'film', 'selftest');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'video', 'vendor'), { recursive: true });
  mkdirSync(path.join(dir, 'video', 'web'), { recursive: true });
  mkdirSync(path.join(dir, 'phone'), { recursive: true });
  const gen = (name, src, size, secs) =>
    spawnSync(
      ffmpeg(),
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `${src}=s=${size}:r=25:d=${secs}`,
        '-c:v',
        'libvpx',
        '-b:v',
        '1M',
        path.join(dir, name),
      ],
      { encoding: 'utf8' },
    );
  gen('video/vendor/v.webm', 'testsrc2', '1280x720', 24);
  gen('video/web/w.webm', 'smptebars', '1280x720', 21);
  // two phone chunks with a gap, the second one short (a still screen writes few frames)
  for (const [name, secs] of [
    ['phone-1.mp4', 9],
    ['phone-2.mp4', 6],
  ])
    spawnSync(ffmpeg(), [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=s=540x1200:r=25:d=${secs}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      path.join(dir, 'phone', name),
    ]);
  const t = 1_800_000_000_000;
  writeFileSync(
    path.join(dir, 'timeline.json'),
    JSON.stringify({
      recordings: {
        vendor: { startedAt: t + 2000, dir: 'video/vendor', file: 'video/vendor/v.webm' },
        web: { startedAt: t + 3500, dir: 'video/web', file: 'video/web/w.webm' },
        phone: {
          dir: 'phone',
          chunks: [
            { file: 'phone-1.mp4', startedAt: t, endedAt: t + 12000 },
            { file: 'phone-2.mp4', startedAt: t + 13000, endedAt: t + 20000 },
          ],
        },
        endedAt: t + 26000,
      },
      captions: [
        { at: t + 4000, ms: 6000, text: 'Nora has a tree-nut allergy and is ordering on the web' },
        { at: t + 12000, ms: 6000, text: 'More customers order at the same time' },
      ],
    }),
  );
  const file = compose(dir, 'film.mp4');
  spawnSync(ffmpeg(), [
    '-y',
    '-v',
    'error',
    '-ss',
    '6',
    '-i',
    file,
    '-frames:v',
    '1',
    path.join(dir, 'selftest-frame.png'),
  ]);
  const d = videoSeconds(file);
  log(`selftest: ${d.toFixed(1)} s of video; frame at 6 s in ${path.join(dir, 'selftest-frame.png')}`);
  if (d < 20) throw new Error('the selftest video is shorter than the timeline');
}

try {
  if (args.includes('--selftest')) selftest();
  else {
    const run = opt('--run');
    if (!run) throw new Error('usage: compose.mjs --run <run dir> [--out film.mp4] | --selftest');
    compose(path.resolve(root, run), opt('--out', 'film.mp4'));
  }
} catch (e) {
  console.error(`[compose] ERROR: ${e.message}`);
  process.exit(1);
}

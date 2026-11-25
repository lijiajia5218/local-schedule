#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    tag: '',
    repo: process.env.GITHUB_REPOSITORY || 'lijiajia5218/local-schedule',
    out: 'latest.json',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--tag' && next) {
      args.tag = next;
      i += 1;
    } else if (key === '--repo' && next) {
      args.repo = next;
      i += 1;
    } else if (key === '--out' && next) {
      args.out = next;
      i += 1;
    }
  }
  if (!args.tag) {
    throw new Error('Missing required --tag argument (e.g. --tag v0.3.0)');
  }
  return args;
}

function ghJson(ghArgs) {
  const stdout = execFileSync('gh', ghArgs, { encoding: 'utf8' });
  return JSON.parse(stdout);
}

function findAsset(assets, suffix) {
  const match = assets.find((asset) => asset.name.endsWith(suffix));
  if (!match) {
    const available = assets.map((a) => a.name).join(', ');
    throw new Error(`Missing release asset ending with "${suffix}". Available: [${available}]`);
  }
  return match;
}

function main() {
  const { tag, repo, out } = parseArgs(process.argv.slice(2));
  const release = ghJson([
    'release',
    'view',
    tag,
    '--repo',
    repo,
    '--json',
    'tagName,body,publishedAt,assets',
  ]);

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const macBundle = findAsset(assets, '_aarch64.app.tar.gz');
  const macSigAsset = findAsset(assets, '_aarch64.app.tar.gz.sig');
  const winBundle = findAsset(assets, '_x64-setup.exe');
  const winSigAsset = findAsset(assets, '_x64-setup.exe.sig');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-schedule-sig-'));
  try {
    execFileSync(
      'gh',
      [
        'release',
        'download',
        tag,
        '--repo',
        repo,
        '--pattern',
        '*.sig',
        '--dir',
        tmpDir,
        '--clobber',
      ],
      { stdio: 'inherit' }
    );

    const macSig = fs.readFileSync(path.join(tmpDir, macSigAsset.name), 'utf8').trim();
    const winSig = fs.readFileSync(path.join(tmpDir, winSigAsset.name), 'utf8').trim();

    if (!macSig || !winSig) {
      throw new Error('Downloaded .sig file is empty');
    }

    const version = (release.tagName || tag).replace(/^v/, '');
    const manifest = {
      version,
      notes: release.body || '',
      pub_date: release.publishedAt || new Date().toISOString(),
      platforms: {
        'darwin-aarch64': {
          signature: macSig,
          url: macBundle.url,
        },
        'windows-x86_64': {
          signature: winSig,
          url: winBundle.url,
        },
      },
    };

    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Generated ${out} for ${tag} (${Object.keys(manifest.platforms).join(', ')})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();

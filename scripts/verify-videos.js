#!/usr/bin/env node

/**
 * verify-videos.js — Check all YouTube IDs in moments.json via oEmbed API
 * Run before every deploy: node scripts/verify-videos.js
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOMENTS_PATH = join(__dirname, '..', 'data', 'moments.json');

async function checkVideo(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return { ok: true, title: data.title };
    }
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const raw = await readFile(MOMENTS_PATH, 'utf-8');
  const moments = JSON.parse(raw);

  const entries = [];
  for (const [date, items] of Object.entries(moments)) {
    for (const m of items) {
      if (m.youtubeId) {
        entries.push({ date, id: m.id, youtubeId: m.youtubeId, title: m.title });
      }
    }
  }

  console.log(`\n🎬 Verifying ${entries.length} YouTube videos...\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const entry of entries) {
    const result = await checkVideo(entry.youtubeId);
    if (result.ok) {
      console.log(`  ✅  ${entry.date}  ${entry.id}  →  "${result.title}"`);
      passed++;
    } else {
      console.log(`  ❌  ${entry.date}  ${entry.id}  →  FAILED (${result.status || result.error})`);
      failures.push(entry);
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${entries.length} total`);

  if (failures.length > 0) {
    console.log(`\n  Failed videos:`);
    for (const f of failures) {
      console.log(`    • ${f.date} — ${f.id} (${f.youtubeId})`);
    }
    console.log('');
    process.exit(1);
  }

  console.log(`\n  All videos verified! ✅\n`);
}

main();

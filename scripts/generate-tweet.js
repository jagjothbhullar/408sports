#!/usr/bin/env node

/**
 * generate-tweet.js — Generate individual tweets for each moment on a date
 * Usage: node scripts/generate-tweet.js [MM-DD]
 * If no date given, uses today's date.
 * Outputs one tweet per moment, ready to post as a thread.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOMENTS_PATH = join(__dirname, '..', 'data', 'moments.json');

const TEAM_EMOJI = {
  warriors: '🏀',
  giants: '⚾',
  sharks: '🏒',
  '49ers': '🏈',
  stanford: '🌲',
  cal: '🐻',
  santaclara: '🏀',
  sjsu: '🏈',
  earthquakes: '⚽',
};

const MONTHS = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
];

function formatDateLabel(mmdd) {
  const [mm, dd] = mmdd.split('-').map(Number);
  return `${MONTHS[mm - 1]} ${dd}`;
}

async function main() {
  const dateArg = process.argv[2];
  let dateKey;

  if (dateArg && /^\d{2}-\d{2}$/.test(dateArg)) {
    dateKey = dateArg;
  } else {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateKey = `${mm}-${dd}`;
  }

  const raw = await readFile(MOMENTS_PATH, 'utf-8');
  const moments = JSON.parse(raw);
  const items = (moments[dateKey] || []).filter(m => m.youtubeId);

  if (items.length === 0) {
    console.error(`No moments with videos found for ${dateKey}`);
    process.exit(1);
  }

  const label = formatDateLabel(dateKey);
  const separator = '═'.repeat(40);

  console.log(`\n${separator}`);
  console.log(`  TWEETS FOR ${label} (${items.length} moments)`);
  console.log(`${separator}\n`);

  items.forEach((m, i) => {
    const emoji = TEAM_EMOJI[m.team] || '⚡';
    const lines = [];

    lines.push(`${emoji} THIS DAY IN THE 408 — ${label}`);
    lines.push('');
    lines.push(m.description);
    lines.push('');
    lines.push(`▶ https://www.youtube.com/watch?v=${m.youtubeId}`);
    lines.push('');
    lines.push(`Watch more Bay Area sports history: sports408.tv/thisday/${dateKey}`);
    lines.push(`#BayArea #Sports408`);

    const tweet = lines.join('\n');

    console.log(`── Tweet ${i + 1}/${items.length} ──`);
    console.log(tweet);
    console.log(`(${tweet.length} chars)\n`);
  });
}

main();

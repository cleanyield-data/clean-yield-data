// Shared helpers for the weekly jobs: ISO weeks, CSV, HTTP with retries, paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const UA = 'CleanYieldIndex/1.0 (+https://github.com/cleanyield-data/clean-yield-data)';

/** true when the module is the script being run (node jobs/x.mjs), false when imported by tests. */
export function isMain(metaUrl) {
    return Boolean(process.argv[1]) && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

// ---------- ISO weeks (UTC) ----------

/** ISO week label of a date: '2026-W44'. */
export function isoWeekOf(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of the same week decides the year
    const year = d.getUTCFullYear();
    const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday and Sunday (UTC dates) of an ISO week label. */
export function weekRange(label) {
    const m = /^(\d{4})-W(\d{2})$/.exec(label);
    if (!m) throw new Error(`Invalid ISO week: ${label}`);
    const [year, week] = [Number(m[1]), Number(m[2])];
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    if (isoWeekOf(monday) !== label) throw new Error(`Invalid ISO week: ${label}`);
    return { monday, sunday };
}

/** The last complete ISO week (Monday–Sunday) before `now`. */
export function previousIsoWeek(now = new Date()) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - 7);
    return isoWeekOf(d);
}

/** ISO week label that comes `n` weeks before `label`. */
export function shiftWeek(label, n) {
    const { monday } = weekRange(label);
    monday.setUTCDate(monday.getUTCDate() - 7 * n);
    return isoWeekOf(monday);
}

export const ymd = (d) => d.toISOString().slice(0, 10);
export const compactYmd = (d) => ymd(d).replace(/-/g, '');

/** Week to process: $WEEK if given (e.g. to re-run one), else the last complete ISO week. */
export function targetWeek(now = new Date()) {
    const w = process.env.WEEK?.trim();
    if (w) {
        weekRange(w);
        return w;
    }
    return previousIsoWeek(now);
}

// ---------- CSV ----------

export function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
    return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

/** Minimal RFC 4180 parser → array of objects keyed by the header. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); cell = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const [header, ...body] = rows;
    if (!header) return [];
    return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export function readCsv(file) {
    return fs.existsSync(file) ? parseCsv(fs.readFileSync(file, 'utf8')) : [];
}

/** Rewrites a cumulative CSV: drops the rows of `week` (so re-runs never duplicate) and appends the new ones. */
export function upsertWeekRows(file, columns, week, newRows) {
    const kept = readCsv(file).filter((r) => r.week !== week);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, toCsv(columns, [...kept, ...newRows]));
    return kept.length + newRows.length;
}

// ---------- HTTP ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with retries (default 2 retries = 3 attempts). Retries network errors, 429 and 5xx.
 * Throws an Error with `.status` on a definitive failure.
 */
export async function getJson(url, { headers = {}, retries = 2, timeoutMs = 60_000 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(2_000 * attempt);
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
            if (res.ok) return await res.json();
            lastErr = Object.assign(new Error(`HTTP ${res.status} for ${url}`), { status: res.status });
            if (res.status !== 429 && res.status < 500) break; // 4xx: retrying will not help
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

export function writeFile(rel, content) {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
}

export function log(msg) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

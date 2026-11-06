// Step 1 · FMCSA: new USDOT registrations of the last complete ISO week (Monday–Sunday, UTC).
// Source: FMCSA Company Census File (data.transportation.gov, dataset az4n-8mr2), SoQL API.
// Privacy: phones, faxes, emails, street, ZIP, company officers and DBA names are never requested nor written;
// the legal name is kept only when the record says the business is a CORPORATION.
import path from 'node:path';
import { ROOT, compactYmd, getJson, isMain, log, targetWeek, toCsv, upsertWeekRows, weekRange, writeFile, ymd } from './lib.mjs';

const API = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const PAGE = 5000;
export const MIN_ROWS = 500;
export const MAX_ROWS = 10_000;

/** The only columns requested from the API. Nothing personal is ever asked for. */
export const SELECT = [
    'dot_number', 'add_date', 'legal_name', 'business_org_desc', 'carrier_operation', 'classdef', 'phy_city', 'phy_state',
    'truck_units', 'bus_units', 'total_drivers', 'hm_ind', 'status_code',
];

/** Columns of the published CSVs, in order. */
export const COLUMNS = [
    'week', 'dot_number', 'add_date', 'legal_name', 'carrier_operation', 'classification', 'phy_city', 'phy_state',
    'power_units', 'drivers', 'hazmat', 'status', 'safer_url',
];

export const SUMMARY_COLUMNS = [
    'week', 'phy_state', 'carrier_operation', 'total', 'fleet_0_or_unknown', 'fleet_1', 'fleet_2_5', 'fleet_6_20', 'fleet_21_plus', 'hazmat_share',
];

const OPERATIONS = { A: 'interstate', B: 'intrastate_hazmat', C: 'intrastate_non_hazmat' };

const clean = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
};
const toInt = (v) => {
    const s = clean(v);
    if (s === null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
};

/** Trucks + buses, like SAFER (raw census power_units is inflated for part of the 2026 records). */
export function powerUnits(row) {
    const trucks = toInt(row.truck_units);
    const buses = toInt(row.bus_units);
    if (trucks === null && buses === null) return null;
    return (trucks ?? 0) + (buses ?? 0);
}

export const saferUrl = (dot) =>
    `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`;

/**
 * Raw API row → published row. Whitelist: only COLUMNS can come out, whatever the input contains.
 * legal_name only for corporations (sole proprietors' names are personal data).
 */
export function cleanRow(row, week) {
    const dot = clean(row.dot_number);
    const add = clean(row.add_date);
    const isCorp = clean(row.business_org_desc)?.toUpperCase() === 'CORPORATION';
    const out = {
        week,
        dot_number: dot,
        add_date: add && /^\d{8}$/.test(add) ? `${add.slice(0, 4)}-${add.slice(4, 6)}-${add.slice(6, 8)}` : null,
        legal_name: isCorp ? clean(row.legal_name) : null,
        carrier_operation: OPERATIONS[clean(row.carrier_operation)?.toUpperCase()] ?? null,
        classification: clean(row.classdef)?.toLowerCase() ?? null,
        phy_city: clean(row.phy_city),
        phy_state: clean(row.phy_state)?.toUpperCase() ?? null,
        power_units: powerUnits(row),
        drivers: toInt(row.total_drivers),
        hazmat: clean(row.hm_ind)?.toUpperCase() === 'Y',
        status: clean(row.status_code)?.toUpperCase() ?? null,
        safer_url: dot ? saferUrl(dot) : null,
    };
    return Object.fromEntries(COLUMNS.map((c) => [c, out[c]]));
}

export function fleetBucket(units) {
    if (units === null || units === undefined || units <= 0) return 'fleet_0_or_unknown';
    if (units === 1) return 'fleet_1';
    if (units <= 5) return 'fleet_2_5';
    if (units <= 20) return 'fleet_6_20';
    return 'fleet_21_plus';
}

/** One row per state × carrier operation. */
export function summarize(rows, week) {
    const groups = new Map();
    for (const r of rows) {
        const key = `${r.phy_state ?? ''}|${r.carrier_operation ?? ''}`;
        let g = groups.get(key);
        if (!g) {
            g = { week, phy_state: r.phy_state ?? '', carrier_operation: r.carrier_operation ?? '', total: 0, fleet_0_or_unknown: 0, fleet_1: 0, fleet_2_5: 0, fleet_6_20: 0, fleet_21_plus: 0, hazmat: 0 };
            groups.set(key, g);
        }
        g.total++;
        g[fleetBucket(r.power_units)]++;
        if (r.hazmat) g.hazmat++;
    }
    return [...groups.values()]
        .map(({ hazmat, ...g }) => ({ ...g, hazmat_share: Math.round((hazmat / g.total) * 10_000) / 10_000 }))
        .sort((a, b) => a.phy_state.localeCompare(b.phy_state) || a.carrier_operation.localeCompare(b.carrier_operation));
}

export function buildQuery(from, to, offset) {
    const p = new URLSearchParams({
        $select: SELECT.join(','),
        $where: `add_date between '${from}' and '${to}'`,
        $order: 'dot_number',
        $limit: String(PAGE),
        $offset: String(offset),
    });
    return `${API}?${p}`;
}

async function fetchWeek(week) {
    const { monday, sunday } = weekRange(week);
    const [from, to] = [compactYmd(monday), compactYmd(sunday)];
    const headers = process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {};
    const raw = [];
    for (let offset = 0; ; offset += PAGE) {
        const page = await getJson(buildQuery(from, to, offset), { headers, retries: 3 });
        if (!Array.isArray(page)) throw new Error('Unexpected FMCSA response (not an array)');
        raw.push(...page);
        log(`FMCSA ${week}: ${raw.length} rows`);
        if (page.length < PAGE) break;
        if (offset > MAX_ROWS * 2) throw new Error('FMCSA pagination did not end');
    }
    return { raw, from: ymd(monday), to: ymd(sunday) };
}

export async function main() {
    const week = targetWeek();
    const { raw, from, to } = await fetchWeek(week);
    const seen = new Set();
    const rows = [];
    for (const r of raw) {
        const c = cleanRow(r, week);
        if (!c.dot_number || seen.has(c.dot_number)) continue;
        if (!c.add_date || c.add_date < from || c.add_date > to) continue;
        seen.add(c.dot_number);
        rows.push(c);
    }
    if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) {
        throw new Error(`FMCSA control failed: ${rows.length} rows for ${week} (expected ${MIN_ROWS}–${MAX_ROWS}). Nothing is published.`);
    }
    const csv = toCsv(COLUMNS, rows);
    writeFile(`datasets/fmcsa/weeks/${week}.csv`, csv);
    writeFile('datasets/fmcsa/new_carriers_latest.csv', csv);
    const total = upsertWeekRows(path.join(ROOT, 'datasets/fmcsa/weekly_summary.csv'), SUMMARY_COLUMNS, week, summarize(rows, week));
    writeFile('datasets/WEEK', `${week}\n`);
    log(`FMCSA ${week} (${from}..${to}): ${rows.length} new registrations written; weekly_summary has ${total} rows.`);
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}

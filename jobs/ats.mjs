// Step 2 · ATS: Weekly Tech Hiring Index from the public Greenhouse and Lever job board APIs.
// Only counts are computed and published: job texts are read in memory to detect technologies and then dropped.
// Nothing from a job posting (title, description, URL) is written to disk; the state keeps only job IDs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, getJson, isMain, log, readCsv, shiftWeek, targetWeek, upsertWeekRows, writeFile, ymd } from './lib.mjs';
import { countryFromLocation, isoCode } from './geo.mjs';

export const CONCURRENCY = 4;
export const MAX_FAILURE_SHARE = 0.10;
const LEVER_GAP_MS = 1_000; // api.lever.co robots.txt: Crawl-delay 1
const STATE_FILE = path.join(ROOT, 'state/ats-ids.json.gz');

export const COMPANY_COLUMNS = [
    'week', 'company', 'ats', 'open_jobs', 'new_jobs', 'closed_jobs', 'remote_share', 'with_salary_share',
    'median_annual_salary_usd', 'top_departments', 'countries',
];
export const TECH_COLUMNS = ['week', 'technology', 'jobs_mentioning', 'companies_mentioning', 'share_of_jobs', 'change_vs_prev_week', 'panel_open_jobs'];

// ---------- Technologies ----------

export function loadTechnologies(file = path.join(ROOT, 'technologies.txt')) {
    return fs.readFileSync(file, 'utf8').split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'))
        .map((l) => {
            const [name, source, flags = ''] = l.split('\t');
            return [name, new RegExp(source, flags.trim())];
        });
}

export function techsIn(tech, text) {
    const hay = text.slice(0, 30_000);
    return tech.filter(([, re]) => re.test(hay)).map(([name]) => name);
}

// ---------- Text helpers (in memory only) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
        const k = e.toLowerCase();
        if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
        if (k.startsWith('#') && k !== '#39') return String.fromCodePoint(Number(k.slice(1)));
        return ENTITIES[k] ?? m;
    });
}
export function htmlToText(html) {
    if (!html) return '';
    let s = decodeEntities(String(html)); // Greenhouse escapes the HTML once
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ');
    return decodeEntities(s).replace(/[ \t]+/g, ' ');
}

// ---------- Salary (structured ATS data only, same rules as the ATS Jobs Scraper) ----------

const ANNUAL = { year: 1, month: 12, week: 52, day: 260, hour: 2080 };
export function normalizePeriod(v) {
    const s = String(v ?? '').toLowerCase();
    if (!s.trim()) return null;
    if (/hour|hr\b|hourly/.test(s)) return 'hour';
    if (/day|daily/.test(s)) return 'day';
    if (/week/.test(s)) return 'week';
    if (/month/.test(s)) return 'month';
    if (/year|annual|yr\b|salary|base/.test(s)) return 'year';
    return null;
}

/** {min,max,currency,period} → annual USD midpoint, or null. fx = units of currency per 1 USD. */
export function annualUsdMid(r, fx) {
    const nums = [r.min, r.max].filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (!nums.length || !r.period || !r.currency) return null;
    const cur = r.currency.toUpperCase();
    const rate = cur === 'USD' ? 1 : fx?.[cur];
    if (!rate) return null;
    const mid = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round((mid * ANNUAL[r.period]) / rate);
}

function greenhouseSalary(job) {
    const ranges = (job.pay_input_ranges ?? []).filter((r) => r && (typeof r.min_cents === 'number' || typeof r.max_cents === 'number'));
    if (!ranges.length) return null;
    const r = ranges[0];
    const min = typeof r.min_cents === 'number' ? r.min_cents / 100 : null;
    const max = typeof r.max_cents === 'number' ? r.max_cents / 100 : null;
    const same = ranges.filter((x) => x.currency_type === r.currency_type);
    const mins = same.map((x) => x.min_cents).filter((n) => typeof n === 'number').map((n) => n / 100);
    const maxs = same.map((x) => x.max_cents ?? x.min_cents).filter((n) => typeof n === 'number').map((n) => n / 100);
    const period = normalizePeriod(`${r.title ?? ''} ${htmlToText(r.blurb ?? '')}`) ?? ((max ?? min ?? 0) >= 15_000 ? 'year' : 'hour');
    return { min: mins.length ? Math.min(...mins) : min, max: maxs.length ? Math.max(...maxs) : max, currency: r.currency_type ?? null, period };
}

function leverSalary(p) {
    const r = p.salaryRange;
    if (!r || (typeof r.min !== 'number' && typeof r.max !== 'number') || r.interval === 'one-time') return null;
    return { min: r.min ?? null, max: r.max ?? null, currency: r.currency ?? null, period: normalizePeriod(r.interval) };
}

// ---------- Mapping one posting → facts (no text kept) ----------

const REMOTE_RE = /\bremote\b|\banywhere\b|work from home|\bwfh\b/i;

export function greenhouseFacts(job, tech) {
    const loc = job.location?.name ?? '';
    const offices = (job.offices ?? []).map((o) => o?.location || o?.name).filter(Boolean);
    const workplaceMeta = (job.metadata ?? []).find((m) => m?.name && /location type|workplace|remote|work type|work arrangement/i.test(m.name));
    const metaValue = Array.isArray(workplaceMeta?.value) ? workplaceMeta.value.join(' ') : String(workplaceMeta?.value ?? '');
    const remote = /remote/i.test(metaValue) || REMOTE_RE.test(loc);
    const country = countryFromLocation(loc) ?? offices.map(countryFromLocation).find(Boolean) ?? null;
    return {
        id: String(job.id),
        techs: techsIn(tech, `${job.title ?? ''}\n${htmlToText(job.content)}`),
        remote,
        country,
        department: job.departments?.[0]?.name?.trim() || null,
        salary: greenhouseSalary(job),
    };
}

export function leverFacts(p, tech) {
    const cat = p.categories ?? {};
    const loc = cat.location ?? '';
    const lists = (p.lists ?? []).map((l) => `${l?.text ?? ''}\n${htmlToText(l?.content)}`).join('\n');
    const text = [p.text, p.descriptionPlain || htmlToText(p.description), lists, p.additionalPlain || htmlToText(p.additional)].filter(Boolean).join('\n');
    const remote = p.workplaceType === 'remote' || (p.workplaceType !== 'onsite' && p.workplaceType !== 'hybrid' && REMOTE_RE.test(`${loc} ${(cat.allLocations ?? []).join(' ')}`));
    return {
        id: String(p.id),
        techs: techsIn(tech, text),
        remote,
        country: isoCode(p.country) ?? countryFromLocation(loc) ?? null,
        department: (cat.department || cat.team || '').trim() || null,
        salary: leverSalary(p),
    };
}

// ---------- Weekly aggregation ----------

const round4 = (x) => Math.round(x * 10_000) / 10_000;
export function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** IDs now vs. IDs in the previous snapshot. prevIds null (no baseline) → nulls. */
export function diffIds(currentIds, prevIds) {
    if (!prevIds) return { new_jobs: null, closed_jobs: null };
    const prev = new Set(prevIds);
    const cur = new Set(currentIds);
    let added = 0;
    let closed = 0;
    for (const id of cur) if (!prev.has(id)) added++;
    for (const id of prev) if (!cur.has(id)) closed++;
    return { new_jobs: added, closed_jobs: closed };
}

export function companyRow(week, company, facts, prevIds, fx) {
    const n = facts.length;
    const salaries = facts.map((f) => (f.salary ? annualUsdMid(f.salary, fx) : null)).filter((x) => x !== null);
    const depts = new Map();
    for (const f of facts) if (f.department) depts.set(f.department, (depts.get(f.department) ?? 0) + 1);
    const top = [...depts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([d]) => d.replace(/;/g, ','));
    return {
        week,
        company: company.company,
        ats: company.ats,
        open_jobs: n,
        ...diffIds(facts.map((f) => f.id), prevIds),
        remote_share: n ? round4(facts.filter((f) => f.remote).length / n) : null,
        with_salary_share: n ? round4(facts.filter((f) => f.salary).length / n) : null,
        median_annual_salary_usd: salaries.length >= 5 ? median(salaries) : null,
        top_departments: top.join(';'),
        countries: new Set(facts.map((f) => f.country).filter(Boolean)).size,
    };
}

export function techRows(week, tech, perCompany, prevTechRows) {
    const panelOpen = perCompany.reduce((a, c) => a + c.facts.length, 0);
    const prev = new Map(prevTechRows.map((r) => [r.technology, Number(r.jobs_mentioning)]));
    return tech.map(([name]) => {
        let jobs = 0;
        let cos = 0;
        for (const c of perCompany) {
            const k = c.facts.filter((f) => f.techs.includes(name)).length;
            jobs += k;
            if (k) cos++;
        }
        return {
            week,
            technology: name,
            jobs_mentioning: jobs,
            companies_mentioning: cos,
            share_of_jobs: panelOpen ? round4(jobs / panelOpen) : 0,
            change_vs_prev_week: prev.has(name) ? jobs - prev.get(name) : null,
            panel_open_jobs: panelOpen,
        };
    });
}

// ---------- State (job IDs only) ----------

export function readState(file = STATE_FILE) {
    if (!fs.existsSync(file)) return { current: null, previous: null };
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
}

/** Snapshot to compare against: if this week was already run (re-run), the one before it. */
export function baselineFor(state, week) {
    if (state.current?.week === week) return state.previous;
    return state.current;
}

// ---------- Fetching ----------

let leverChain = Promise.resolve();
function leverSlot() {
    const slot = leverChain.then(() => new Promise((r) => setTimeout(r, LEVER_GAP_MS)));
    leverChain = slot;
    return leverChain;
}

async function fetchCompany(c, tech) {
    if (c.ats === 'greenhouse') {
        const body = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs?content=true&pay_transparency=true`, { timeoutMs: 120_000 });
        if (!Array.isArray(body?.jobs)) throw new Error('unexpected Greenhouse response');
        return body.jobs.map((j) => greenhouseFacts(j, tech));
    }
    if (c.ats === 'lever') {
        await leverSlot();
        const body = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c.token)}?mode=json`, { timeoutMs: 120_000 });
        if (!Array.isArray(body)) throw new Error('unexpected Lever response');
        return body.map((p) => leverFacts(p, tech));
    }
    throw new Error(`unknown ATS ${c.ats}`);
}

async function loadFx() {
    try {
        const b = await getJson('https://open.er-api.com/v6/latest/USD', { retries: 1, timeoutMs: 20_000 });
        if (b?.result === 'success' && typeof b.rates?.EUR === 'number') return b.rates;
    } catch { /* USD-only salaries if the FX source is down */ }
    log('FX rates unavailable: only USD salaries are used this week.');
    return null;
}

const keyOf = (c) => `${c.ats}:${c.token.toLowerCase()}`;

export async function main() {
    const week = targetWeek();
    const tech = loadTechnologies();
    const panel = readCsv(path.join(ROOT, 'datasets/ats/companies.csv')).filter((c) => c.company && c.token && (!c.added || c.added <= week));
    if (panel.length < 50) throw new Error(`Panel too small (${panel.length} companies)`);
    const fx = await loadFx();
    const state = readState();
    const baseline = baselineFor(state, week);
    const snapshot = ymd(new Date());

    const results = [];
    const failures = [];
    let i = 0;
    const worker = async () => {
        while (i < panel.length) {
            const c = panel[i++];
            try {
                results.push({ company: c, facts: await fetchCompany(c, tech) });
            } catch (e) {
                failures.push({ company: c.company, ats: c.ats, token: c.token, error: String(e.message ?? e).slice(0, 200) });
                log(`  failed: ${c.company} (${c.ats}/${c.token}): ${e.message}`);
            }
            const done = results.length + failures.length;
            if (done % 50 === 0) log(`ATS ${done}/${panel.length}`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const share = failures.length / panel.length;
    if (share > MAX_FAILURE_SHARE) {
        throw new Error(`ATS control failed: ${failures.length}/${panel.length} companies failed (${(share * 100).toFixed(1)}% > 10%). Nothing is published.`);
    }

    results.sort((a, b) => a.company.company.localeCompare(b.company.company, 'en', { sensitivity: 'base' }));
    const companyRows = results.map((r) => companyRow(week, r.company, r.facts, baseline?.companies?.[keyOf(r.company)] ?? null, fx));
    const prevWeek = shiftWeek(week, 1);
    const techFile = path.join(ROOT, 'datasets/ats/tech_weekly.csv');
    const prevTech = readCsv(techFile).filter((r) => r.week === prevWeek);
    const tRows = techRows(week, tech, results, prevTech);

    upsertWeekRows(path.join(ROOT, 'datasets/ats/company_weekly.csv'), COMPANY_COLUMNS, week, companyRows);
    fs.copyFileSync(path.join(ROOT, 'technologies.txt'), path.join(ROOT, 'datasets/ats/technologies.txt')); // ships with the dataset
    upsertWeekRows(techFile, TECH_COLUMNS, week, tRows);

    // State: IDs only. Companies that failed this week keep their last known IDs so next week's diff stays right.
    const ids = {};
    for (const [k, v] of Object.entries(baseline?.companies ?? {})) ids[k] = v;
    for (const r of results) ids[keyOf(r.company)] = r.facts.map((f) => f.id).sort();
    const next = { previous: state.current?.week === week ? state.previous : state.current, current: { week, snapshot, companies: ids } };
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, zlib.gzipSync(JSON.stringify(next)));

    const run = {
        week, snapshot, panel: panel.length, ok: results.length, failed: failures, hasBaseline: Boolean(baseline),
        openJobs: tRows[0]?.panel_open_jobs ?? 0,
    };
    writeFile('state/ats-last-run.json', JSON.stringify(run, null, 2) + '\n');
    log(`ATS ${week}: ${results.length}/${panel.length} companies, ${run.openJobs} open jobs, ${failures.length} failed${baseline ? '' : ' (first snapshot: no new/closed yet)'}.`);
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}

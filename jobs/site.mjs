// Step 3 · Data for the public page: site/data/index.json + a fixed page per week (site/weeks/<week>.html).
//
// index.json shape:
// {
//   week, weekStart, weekEnd, snapshot, panelCompanies, firstSnapshot,
//   totals: { openJobs, openJobsPrev, newJobs, closedJobs, newCarriers, newCarriersPrev },   // *Prev / new* null on the first week
//   tech: [[name, jobs, shareOfJobs, companies, changeVsPrevWeek|null, [[week, jobs, share], ... up to 12 weeks]]],  // top 20
//   companiesBasis: 'new' | 'open',            // 'open' only while there is no previous snapshot
//   companies: [[company, newJobs|null, openJobs]],   // top 10
//   fmcsaStates: [[state, newRegistrations]],          // top 10
//   weeks: ['2026-W44', ...],                          // pages in site/weeks/, newest first
//   generatedAt
// }
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, isMain, log, readCsv, shiftWeek, weekRange, writeFile, ymd } from './lib.mjs';

const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

export function buildIndex({ week, techRows, companyRows, fmcsaSummary, run, weeks }) {
    const prevWeek = shiftWeek(week, 1);
    const thisTech = techRows.filter((r) => r.week === week);
    const thisCos = companyRows.filter((r) => r.week === week);
    if (!thisTech.length || !thisCos.length) throw new Error(`No ATS rows for ${week}`);
    const prevCos = companyRows.filter((r) => r.week === prevWeek);
    const firstSnapshot = thisCos.every((r) => r.new_jobs === '');

    const openJobs = thisCos.reduce((a, r) => a + Number(r.open_jobs), 0);
    const sumOrNull = (rows, col) => (rows.some((r) => r[col] !== '') ? rows.reduce((a, r) => a + (num(r[col]) ?? 0), 0) : null);

    const last12 = Array.from({ length: 12 }, (_, i) => shiftWeek(week, 11 - i));
    const series = (name) => techRows
        .filter((r) => r.technology === name && last12.includes(r.week))
        .sort((a, b) => a.week.localeCompare(b.week))
        .map((r) => [r.week, Number(r.jobs_mentioning), Number(r.share_of_jobs)]);
    const tech = [...thisTech]
        .sort((a, b) => Number(b.jobs_mentioning) - Number(a.jobs_mentioning) || a.technology.localeCompare(b.technology))
        .slice(0, 20)
        .map((r) => [r.technology, Number(r.jobs_mentioning), Number(r.share_of_jobs), Number(r.companies_mentioning), num(r.change_vs_prev_week), series(r.technology)]);

    const companiesBasis = firstSnapshot ? 'open' : 'new';
    const companies = [...thisCos]
        .sort((a, b) => (companiesBasis === 'new' ? (num(b.new_jobs) ?? -1) - (num(a.new_jobs) ?? -1) : 0) || Number(b.open_jobs) - Number(a.open_jobs))
        .slice(0, 10)
        .map((r) => [r.company, num(r.new_jobs), Number(r.open_jobs)]);

    const carriersBy = (w) => fmcsaSummary.filter((r) => r.week === w);
    const thisFm = carriersBy(week);
    if (!thisFm.length) throw new Error(`No FMCSA summary rows for ${week}`);
    const prevFm = carriersBy(prevWeek);
    const byState = new Map();
    for (const r of thisFm) byState.set(r.phy_state || '??', (byState.get(r.phy_state || '??') ?? 0) + Number(r.total));
    const fmcsaStates = [...byState.entries()].filter(([s]) => s !== '??').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);

    const { monday, sunday } = weekRange(week);
    return {
        week,
        weekStart: ymd(monday),
        weekEnd: ymd(sunday),
        snapshot: run.snapshot,
        panelCompanies: thisCos.length,
        firstSnapshot,
        totals: {
            openJobs,
            openJobsPrev: prevCos.length ? prevCos.reduce((a, r) => a + Number(r.open_jobs), 0) : null,
            newJobs: sumOrNull(thisCos, 'new_jobs'),
            closedJobs: sumOrNull(thisCos, 'closed_jobs'),
            newCarriers: thisFm.reduce((a, r) => a + Number(r.total), 0),
            newCarriersPrev: prevFm.length ? prevFm.reduce((a, r) => a + Number(r.total), 0) : null,
        },
        tech,
        companiesBasis,
        companies,
        fmcsaStates,
        weeks,
        generatedAt: new Date().toISOString(),
    };
}

/** Week page = the main page with the data embedded and a fixed canonical URL. */
export function weekPage(template, data) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const url = `https://cleanyield-data.github.io/clean-yield-data/weeks/${data.week}.html`;
    return template
        .replace('<!--INDEX_DATA-->', `<script>window.INDEX_DATA = ${json};</script>`)
        .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">\n<base href="../">`)
        .replace('<title>Weekly Tech Hiring Index</title>', `<title>Weekly Tech Hiring Index · ${data.week}</title>`)
        .replace('href="data/index.json"', `href="weeks/${data.week}.json"`);
}

export async function main() {
    const week = fs.readFileSync(path.join(ROOT, 'datasets/WEEK'), 'utf8').trim();
    const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'state/ats-last-run.json'), 'utf8'));
    if (run.week !== week) throw new Error(`ATS run is for ${run.week}, FMCSA for ${week}: run both steps for the same week.`);
    const weeksDir = path.join(ROOT, 'site/weeks');
    const existing = fs.existsSync(weeksDir) ? fs.readdirSync(weeksDir).filter((f) => /^\d{4}-W\d{2}\.html$/.test(f)).map((f) => f.slice(0, 8)) : [];
    const weeks = [...new Set([...existing, week])].sort().reverse();

    const data = buildIndex({
        week,
        techRows: readCsv(path.join(ROOT, 'datasets/ats/tech_weekly.csv')),
        companyRows: readCsv(path.join(ROOT, 'datasets/ats/company_weekly.csv')),
        fmcsaSummary: readCsv(path.join(ROOT, 'datasets/fmcsa/weekly_summary.csv')),
        run,
        weeks,
    });
    const json = JSON.stringify(data, null, 1) + '\n';
    writeFile('site/data/index.json', json);
    writeFile(`site/weeks/${week}.json`, json);
    const template = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
    writeFile(`site/weeks/${week}.html`, weekPage(template, data));
    log(`Site ${week}: ${data.totals.openJobs} open jobs, ${data.totals.newCarriers} new carriers, top tech ${data.tech[0]?.[0]}.`);
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}

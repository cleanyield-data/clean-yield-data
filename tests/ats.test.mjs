import test from 'node:test';
import assert from 'node:assert/strict';
import { annualUsdMid, baselineFor, companyRow, diffIds, greenhouseFacts, leverFacts, loadTechnologies, techRows } from '../jobs/ats.mjs';

const tech = loadTechnologies();

test('technologies list has the 70 patterns', () => {
    assert.equal(tech.length, 70);
    assert.ok(tech.some(([n]) => n === 'Python'));
});

test('new and closed jobs = ID difference with the previous snapshot', () => {
    assert.deepEqual(diffIds(['1', '2', '3'], ['2', '3', '4', '5']), { new_jobs: 1, closed_jobs: 2 });
    assert.deepEqual(diffIds(['1', '2'], ['1', '2']), { new_jobs: 0, closed_jobs: 0 });
    assert.deepEqual(diffIds([], ['1']), { new_jobs: 0, closed_jobs: 1 });
    assert.deepEqual(diffIds(['1'], null), { new_jobs: null, closed_jobs: null }); // first week: no baseline
});

test('re-running a week compares against the snapshot before it', () => {
    const state = { current: { week: '2026-W45', companies: {} }, previous: { week: '2026-W44', companies: {} } };
    assert.equal(baselineFor(state, '2026-W45').week, '2026-W44');
    assert.equal(baselineFor(state, '2026-W46').week, '2026-W45');
    assert.equal(baselineFor({ current: null, previous: null }, '2026-W44'), null);
});

test('posting facts keep no text, only derived values', () => {
    const gh = greenhouseFacts({
        id: 42, title: 'Senior Python Engineer', location: { name: 'Remote - Canada' },
        content: '&lt;p&gt;We use Kubernetes and PostgreSQL.&lt;/p&gt;', departments: [{ name: 'Engineering' }],
        pay_input_ranges: [{ min_cents: 15000000, max_cents: 20000000, currency_type: 'USD', title: 'Annual base' }],
    }, tech);
    assert.deepEqual(Object.keys(gh).sort(), ['country', 'department', 'id', 'remote', 'salary', 'techs']);
    assert.deepEqual(gh.techs.sort(), ['Kubernetes', 'PostgreSQL', 'Python']);
    assert.equal(gh.remote, true);
    assert.equal(gh.country, 'CA');
    assert.equal(annualUsdMid(gh.salary, null), 175000);

    const lv = leverFacts({ id: 'abc', text: 'Data Analyst', country: 'US', workplaceType: 'onsite', categories: { location: 'New York, NY', department: 'Data' },
        descriptionPlain: 'SQL and Tableau daily.', salaryRange: { min: 50, max: 60, currency: 'USD', interval: 'per-hour-wage' } }, tech);
    assert.deepEqual(lv.techs.sort(), ['SQL', 'Tableau']);
    assert.equal(lv.remote, false);
    assert.equal(lv.country, 'US');
    assert.equal(annualUsdMid(lv.salary, null), 114400);
    assert.equal(annualUsdMid({ min: 100000, max: 100000, currency: 'EUR', period: 'year' }, null), null); // no FX → no USD
    assert.equal(annualUsdMid({ min: 100000, max: 100000, currency: 'EUR', period: 'year' }, { EUR: 0.8 }), 125000);
});

test('company row and tech rows', () => {
    const facts = [
        { id: '1', techs: ['Python'], remote: true, country: 'US', department: 'Eng', salary: null },
        { id: '2', techs: ['Python', 'SQL'], remote: false, country: 'GB', department: 'Eng', salary: null },
        { id: '3', techs: [], remote: false, country: null, department: 'Sales', salary: null },
    ];
    const row = companyRow('2026-W45', { company: 'Acme', ats: 'greenhouse' }, facts, ['1', '9'], null);
    assert.equal(row.open_jobs, 3);
    assert.equal(row.new_jobs, 2);
    assert.equal(row.closed_jobs, 1);
    assert.equal(row.remote_share, 0.3333);
    assert.equal(row.top_departments, 'Eng;Sales');
    assert.equal(row.countries, 2);
    assert.equal(row.median_annual_salary_usd, null);

    const rows = techRows('2026-W45', [['Python'], ['SQL'], ['Rust']], [{ facts }, { facts: [facts[0]] }],
        [{ technology: 'Python', jobs_mentioning: '1' }]);
    const py = rows.find((r) => r.technology === 'Python');
    assert.deepEqual({ jobs: py.jobs_mentioning, cos: py.companies_mentioning, chg: py.change_vs_prev_week, open: py.panel_open_jobs }, { jobs: 3, cos: 2, chg: 2, open: 4 });
    assert.equal(rows.find((r) => r.technology === 'Rust').change_vs_prev_week, null);
});

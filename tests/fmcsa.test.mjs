import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, SELECT, buildQuery, cleanRow, fleetBucket, summarize } from '../jobs/fmcsa.mjs';

const FORBIDDEN = ['phone', 'fax', 'cell_phone', 'email_address', 'phy_street', 'phy_zip', 'carrier_mailing_street', 'carrier_mailing_zip',
    'company_officer_1', 'company_officer_2', 'dba_name', 'carrier_mailing_city', 'carrier_mailing_state'];

// A raw row as the full census returns it, including every personal field.
const RAW = {
    dot_number: '4607426', add_date: '20261026', legal_name: 'JOSUE LOPEZ MENDEZ', dba_name: 'JLM TRUCKING', business_org_desc: 'INDIVIDUAL',
    carrier_operation: 'C', classdef: 'PRIVATE PROPERTY', phy_city: 'MUNCIE', phy_state: 'in', phy_street: '123 MAIN ST', phy_zip: '47302',
    phone: '7655551234', fax: '7655551235', cell_phone: '7655551236', email_address: 'josue@example.com', company_officer_1: 'JOSUE LOPEZ',
    company_officer_2: 'ANA LOPEZ', carrier_mailing_street: 'PO BOX 1', carrier_mailing_zip: '47303', power_units: '9',
    truck_units: '2', bus_units: '1', total_drivers: '3', hm_ind: 'Y', status_code: 'a',
};

test('the API query never asks for personal fields', () => {
    for (const f of FORBIDDEN) assert.ok(!SELECT.includes(f), `${f} must not be in $select`);
    const url = decodeURIComponent(buildQuery('20261026', '20261101', 0)).replace(/\+/g, ' ');
    for (const f of FORBIDDEN) assert.ok(!new RegExp(`[=,]${f}(,|&|$)`).test(url), `${f} in URL`);
    assert.match(url, /add_date between '20261026' and '20261101'/);
});

test('cleanRow outputs only the published columns, never personal data', () => {
    const out = cleanRow(RAW, '2026-W44');
    assert.deepEqual(Object.keys(out), COLUMNS);
    for (const f of FORBIDDEN) assert.ok(!(f in out), `${f} leaked`);
    const text = JSON.stringify(out);
    for (const v of ['7655551234', 'josue@example.com', '123 MAIN ST', '47302', 'JLM TRUCKING', 'ANA LOPEZ', 'PO BOX']) {
        assert.ok(!text.includes(v), `${v} leaked`);
    }
});

test('legal_name only for corporations', () => {
    assert.equal(cleanRow(RAW, 'w').legal_name, null);
    assert.equal(cleanRow({ ...RAW, business_org_desc: 'PARTNERSHIP' }, 'w').legal_name, null);
    assert.equal(cleanRow({ ...RAW, business_org_desc: undefined }, 'w').legal_name, null);
    assert.equal(cleanRow({ ...RAW, business_org_desc: 'CORPORATION', legal_name: 'ACME FREIGHT INC' }, 'w').legal_name, 'ACME FREIGHT INC');
});

test('normalization: power units = trucks + buses, operation, flags, dates', () => {
    const out = cleanRow(RAW, '2026-W44');
    assert.equal(out.power_units, 3); // not the inflated raw power_units (9)
    assert.equal(out.carrier_operation, 'intrastate_non_hazmat');
    assert.equal(out.add_date, '2026-10-26');
    assert.equal(out.phy_state, 'IN');
    assert.equal(out.hazmat, true);
    assert.ok(!('has_mc_docket' in out));
    assert.equal(out.status, 'A');
    assert.match(out.safer_url, /query_string=4607426$/);
    assert.equal(cleanRow({ dot_number: '1', add_date: '20261027' }, 'w').power_units, null);
    assert.equal(cleanRow({ ...RAW, carrier_operation: 'A' }, 'w').carrier_operation, 'interstate');
});

test('fleet buckets and weekly summary', () => {
    assert.equal(fleetBucket(null), 'fleet_0_or_unknown');
    assert.equal(fleetBucket(0), 'fleet_0_or_unknown');
    assert.equal(fleetBucket(1), 'fleet_1');
    assert.equal(fleetBucket(5), 'fleet_2_5');
    assert.equal(fleetBucket(20), 'fleet_6_20');
    assert.equal(fleetBucket(21), 'fleet_21_plus');
    const rows = [
        { phy_state: 'TX', carrier_operation: 'interstate', power_units: 1, hazmat: true },
        { phy_state: 'TX', carrier_operation: 'interstate', power_units: 30, hazmat: false },
        { phy_state: 'CA', carrier_operation: 'interstate', power_units: 0, hazmat: false },
    ];
    const s = summarize(rows, '2026-W44');
    assert.equal(s.length, 2);
    const tx = s.find((r) => r.phy_state === 'TX');
    assert.deepEqual({ ...tx }, { week: '2026-W44', phy_state: 'TX', carrier_operation: 'interstate', total: 2, fleet_0_or_unknown: 0, fleet_1: 1, fleet_2_5: 0, fleet_6_20: 0, fleet_21_plus: 1, hazmat_share: 0.5 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekOf, parseCsv, previousIsoWeek, shiftWeek, toCsv, weekRange, ymd } from '../jobs/lib.mjs';

test('ISO weeks', () => {
    assert.equal(previousIsoWeek(new Date('2026-11-03T14:23:00Z')), '2026-W44');
    assert.deepEqual(Object.values(weekRange('2026-W44')).map(ymd), ['2026-10-26', '2026-11-01']);
    assert.equal(isoWeekOf(new Date('2027-01-01T00:00:00Z')), '2026-W53');
    assert.equal(shiftWeek('2027-W01', 1), '2026-W53');
});

test('CSV round trip', () => {
    const rows = [{ a: 'x, "y"', b: 1 }, { a: null, b: 'line\nbreak' }];
    assert.deepEqual(parseCsv(toCsv(['a', 'b'], rows)), [{ a: 'x, "y"', b: '1' }, { a: '', b: 'line\nbreak' }]);
});

// Country detection for job locations (ISO 3166-1 alpha-2). Small, deterministic dictionary; unknown → null.

const COUNTRIES = {
    'united states': 'US', 'united states of america': 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', us: 'US', america: 'US',
    canada: 'CA', mexico: 'MX', 'méxico': 'MX', brazil: 'BR', brasil: 'BR', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', 'perú': 'PE',
    uruguay: 'UY', 'costa rica': 'CR', 'puerto rico': 'PR', guatemala: 'GT', ecuador: 'EC', venezuela: 'VE', panama: 'PA', 'dominican republic': 'DO',
    'united kingdom': 'GB', uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
    ireland: 'IE', germany: 'DE', deutschland: 'DE', france: 'FR', spain: 'ES', 'españa': 'ES', portugal: 'PT', italy: 'IT', italia: 'IT',
    netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL', belgium: 'BE', luxembourg: 'LU', switzerland: 'CH', austria: 'AT',
    denmark: 'DK', sweden: 'SE', norway: 'NO', finland: 'FI', iceland: 'IS', estonia: 'EE', latvia: 'LV', lithuania: 'LT',
    poland: 'PL', czechia: 'CZ', 'czech republic': 'CZ', slovakia: 'SK', hungary: 'HU', romania: 'RO', bulgaria: 'BG', greece: 'GR',
    croatia: 'HR', serbia: 'RS', slovenia: 'SI', ukraine: 'UA', turkey: 'TR', 'türkiye': 'TR', cyprus: 'CY', malta: 'MT',
    israel: 'IL', 'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA', qatar: 'QA', egypt: 'EG', morocco: 'MA',
    nigeria: 'NG', kenya: 'KE', 'south africa': 'ZA', ghana: 'GH', rwanda: 'RW', uganda: 'UG', senegal: 'SN', 'ivory coast': 'CI',
    india: 'IN', pakistan: 'PK', bangladesh: 'BD', 'sri lanka': 'LK', nepal: 'NP', singapore: 'SG', malaysia: 'MY', indonesia: 'ID',
    philippines: 'PH', thailand: 'TH', vietnam: 'VN', 'viet nam': 'VN', japan: 'JP', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR',
    china: 'CN', taiwan: 'TW', 'hong kong': 'HK', australia: 'AU', 'new zealand': 'NZ',
};

const US_STATES = {
    al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware',
    fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky',
    la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
    mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york',
    nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island',
    sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington',
    wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
};
const US_STATE_NAMES = new Set(Object.values(US_STATES));
const CA_PROVINCES = new Set(['on', 'ontario', 'bc', 'british columbia', 'qc', 'quebec', 'québec', 'ab', 'alberta', 'mb', 'manitoba', 'ns', 'nova scotia', 'sk', 'saskatchewan', 'nb', 'new brunswick']);

const CITIES = {
    'san francisco': 'US', 'new york': 'US', nyc: 'US', seattle: 'US', austin: 'US', boston: 'US', chicago: 'US', 'los angeles': 'US', denver: 'US',
    atlanta: 'US', miami: 'US', 'washington dc': 'US', 'washington, d.c.': 'US', 'palo alto': 'US', 'mountain view': 'US', 'menlo park': 'US',
    'san jose': 'US', 'san mateo': 'US', 'san diego': 'US', 'salt lake city': 'US', 'lehi': 'US', portland: 'US', phoenix: 'US', dallas: 'US',
    houston: 'US', philadelphia: 'US', pittsburgh: 'US', detroit: 'US', minneapolis: 'US', nashville: 'US', raleigh: 'US', 'sf bay area': 'US', 'bay area': 'US',
    toronto: 'CA', vancouver: 'CA', montreal: 'CA', 'montréal': 'CA', ottawa: 'CA', calgary: 'CA', waterloo: 'CA',
    london: 'GB', manchester: 'GB', edinburgh: 'GB', cambridge: null, dublin: 'IE', berlin: 'DE', munich: 'DE', 'münchen': 'DE', hamburg: 'DE',
    frankfurt: 'DE', cologne: 'DE', paris: 'FR', lyon: 'FR', madrid: 'ES', barcelona: 'ES', lisbon: 'PT', lisboa: 'PT', porto: 'PT', milan: 'IT',
    amsterdam: 'NL', rotterdam: 'NL', brussels: 'BE', zurich: 'CH', 'zürich': 'CH', geneva: 'CH', vienna: 'AT', copenhagen: 'DK', stockholm: 'SE',
    oslo: 'NO', helsinki: 'FI', warsaw: 'PL', krakow: 'PL', 'kraków': 'PL', prague: 'CZ', budapest: 'HU', bucharest: 'RO', athens: 'GR',
    'tel aviv': 'IL', 'tel aviv-yafo': 'IL', jerusalem: 'IL', herzliya: 'IL', dubai: 'AE', 'abu dhabi': 'AE', riyadh: 'SA', cairo: 'EG', lagos: 'NG',
    nairobi: 'KE', 'cape town': 'ZA', johannesburg: 'ZA', bangalore: 'IN', bengaluru: 'IN', mumbai: 'IN', hyderabad: 'IN', pune: 'IN',
    gurgaon: 'IN', gurugram: 'IN', 'new delhi': 'IN', delhi: 'IN', chennai: 'IN', noida: 'IN', tokyo: 'JP', seoul: 'KR', beijing: 'CN',
    shanghai: 'CN', shenzhen: 'CN', taipei: 'TW', manila: 'PH', jakarta: 'ID', bangkok: 'TH', 'kuala lumpur': 'MY', 'ho chi minh city': 'VN',
    sydney: 'AU', melbourne: 'AU', brisbane: 'AU', auckland: 'NZ', 'são paulo': 'BR', 'sao paulo': 'BR', 'rio de janeiro': 'BR',
    'mexico city': 'MX', 'ciudad de méxico': 'MX', cdmx: 'MX', guadalajara: 'MX', monterrey: 'MX', 'buenos aires': 'AR', santiago: 'CL',
    'bogotá': 'CO', bogota: 'CO', medellín: 'CO', medellin: 'CO', lima: 'PE', montevideo: 'UY',
};

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N}.,'\- ]/gu, ' ').replace(/\s+/g, ' ').trim();

function fromPart(part) {
    const p = part.trim().replace(/\.$/, '');
    if (!p) return null;
    if (COUNTRIES[p]) return COUNTRIES[p];
    if (US_STATES[p] || US_STATE_NAMES.has(p)) return 'US';
    if (CA_PROVINCES.has(p)) return 'CA';
    if (p in CITIES) return CITIES[p];
    return null;
}

/** "San Francisco, CA" → US; "London, United Kingdom" → GB; "Remote - Canada" → CA; "Remote" → null. */
export function countryFromLocation(text) {
    if (!text || typeof text !== 'string') return null;
    for (const piece of text.split(/\s*(?:\||;|\/| - | – )\s*|\s+or\s+/)) {
        const n = norm(piece);
        if (!n) continue;
        const parts = n.split(',').map((s) => s.trim()).filter(Boolean);
        for (let i = parts.length - 1; i >= 0; i--) {
            const hit = fromPart(parts[i]);
            // "Munich, DE" / "Paris, FR": a 2-letter code after a known foreign city is that city's country.
            if (hit === 'US' && parts[i].length === 2 && i > 0 && CITIES[parts[i - 1]] && CITIES[parts[i - 1]] !== 'US') return CITIES[parts[i - 1]];
            if (hit) return hit;
        }
        // Words inside the piece ("Remote US", "US Remote", "Canada (Remote)")
        const words = n.replace(/,/g, ' ');
        for (const [name, iso] of Object.entries(COUNTRIES)) {
            if (name.length > 2 && new RegExp(`(^|\\s)${name.replace(/\./g, '\\.')}(\\s|$)`).test(words)) return iso;
        }
        if (/(^|\s)(us|usa)(\s|$)/.test(words)) return 'US';
        if (/(^|\s)uk(\s|$)/.test(words)) return 'GB';
        for (const [city, iso] of Object.entries(CITIES)) {
            if (iso && city.length > 3 && words.includes(city)) return iso;
        }
    }
    return null;
}

/** ISO code given directly by an ATS ("US", "gb") → upper-case code, else null. */
export function isoCode(v) {
    return typeof v === 'string' && /^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase().replace('UK', 'GB') : null;
}

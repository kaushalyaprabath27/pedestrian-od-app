/* =====================================================================
   Pedestrian Origin-Destination / Intercept Survey
   ---------------------------------------------------------------------
   One form per respondent. Location ID, location name and surveyor are set
   once at setup; date and time are recorded automatically. The route walked
   is drawn on a map. Most answers are taps; places come with type-ahead
   suggestions (the typed text is always the first suggestion).

   Offline-first, like the other survey apps: each saved respondent goes to
   localStorage first and is sent to the Apps Script backend in batches
   (every 15 s and on reconnect). The half-filled form is kept as a draft.
   ===================================================================== */

const CONFIG = Object.assign({
    appsScriptUrl: '',
    googlePlacesApiKey: '',
    placeSearchBbox: [79.4, 5.8, 82.0, 10.0],
    placeSearchCountry: 'lk',
    presetLocations: []
}, window.PEDOD_CONFIG || {});

const PLACEHOLDER_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
const SURVEY_TYPE = 'pedestrian-od';
// v3: route drawn on a map + landmarks instead of entry point; no respondent
// number. (v2: location name, egress mode, underpass questions.)
const SYNC_ACTION = 'submit_od_v3';
const BATCH_SIZE = 50;
const SYNC_INTERVAL_MS = 15000;

const QUEUE_KEY = 'pedod_queue';      // responses waiting to sync
const BACKUP_KEY = 'pedod_backup';    // every response saved on this device
const SESSION_KEY = 'pedod_session';  // surveyor / location ID / location name
const DRAFT_KEY = 'pedod_draft';      // the form currently being filled in
const HISTORY_KEY = 'pedod_history';  // undo stack (eventIds)
const RECENT_KEY = 'pedod_recent';    // entry/exit points used before, per location
const THEME_KEY = 'pedod_theme';

// ---------------------------------------------------------------------
// The questionnaire. Edit option lists here; the form is built from this.
//   place  - text with place suggestions (keeps coordinates when picked)
//            presets: true offers the study-area list from config.js first
//            multi: true collects several places (shown as removable chips)
//   route  - map: tap points, the walking route is drawn along the streets
//            nearby: true ranks places close to the site first
//            recent: true also offers values used before at this location
//   single - pick one        multi - pick any number
//   other: true adds "Other" with a text box
//   notes: 'placeholder' adds a free-text box under the options
//   exclusive: an option that clears the others when picked (e.g. 'None')
//   showIf: answers => boolean  shows the question only when true (numbered
//   as a sub-question, e.g. 6a, and not counted while hidden)
// An option can carry an icon: a Font Awesome name or inline SVG.
// ---------------------------------------------------------------------
const TUKTUK_SVG = '<svg class="svg-icon" viewBox="1.8 1.4 28.4 23" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M2.5 13V6.2Q2.5 2 7 2H24.2Q26.4 2 26.7 3.8L27.9 12.4H26.1L25.1 4.3H7.6Q5.3 4.3 5.3 6.6V13Z"/><path d="M3.5 12.6H27.4Q29.7 12.6 29.7 15Q29.7 16.4 28.6 17.6L27.8 18.6H10.77A3.6 3.6 0 0 0 5.23 18.6H4.6Q2.4 18.6 2.4 16.2V13.7Q2.4 12.6 3.5 12.6ZM27.5 14.6a0.85 0.85 0 1 0 1.7 0a0.85 0.85 0 1 0 -1.7 0Z"/><path d="M22.6 12.6L24.6 8.4L25.5 8.8L23.8 12.6Z"/><path d="M5 20.9a3 3 0 1 0 6 0a3 3 0 1 0 -6 0ZM6.9 20.9a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0ZM24 21.4a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0ZM25.6 21.4a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0Z"/><path d="M26.05 18.4H26.95V20.5H26.05Z"/></svg>';

// Travel modes, shared by the access and egress questions.
const MODES = [
    ['Walked all the way', 'fa-person-walking'],
    ['Bus', 'fa-bus'],
    ['Train', 'fa-train'],
    ['Three-wheeler', TUKTUK_SVG],
    ['Car / Jeep', 'fa-car-side'],
    ['Motorcycle', 'fa-motorcycle'],
    ['Bicycle', 'fa-bicycle'],
    ['Taxi / ride-hailing', 'fa-taxi'],
    ['School / office van', 'fa-van-shuttle']
];

const FORM = [
    { id: 'gender', label: 'Gender', type: 'single', options: ['Male', 'Female'] },
    { id: 'age', label: 'Age category', type: 'single', options: ['Under 18', '18–40', '41–60', 'Over 60'] },
    { id: 'origin', label: 'Origin', type: 'place', presets: true, hint: 'Where this trip started', placeholder: 'Start typing a location' },
    { id: 'destination', label: 'Principal destination', type: 'place', presets: true, hint: 'Main place they are going to', placeholder: 'Start typing a location' },
    {
        id: 'category', label: 'Respondent / trip category', type: 'single', other: true, grid: true,
        options: [
            ['Resident', 'fa-house'],
            ['Worker / employee', 'fa-briefcase'],
            ['School child', 'fa-child'],
            ['University student', 'fa-graduation-cap'],
            ['Other student', 'fa-book'],
            ['Patient', 'fa-hospital-user'],
            ['Shopper / customer', 'fa-bag-shopping'],
            ['Tourist / visitor', 'fa-camera'],
            ['Pilgrim', 'fa-place-of-worship'],
            ['Passing through', 'fa-person-walking-arrow-right'],
            ['Vendor / trader', 'fa-store']
        ]
    },
    { id: 'usedUnderpass', label: 'Did you use an underpass on this journey?', type: 'single', yesno: true, options: ['Yes', 'No'] },
    // Follow-up shown only when the answer above is No.
    {
        id: 'underpassReason', label: 'Why not?', type: 'multi', other: true, grid: true,
        showIf: a => a.usedUnderpass === 'No', hint: 'Tick all that apply',
        options: [
            ['Don’t know about underpasses', 'fa-circle-question'],
            ['Difficult to use', 'fa-stairs']
        ]
    },
    {
        id: 'accessMode', label: 'Access mode used to enter study area', type: 'single', other: true, grid: true,
        options: MODES
    },
    {
        id: 'egressMode', label: 'Egress mode used to leave study area', type: 'single', other: true, grid: true,
        options: MODES
    },
    {
        id: 'accessPoint', label: 'Boarding / alighting / parking / drop-off location', type: 'single', other: true, grid: true,
        notes: 'Name of the stop, stand or car park (optional)',
        options: [
            ['Bus stop / halt', 'fa-signs-post'],
            ['Bus stand / terminal', 'fa-bus-simple'],
            ['Railway station', 'fa-train-subway'],
            ['Three-wheeler stand', TUKTUK_SVG],
            ['Car park', 'fa-square-parking'],
            ['Kerbside drop-off / pick-up', 'fa-people-arrows'],
            ['Not applicable (walked)', 'fa-person-walking']
        ]
    },
    { id: 'route', label: 'Route used: draw on the map', type: 'route', hint: 'Tap the start, each turn, then the end' },
    {
        id: 'landmarks', label: 'Route used: landmarks passed', type: 'place', multi: true, presets: true, nearby: true, recent: true,
        hint: 'Add each landmark in order', placeholder: 'Type a landmark, then pick it'
    },
    { id: 'exitPoint', label: 'Route used: exit point', type: 'place', presets: true, nearby: true, recent: true, hint: 'Where they will leave it', placeholder: 'Junction, road or landmark' },
    {
        id: 'walkTime', label: 'Approximate walking time', type: 'single',
        options: ['Less than 5 min', '5–10 min', '10–15 min', 'Over 15 min']
    },
    {
        id: 'barriers', label: 'Existing barriers experienced', type: 'multi', other: true, grid: true, exclusive: 'None',
        hint: 'Select all that apply', notes: 'Details in the respondent’s words (optional)',
        options: [
            ['Narrow or no footpath', 'fa-arrows-left-right-to-line'],
            ['Broken / uneven surface', 'fa-road-barrier'],
            ['Footpath blocked by parked vehicles', 'fa-car-side'],
            ['Footpath blocked by vendors / goods', 'fa-store'],
            ['Heavy traffic / unsafe to cross', 'fa-car-burst'],
            ['No pedestrian crossing nearby', 'fa-person-walking-arrow-loop-left'],
            ['Long wait to cross', 'fa-hourglass-half'],
            ['Poor lighting at night', 'fa-lightbulb'],
            ['Steps, no ramps (accessibility)', 'fa-wheelchair'],
            ['No shade / shelter', 'fa-sun'],
            ['Crowding', 'fa-people-group'],
            ['Safety / security concerns', 'fa-shield-halved'],
            ['None', 'fa-circle-check']
        ]
    },
    {
        id: 'improvements', label: 'Priority improvements requested', type: 'multi', other: true, grid: true, exclusive: 'None',
        hint: 'Select all that apply', notes: 'Details in the respondent’s words (optional)',
        options: [
            ['Wider footpaths', 'fa-arrows-left-right'],
            ['Repair footpath surface', 'fa-trowel-bricks'],
            ['Remove obstructions (parking, vendors)', 'fa-ban'],
            ['More pedestrian crossings', 'fa-person-walking'],
            ['Signalized crossing', 'fa-traffic-light'],
            ['Elevated crossing', 'fa-bridge'],
            ['Better street lighting', 'fa-lightbulb'],
            ['Shade / covered walkways', 'fa-umbrella'],
            ['Ramps / accessible design', 'fa-wheelchair'],
            ['Slower traffic / traffic calming', 'fa-gauge-simple'],
            ['Seating / rest areas', 'fa-chair'],
            ['Signs / wayfinding', 'fa-signs-post'],
            ['Make the street pedestrian-only', 'fa-person-walking-arrow-right'],
            ['None', 'fa-circle-check']
        ]
    }
];

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('localStorage write failed for', key, e);
        showStorageWarning();
        return false;
    }
}

function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

const pad2 = n => String(n).padStart(2, '0');
function formatDate(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function formatTime(ts) { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
}
function optionLabel(o) { return Array.isArray(o) ? o[0] : o; }
function optionIcon(o) { return Array.isArray(o) ? o[1] : null; }

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let session = readJSON(SESSION_KEY, null);
let answers = readJSON(DRAFT_KEY, {});
let isSyncing = false;
let inFlightIds = new Set();
let lastSyncError = null;

const screens = { welcome: $('screen-welcome'), setup: $('screen-setup'), survey: $('screen-survey') };
function showScreen(name) {
    Object.keys(screens).forEach(k => screens[k].classList.toggle('active', k === name));
    document.body.classList.toggle('on-survey', name === 'survey');
}
function saveSession() { writeJSON(SESSION_KEY, session); }
function saveDraft() { writeJSON(DRAFT_KEY, answers); }

// Where to rank places from: the setup GPS, else the survey area centre.
function sessionLatLon() {
    const g = session && session.gps;
    if (g && isFinite(g.lat) && isFinite(g.lon)) return { lat: g.lat, lon: g.lon };
    const c = CONFIG.surveyAreaCenter;
    return (c && isFinite(c.lat) && isFinite(c.lon)) ? { lat: c.lat, lon: c.lon } : null;
}

// ---------------------------------------------------------------------
// Toasts, modal, storage warning
// ---------------------------------------------------------------------
let toastTimer = null;
function showToast(message, type = 'success') {
    const c = $('toast-container');
    c.innerHTML = '';
    const t = el('div', `toast ${type}`);
    t.textContent = message;
    c.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2200);
}

function openModal({ title, html, okLabel = 'OK', cancelLabel = 'Cancel', danger = false, showCancel = true }) {
    return new Promise(resolve => {
        const modal = $('modal'), ok = $('modal-ok'), cancel = $('modal-cancel');
        $('modal-title').textContent = title;
        $('modal-body').innerHTML = html;
        ok.textContent = okLabel;
        ok.classList.toggle('danger', danger);
        cancel.textContent = cancelLabel;
        cancel.classList.toggle('hidden', !showCancel);
        modal.classList.remove('hidden');
        const close = r => {
            modal.classList.add('hidden');
            ok.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
            resolve(r);
        };
        const onOk = () => close(true);
        const onCancel = () => close(false);
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
    });
}

let storageWarningEl = null;
function showStorageWarning() {
    if (storageWarningEl && document.body.contains(storageWarningEl)) return;
    storageWarningEl = el('div', 'storage-warning', 'DEVICE STORAGE FULL: new responses may NOT be saved. Sync or export a backup now. <button type="button">Dismiss</button>');
    storageWarningEl.setAttribute('role', 'alert');
    storageWarningEl.querySelector('button').addEventListener('click', () => { storageWarningEl.remove(); storageWarningEl = null; });
    document.body.prepend(storageWarningEl);
    if (navigator.onLine) syncQueue();
}

// ---------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------
function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    $('theme-toggle').querySelector('i').className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', isLight ? '#f1f5f9' : '#0f172a');
}
$('theme-toggle').addEventListener('click', () => {
    const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
});

// ---------------------------------------------------------------------
// Welcome + setup
// ---------------------------------------------------------------------
const inputName = $('surveyor-name');
const inputLocId = $('location-id');
const inputLocName = $('location-name');
const btnStart = $('btn-start');
let setupGps = null;

$('btn-next').addEventListener('click', () => showScreen('setup'));

function checkSetupForm() {
    const ok = inputName.value.trim() && inputLocId.value.trim() && inputLocName.value.trim();
    btnStart.disabled = !ok;
    btnStart.classList.toggle('btn-disabled', !ok);
}
[inputName, inputLocId, inputLocName].forEach(i => i.addEventListener('input', checkSetupForm));

function showGpsStatus(text, cls) {
    const s = $('gps-status');
    s.className = 'status-text' + (cls ? ' ' + cls : '');
    s.textContent = text;
}

$('btn-gps').addEventListener('click', () => {
    showGpsStatus('Getting coordinates...');
    if (!('geolocation' in navigator)) { showGpsStatus('GPS is not supported on this device. You can continue without it.', 'err'); return; }
    navigator.geolocation.getCurrentPosition(
        pos => {
            setupGps = { lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6) };
            showGpsStatus(`GPS saved: ${setupGps.lat}, ${setupGps.lon} (accuracy ~${Math.round(pos.coords.accuracy)} m)`, 'ok');
        },
        () => showGpsStatus('GPS failed. Turn on location, or continue without it.', 'err'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
});

btnStart.addEventListener('click', () => {
    if (btnStart.disabled) return;
    session = {
        id: generateId(),
        active: true,
        name: inputName.value.trim(),
        locationId: inputLocId.value.trim(),
        locationName: inputLocName.value.trim(),
        gps: setupGps,
        startedAt: Date.now()
    };
    saveSession();
    writeJSON(HISTORY_KEY, []);
    startSurveyScreen();
});

function startSurveyScreen() {
    $('info-location').textContent = session.locationId;
    $('info-location-name').textContent = session.locationName || '-';
    $('info-name').textContent = session.name;
    renderAllFromAnswers();
    updateCount();
    updateAutoInfo();
    updateSyncStatus();
    showScreen('survey');
    setTimeout(() => mapRefreshers.forEach(fn => fn()), 450);
}

// ---------------------------------------------------------------------
// Automatic fields: date, time
// ---------------------------------------------------------------------
function updateAutoInfo() {
    const now = Date.now();
    $('auto-date').textContent = formatDate(now);
    $('auto-time').textContent = formatTime(now).slice(0, 5);
}

// ---------------------------------------------------------------------
// Build the form from FORM
// ---------------------------------------------------------------------
const formEl = $('interview-form');
const renderers = {}; // id -> function that refreshes that question from `answers`

function buildForm() {
    formEl.innerHTML = '';
    let num = 0;
    FORM.forEach(f => {
        const q = el('section', 'q');
        q.dataset.q = f.id;
        const qNum = f.showIf ? `${num}a` : String(++num);
        const label = el('div', 'q-label',
            `<span class="q-num">${qNum}</span><span>${escapeHtml(f.label)}</span>` +
            (f.hint ? `<span class="q-hint">${escapeHtml(f.hint)}</span>` : ''));
        label.id = `lbl-${f.id}`;
        q.appendChild(label);
        if (f.type === 'place') buildPlaceField(q, f);
        else if (f.type === 'route') buildRouteField(q, f);
        else buildChoiceField(q, f);
        formEl.appendChild(q);
    });
}

function isAnswered(f) {
    const v = answers[f.id];
    if (f.type === 'place' && f.multi) return Array.isArray(v) && v.length > 0;
    if (f.type === 'place') return !!(v && v.text && v.text.trim());
    if (f.type === 'route') return !!(v && Array.isArray(v.points) && v.points.length >= 2);
    if (f.type === 'multi') return Array.isArray(v) && v.length > 0;
    return !!(v && String(v).trim());
}

function isVisible(f) { return !f.showIf || !!f.showIf(answers); }
function visibleQuestions() { return FORM.filter(isVisible); }

function refreshProgress() {
    let n = 0;
    FORM.forEach(f => {
        const shown = isVisible(f);
        const ok = shown && isAnswered(f);
        if (ok) n++;
        const q = formEl.querySelector(`[data-q="${f.id}"]`);
        if (q) { q.classList.toggle('answered', ok); q.classList.toggle('hidden', !shown); }
    });
    $('progress').textContent = `${n} of ${visibleQuestions().length} answered`;
    return n;
}

function renderAllFromAnswers() {
    Object.values(renderers).forEach(r => r());
    refreshProgress();
}

function changed() {
    saveDraft();
    refreshProgress();
}

// ----- Choice fields -----
function buildChoiceField(q, f) {
    const box = el('div', 'chips' + (f.type === 'multi' ? ' multi' : '') + (f.grid ? ' grid' : '') + (f.yesno ? ' yesno' : ''));
    box.setAttribute('role', f.type === 'multi' ? 'group' : 'radiogroup');
    box.setAttribute('aria-labelledby', `lbl-${f.id}`);
    const opts = f.options.slice();
    if (f.other) opts.push(['Other', 'fa-ellipsis']);

    let otherInput = null;
    opts.forEach(o => {
        const value = optionLabel(o), icon = optionIcon(o);
        const iconHtml = !icon ? '' : icon.startsWith('<') ? icon : `<i class="fa-solid ${icon}"></i>`;
        const b = el('button', 'chip-opt', iconHtml + `<span>${escapeHtml(value)}</span>`);
        b.type = 'button';
        b.dataset.value = value;
        b.setAttribute('role', f.type === 'multi' ? 'checkbox' : 'radio');
        b.addEventListener('click', () => {
            if (f.type === 'multi') {
                let arr = Array.isArray(answers[f.id]) ? answers[f.id].slice() : [];
                if (arr.includes(value)) arr = arr.filter(x => x !== value);
                else if (f.exclusive && value === f.exclusive) arr = [value];
                else arr = arr.filter(x => x !== f.exclusive).concat(value);
                answers[f.id] = arr;
            } else {
                answers[f.id] = answers[f.id] === value ? '' : value; // tap again to clear
            }
            renderers[f.id]();
            changed();
            if (value === 'Other' && isSelected(f, 'Other')) setTimeout(() => otherInput.focus(), 50);
        });
        box.appendChild(b);
    });
    q.appendChild(box);

    if (f.other) {
        otherInput = el('input', 'other-input hidden');
        otherInput.type = 'text';
        otherInput.placeholder = 'Please specify';
        otherInput.setAttribute('aria-label', `${f.label}: other, please specify`);
        otherInput.addEventListener('input', () => { answers[f.id + 'Other'] = otherInput.value; saveDraft(); });
        q.appendChild(otherInput);
    }
    let notes = null;
    if (f.notes) {
        notes = el('textarea', 'notes-input');
        notes.rows = 2;
        notes.placeholder = f.notes;
        notes.setAttribute('aria-label', `${f.label}: ${f.notes}`);
        notes.addEventListener('input', () => { answers[f.id + 'Notes'] = notes.value; saveDraft(); });
        q.appendChild(notes);
    }

    renderers[f.id] = () => {
        box.querySelectorAll('.chip-opt').forEach(b => {
            const on = isSelected(f, b.dataset.value);
            b.classList.toggle('selected', on);
            b.setAttribute('aria-checked', String(on));
        });
        if (otherInput) {
            otherInput.classList.toggle('hidden', !isSelected(f, 'Other'));
            otherInput.value = answers[f.id + 'Other'] || '';
        }
        if (notes) notes.value = answers[f.id + 'Notes'] || '';
    };
}

function isSelected(f, value) {
    const v = answers[f.id];
    return f.type === 'multi' ? (Array.isArray(v) && v.includes(value)) : v === value;
}

// ----- Place fields (type-ahead suggestions) -----
function recentKey(f) { return `${f.id}|${session ? session.locationId : ''}`; }
function recentFor(f, text) {
    if (!f.recent) return [];
    const t = text.toLowerCase();
    return (readJSON(RECENT_KEY, {})[recentKey(f)] || [])
        .filter(r => !t || r.label.toLowerCase().includes(t))
        .slice(0, 4)
        .map(r => Object.assign({}, r, { main: r.label, sub: 'Used before at this location', recent: true }));
}
function rememberRecent(f, v) {
    if (!f.recent || !v || !v.text || !v.text.trim()) return;
    const all = readJSON(RECENT_KEY, {});
    const key = recentKey(f);
    const label = v.text.trim();
    all[key] = [{ label, lat: v.lat ?? null, lon: v.lon ?? null, source: v.source || 'typed' }]
        .concat((all[key] || []).filter(r => r.label.toLowerCase() !== label.toLowerCase()))
        .slice(0, 15);
    writeJSON(RECENT_KEY, all);
}

// Study-area locations from config.js: all of them for an empty box, else the
// ones containing every typed word.
function presetFor(f, text) {
    if (!f.presets) return [];
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return (CONFIG.presetLocations || [])
        .filter(name => words.every(w => name.toLowerCase().includes(w)))
        .map(name => ({ main: name, sub: 'Study-area location', label: name, lat: null, lon: null, source: 'list', preset: true }));
}

function buildPlaceField(q, f) {
    const wrap = el('div', 'place');
    wrap.innerHTML = `<i class="fa-solid ${f.recent ? 'fa-route' : 'fa-location-dot'} place-icon"></i>`;
    const input = el('input');
    input.type = 'text';
    input.placeholder = f.placeholder || '';
    input.setAttribute('aria-labelledby', `lbl-${f.id}`);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    const clear = el('button', 'place-clear hidden', '<i class="fa-solid fa-xmark"></i>');
    clear.type = 'button';
    clear.setAttribute('aria-label', `Clear ${f.label}`);
    const list = el('ul', 'suggest hidden');
    list.id = `suggest-${f.id}`;
    list.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', list.id);
    wrap.append(input, clear, list);
    const status = el('div', 'place-status');
    q.append(wrap, status);
    // multi: chosen places become removable chips; the box is for adding the next one.
    const chipsBox = f.multi ? el('div', 'place-chips') : null;
    if (chipsBox) q.appendChild(chipsBox);

    let timer = null, controller = null, items = [], active = -1;

    const renderChips = () => {
        if (!chipsBox) return;
        const arr = Array.isArray(answers[f.id]) ? answers[f.id] : [];
        chipsBox.innerHTML = '';
        arr.forEach((x, k) => {
            const chip = el('span', 'place-chip', `<span>${k + 1}. ${escapeHtml(x.text)}</span>`);
            const rm = el('button', '', '<i class="fa-solid fa-xmark"></i>');
            rm.type = 'button';
            rm.setAttribute('aria-label', `Remove ${x.text}`);
            rm.addEventListener('click', () => {
                answers[f.id] = arr.filter((_, n) => n !== k);
                renderChips();
                changed();
                setStatus();
            });
            chip.appendChild(rm);
            chipsBox.appendChild(chip);
        });
    };

    const hide = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
    const setStatus = () => {
        const v = answers[f.id];
        if (f.multi) {
            const n = Array.isArray(v) ? v.length : 0;
            status.textContent = n ? `✓ ${n} added · type to add another` : '';
            status.className = 'place-status' + (n ? ' ok' : '');
            return;
        }
        if (v && v.source === 'list' && v.confirmed) { status.textContent = '✓ Study-area location'; status.className = 'place-status ok'; }
        else if (v && v.lat != null) { status.textContent = '✓ Place selected from map suggestions'; status.className = 'place-status ok'; }
        else if (v && v.text && v.confirmed) { status.textContent = '✓ Saved as typed'; status.className = 'place-status ok'; }
        else if (v && v.text) { status.textContent = 'Typed text will be saved as written'; status.className = 'place-status'; }
        else { status.textContent = ''; status.className = 'place-status'; }
    };

    // The surveyor's own text is always the first choice.
    const typedItem = () => {
        const t = input.value.trim();
        return t ? [{ main: t, sub: 'Use as typed', label: t, lat: null, lon: null, source: 'typed', typed: true }] : [];
    };

    const showItems = (rows, info) => {
        const typed = typedItem();
        const seen = new Set(typed.map(r => r.label.toLowerCase()));
        const rest = rows.filter(r => { const k = r.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        items = typed.concat(rest);
        active = -1;
        list.innerHTML = '';
        items.forEach((r, i) => {
            const li = el('li', r.typed ? 's-typed' : '',
                `<div class="s-main">${r.typed ? '<i class="fa-solid fa-keyboard"></i> ' : r.preset ? '<i class="fa-solid fa-map-pin"></i> ' : ''}${escapeHtml(r.main)}${r.recent ? '<span class="s-tag">recent</span>' : ''}</div>` +
                (r.sub ? `<div class="s-sub">${escapeHtml(r.sub)}</div>` : ''));
            li.setAttribute('role', 'option');
            li.id = `${list.id}-${i}`;
            // Keep focus in the input and choose on a completed tap/click.
            li.addEventListener('mousedown', e => e.preventDefault());
            li.addEventListener('click', () => choose(i));
            list.appendChild(li);
        });
        if (info) list.appendChild(el('li', 's-info', escapeHtml(info)));
        if (rest.some(r => !r.recent && !r.preset) && !info) {
            list.appendChild(el('li', 's-attrib', CONFIG.googlePlacesApiKey ? 'Powered by Google' : 'Suggestions © OpenStreetMap contributors'));
        }
        const open = items.length > 0 || !!info;
        list.classList.toggle('hidden', !open);
        input.setAttribute('aria-expanded', String(open));
    };

    const choose = async i => {
        const r = items[i];
        if (!r) return;
        // Cancel any search still pending from typing, so the list can't reopen.
        clearTimeout(timer);
        if (controller) controller.abort();
        if (f.multi) {
            const arr = Array.isArray(answers[f.id]) ? answers[f.id].slice() : [];
            if (!arr.some(x => x.text.toLowerCase() === r.label.toLowerCase())) {
                arr.push({ text: r.label, lat: r.lat ?? null, lon: r.lon ?? null, source: r.source });
            }
            answers[f.id] = arr;
            input.value = '';
            hide();
            clear.classList.add('hidden');
            renderChips();
            changed();
            setStatus();
            return;
        }
        input.value = r.label;
        answers[f.id] = { text: r.label, lat: r.lat ?? null, lon: r.lon ?? null, source: r.source, placeId: r.placeId || '', confirmed: true };
        hide();
        clear.classList.remove('hidden');
        changed();
        setStatus();
        if (r.source === 'google' && r.placeId && r.lat == null) {
            const loc = await googlePlaceLocation(r.placeId).catch(() => null);
            if (loc && answers[f.id] && answers[f.id].placeId === r.placeId) {
                answers[f.id].lat = loc.lat;
                answers[f.id].lon = loc.lon;
                saveDraft();
                setStatus();
            }
        }
    };

    const highlight = i => {
        const lis = list.querySelectorAll('li[role="option"]');
        lis.forEach((li, k) => li.classList.toggle('active', k === i));
        active = i;
        if (lis[i]) { input.setAttribute('aria-activedescendant', lis[i].id); lis[i].scrollIntoView({ block: 'nearest' }); }
    };

    const search = async text => {
        const qText = text.trim();
        const recent = recentFor(f, qText).concat(presetFor(f, qText));
        if (!qText) { recent.length ? showItems(recent) : hide(); return; }
        if (qText.length < 2) { showItems(recent); return; }
        if (!navigator.onLine) { showItems(recent, 'Offline: no map suggestions.'); return; }
        if (controller) controller.abort();
        controller = new AbortController();
        showItems(recent, 'Searching…');
        try {
            const found = await placeSuggestions(qText, !!f.nearby, controller.signal);
            showItems(recent.concat(found), found.length || recent.length ? null : 'No map matches.');
        } catch (e) {
            if (e.name === 'AbortError') return;
            showItems(recent, 'Map suggestions unavailable right now.');
        }
    };

    input.addEventListener('input', () => {
        if (!f.multi) {
            answers[f.id] = { text: input.value, lat: null, lon: null, source: 'typed', placeId: '' };
            changed();
            setStatus();
        }
        clear.classList.toggle('hidden', !input.value);
        clearTimeout(timer);
        // Refresh straight away so no stale suggestion from the previous text can be picked.
        const t = input.value.trim();
        if (t) showItems(recentFor(f, t).concat(presetFor(f, t)), t.length >= 2 ? 'Searching…' : null); else search('');
        timer = setTimeout(() => search(input.value), 350);
    });
    input.addEventListener('focus', () => {
        // Bring the question to the top so the list has room above the keyboard.
        setTimeout(() => q.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
        const v = answers[f.id];
        if (f.multi || !(v && (v.lat != null || v.confirmed))) search(input.value);
    });
    input.addEventListener('blur', () => setTimeout(hide, 120));
    input.addEventListener('keydown', e => {
        const n = list.querySelectorAll('li[role="option"]').length;
        if (e.key === 'ArrowDown' && n) { e.preventDefault(); highlight((active + 1) % n); }
        else if (e.key === 'ArrowUp' && n) { e.preventDefault(); highlight((active - 1 + n) % n); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0 && items[active]) choose(active);
            else if (input.value.trim()) { items = typedItem(); choose(0); } // always the text in the box now
            else hide();
        }
        else if (e.key === 'Escape') hide();
    });
    clear.addEventListener('click', () => {
        input.value = '';
        if (!f.multi) answers[f.id] = null;
        clear.classList.add('hidden');
        hide();
        changed();
        setStatus();
        input.focus();
    });

    renderers[f.id] = () => {
        const v = answers[f.id];
        input.value = f.multi ? '' : ((v && v.text) || '');
        clear.classList.toggle('hidden', !input.value);
        renderChips();
        setStatus();
    };
}

// ----- Route drawn on a map (Leaflet + OpenStreetMap) -----
// The surveyor taps the start, each turn and the end. Each pair of taps is
// joined by the walking route along the streets (OSM foot routing); if that
// service can't be reached the pair is joined by a straight line instead.
const ROUTE_SERVICE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const mapRefreshers = [];

function samePoint(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }

function haversineM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function routePath(r) {
    const out = [];
    (r && r.segments || []).forEach(seg => seg.forEach(p => { if (!samePoint(out[out.length - 1], p)) out.push(p); }));
    return out;
}

function routeLength(r) {
    const path = routePath(r);
    let m = 0;
    for (let i = 1; i < path.length; i++) m += haversineM(path[i - 1], path[i]);
    return m;
}

// Google's encoded-polyline format (precision 5): compact, and readable by
// most GIS tools and online decoders.
function encodePolyline(points) {
    let out = '', pLat = 0, pLon = 0;
    const enc = v => {
        v = v < 0 ? ~(v << 1) : (v << 1);
        let s = '';
        while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        return s + String.fromCharCode(v + 63);
    };
    points.forEach(([lat, lon]) => {
        const iLat = Math.round(lat * 1e5), iLon = Math.round(lon * 1e5);
        out += enc(iLat - pLat) + enc(iLon - pLon);
        pLat = iLat; pLon = iLon;
    });
    return out;
}

// A Google Maps walking-directions link through the tapped points (it allows
// at most 8 stops between start and end, so longer routes are thinned evenly).
function routeMapLink(points) {
    const fmt = p => `${p[0]},${p[1]}`;
    let mid = points.slice(1, -1);
    if (mid.length > 8) mid = Array.from({ length: 8 }, (_, k) => mid[Math.round(k * (mid.length - 1) / 7)]);
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${fmt(points[0])}&destination=${fmt(points[points.length - 1])}`;
    if (mid.length) url += `&waypoints=${encodeURIComponent(mid.map(fmt).join('|'))}`;
    return url;
}

function routeRecord(r) {
    if (!r || !Array.isArray(r.points) || r.points.length < 2) return { routeLengthM: '', routeMapLink: '', routePoints: '', routePath: '' };
    return {
        routeLengthM: Math.round(routeLength(r)),
        routeMapLink: routeMapLink(r.points),
        routePoints: r.points.map(p => p.join(',')).join('; '),
        routePath: encodePolyline(routePath(r))
    };
}

function buildRouteField(q, f) {
    const box = el('div', 'route-box');
    const mapEl = el('div', 'route-map');
    const tools = el('div', 'route-tools');
    const mkBtn = (icon, text) => {
        const b = el('button', 'mini-btn', `<i class="fa-solid ${icon}"></i> <span>${text}</span>`);
        b.type = 'button';
        return b;
    };
    const btnUndo = mkBtn('fa-rotate-left', 'Undo point');
    const btnClear = mkBtn('fa-trash-can', 'Clear');
    const btnFull = mkBtn('fa-expand', 'Full screen');
    tools.append(btnUndo, btnClear, btnFull);
    const info = el('div', 'route-info');
    box.append(mapEl, tools, info);
    q.appendChild(box);

    let map = null, layer = null, pending = 0;

    const current = () => {
        const r = answers[f.id];
        return (r && Array.isArray(r.points)) ? r : { points: [], segments: [], routed: [] };
    };

    const updateInfo = () => {
        const r = current();
        const n = r.points.length;
        btnUndo.disabled = n === 0;
        btnClear.disabled = n === 0;
        if (!map && typeof L === 'undefined') {
            info.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> The map needs internet. Add the landmarks below instead.';
            info.className = 'route-info warn';
            return;
        }
        if (n === 0) { info.textContent = 'Tap the map where the walk started.'; info.className = 'route-info'; return; }
        if (n === 1) { info.textContent = 'Now tap each turn, then where the walk ends.'; info.className = 'route-info'; return; }
        const m = routeLength(r);
        const straight = r.routed.some(x => !x);
        info.innerHTML = `\u2713 ${n} points \u00b7 ${m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'}` +
            (pending ? ' \u00b7 following streets\u2026' : straight && !pending ? ' \u00b7 some parts drawn as straight lines' : '');
        info.className = 'route-info ok';
    };

    const draw = () => {
        if (map) {
            layer.clearLayers();
            const r = current();
            const path = routePath(r);
            if (path.length > 1) L.polyline(path, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(layer);
            r.points.forEach((p, k) => {
                const cls = k === 0 ? 'start' : (k === r.points.length - 1 && k > 0 ? 'end' : '');
                L.marker(p, {
                    icon: L.divIcon({ className: 'route-pt ' + cls, html: `<span>${k + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
                    keyboard: false
                }).addTo(layer);
            });
        }
        updateInfo();
    };

    const fetchSegment = (i, a, b) => {
        if (!navigator.onLine) return;
        pending++;
        fetch(`${ROUTE_SERVICE}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`)
            .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then(d => {
                const r = answers[f.id];
                // Ignore the answer if the route changed meanwhile (undo, clear, saved).
                if (!r || !samePoint(r.points[i], a) || !samePoint(r.points[i + 1], b)) return;
                const coords = d && d.routes && d.routes[0] && d.routes[0].geometry && d.routes[0].geometry.coordinates;
                if (!coords || coords.length < 2) return;
                r.segments[i] = [a].concat(coords.map(c => [+c[1].toFixed(6), +c[0].toFixed(6)])).concat([b]);
                r.routed[i] = true;
                saveDraft();
            })
            .catch(() => {})
            .finally(() => { pending--; draw(); });
    };

    const addPoint = latlng => {
        const r = current();
        const p = [+latlng.lat.toFixed(6), +latlng.lng.toFixed(6)];
        r.points.push(p);
        if (r.points.length >= 2) {
            const a = r.points[r.points.length - 2];
            r.segments.push([a, p]);     // straight until the street route arrives
            r.routed.push(false);
            fetchSegment(r.points.length - 2, a, p);
        }
        answers[f.id] = r;
        changed();
        draw();
    };

    const ensureMap = () => {
        if (map) return true;
        if (typeof L === 'undefined') { updateInfo(); return false; }
        const c = sessionLatLon() || { lat: 7.2906, lon: 80.6337 };
        map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lon], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        layer = L.layerGroup().addTo(map);
        map.on('click', e => addPoint(e.latlng));
        draw();
        fitToRoute();
        return true;
    };

    const fitToRoute = () => {
        const r = current();
        if (map && r.points.length >= 2) map.fitBounds(L.latLngBounds(routePath(r)), { padding: [30, 30], maxZoom: 17 });
    };

    // Create the map when the question first comes into view (it needs a real size).
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && ensureMap()) { map.invalidateSize(); }
        });
        io.observe(mapEl);
    } else {
        setTimeout(ensureMap, 600);
    }
    mapRefreshers.push(() => { if (map) map.invalidateSize(); });

    btnUndo.addEventListener('click', () => {
        const r = current();
        if (!r.points.length) return;
        r.points.pop();
        if (r.segments.length >= r.points.length && r.segments.length) { r.segments.pop(); r.routed.pop(); }
        answers[f.id] = r.points.length ? r : null;
        changed();
        draw();
    });
    btnClear.addEventListener('click', async () => {
        if (!current().points.length) return;
        const ok = await openModal({ title: 'Clear the route?', html: 'All points on the map will be removed.', okLabel: 'Clear', danger: true });
        if (!ok) return;
        answers[f.id] = null;
        changed();
        draw();
    });
    btnFull.addEventListener('click', () => {
        const on = !q.classList.contains('route-full');
        q.classList.toggle('route-full', on);
        document.body.classList.toggle('route-full-open', on);
        btnFull.innerHTML = on ? '<i class="fa-solid fa-compress"></i> <span>Done</span>' : '<i class="fa-solid fa-expand"></i> <span>Full screen</span>';
        setTimeout(() => { if (map) { map.invalidateSize(); fitToRoute(); } }, 150);
    });

    renderers[f.id] = () => { draw(); fitToRoute(); };
}

// ---------------------------------------------------------------------
// Place suggestion providers
// ---------------------------------------------------------------------
function placeSuggestions(text, nearby, signal) {
    return CONFIG.googlePlacesApiKey ? googleSuggestions(text, nearby, signal) : photonSuggestions(text, nearby, signal);
}

// Free: Photon (komoot) over OpenStreetMap data. No key needed.
async function photonSuggestions(text, nearby, signal) {
    const p = new URLSearchParams({ q: text, limit: '6', lang: 'en' });
    if (Array.isArray(CONFIG.placeSearchBbox) && CONFIG.placeSearchBbox.length === 4) p.set('bbox', CONFIG.placeSearchBbox.join(','));
    const here = sessionLatLon();
    if (here) {
        p.set('lat', here.lat);
        p.set('lon', here.lon);
        // Entry/exit points: strongly prefer the immediate area; trips: gentle bias.
        p.set('zoom', nearby ? '16' : '10');
        p.set('location_bias_scale', nearby ? '0' : '0.2');
    }
    const res = await fetch('https://photon.komoot.io/api/?' + p.toString(), { signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.features || []).map(ft => {
        const pr = ft.properties || {};
        const main = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ') || pr.city || pr.county || '';
        const parts = [];
        [pr.name ? pr.street : null, pr.district, pr.city, pr.county, pr.state].forEach(x => {
            if (x && x !== main && !parts.includes(x)) parts.push(x);
        });
        const sub = parts.join(', ');
        const [lon, lat] = (ft.geometry && ft.geometry.coordinates) || [null, null];
        return { main, sub, label: sub ? `${main}, ${sub}` : main, lat, lon, source: 'osm' };
    }).filter(r => r.main);
}

// Optional: Google Places API (New). Used only when a key is set in config.js.
let googleSessionToken = null;
async function googleSuggestions(text, nearby, signal) {
    if (!googleSessionToken) googleSessionToken = generateId();
    const body = { input: text, sessionToken: googleSessionToken, includedRegionCodes: [CONFIG.placeSearchCountry || 'lk'] };
    const here = sessionLatLon();
    if (here) body.locationBias = { circle: { center: { latitude: here.lat, longitude: here.lon }, radius: nearby ? 2000 : 30000 } };
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': CONFIG.googlePlacesApiKey },
        body: JSON.stringify(body),
        signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.suggestions || []).filter(s => s.placePrediction).map(s => {
        const pp = s.placePrediction;
        const main = (pp.structuredFormat && pp.structuredFormat.mainText && pp.structuredFormat.mainText.text) || (pp.text && pp.text.text) || '';
        const sub = (pp.structuredFormat && pp.structuredFormat.secondaryText && pp.structuredFormat.secondaryText.text) || '';
        return { main, sub, label: (pp.text && pp.text.text) || main, lat: null, lon: null, source: 'google', placeId: pp.placeId };
    });
}

async function googlePlaceLocation(placeId) {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(googleSessionToken || '')}`;
    googleSessionToken = null; // a session ends with the details call
    const res = await fetch(url, { headers: { 'X-Goog-Api-Key': CONFIG.googlePlacesApiKey, 'X-Goog-FieldMask': 'location' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    return d.location ? { lat: d.location.latitude, lon: d.location.longitude } : null;
}

// ---------------------------------------------------------------------
// Save / clear / undo
// ---------------------------------------------------------------------
function singleValue(id) {
    const v = answers[id] || '';
    if (v === 'Other') {
        const o = (answers[id + 'Other'] || '').trim();
        return o ? `Other: ${o}` : 'Other';
    }
    return v;
}
function multiValue(id) {
    const arr = Array.isArray(answers[id]) ? answers[id] : [];
    return arr.map(v => {
        if (v !== 'Other') return v;
        const o = (answers[id + 'Other'] || '').trim();
        return o ? `Other: ${o}` : 'Other';
    }).join('; ');
}
function placeParts(id) {
    const v = answers[id] || {};
    return { text: (v.text || '').trim(), lat: v.lat ?? '', lon: v.lon ?? '' };
}
function notesValue(id) { return (answers[id + 'Notes'] || '').trim(); }

function buildRecord() {
    const now = Date.now();
    const origin = placeParts('origin'), dest = placeParts('destination');
    const exit = placeParts('exitPoint');
    const gps = session.gps || {};
    return {
        action: 'submit',
        surveyType: SURVEY_TYPE,
        eventId: generateId(),
        sessionId: session.id,
        name: session.name,
        locationId: session.locationId,
        locationName: session.locationName || '',
        gpsLat: gps.lat ?? '', gpsLon: gps.lon ?? '',
        date: formatDate(now),
        time: formatTime(now),
        category: singleValue('category'),
        age: singleValue('age'),
        gender: singleValue('gender'),
        origin: origin.text, originLat: origin.lat, originLon: origin.lon,
        destination: dest.text, destinationLat: dest.lat, destinationLon: dest.lon,
        accessMode: singleValue('accessMode'),
        egressMode: singleValue('egressMode'),
        accessPoint: singleValue('accessPoint'),
        accessPointName: notesValue('accessPoint'),
        ...routeRecord(answers.route),
        landmarks: (Array.isArray(answers.landmarks) ? answers.landmarks : []).map(x => x.text).join('; '),
        exitPoint: exit.text,
        usedUnderpass: singleValue('usedUnderpass'),
        underpassReason: answers.usedUnderpass === 'No' ? multiValue('underpassReason') : '',
        walkTime: singleValue('walkTime'),
        barriers: multiValue('barriers'),
        barriersNotes: notesValue('barriers'),
        improvements: multiValue('improvements'),
        improvementsNotes: notesValue('improvements')
    };
}

function resetForm() {
    answers = {};
    saveDraft();
    renderAllFromAnswers();
    updateAutoInfo();
    $('form-scroll').scrollTo({ top: 0, behavior: 'smooth' });
}

$('btn-save').addEventListener('click', async () => {
    const n = refreshProgress();
    if (n === 0) { showToast('Nothing answered yet', 'error'); return; }
    const total = visibleQuestions().length;
    if (n < total) {
        const missing = visibleQuestions().filter(f => !isAnswered(f)).map(f => `<li>${escapeHtml(f.label)}</li>`).join('');
        const ok = await openModal({
            title: `Save with ${total - n} unanswered?`,
            html: `These questions are blank:<ul style="margin:0.5rem 0 0 1.2rem">${missing}</ul>`,
            okLabel: 'Save anyway',
            cancelLabel: 'Go back'
        });
        if (!ok) return;
    }
    const record = buildRecord();
    const queue = readJSON(QUEUE_KEY, []);
    queue.push(record);
    if (!writeJSON(QUEUE_KEY, queue)) { showToast('STORAGE FULL: response NOT saved!', 'error'); return; }
    const backup = readJSON(BACKUP_KEY, []);
    backup.push(record);
    writeJSON(BACKUP_KEY, backup);
    const history = readJSON(HISTORY_KEY, []);
    history.push(record.eventId);
    writeJSON(HISTORY_KEY, history.slice(-50));
    FORM.forEach(f => {
        if (!f.recent) return;
        const v = answers[f.id];
        (Array.isArray(v) ? v : [v]).forEach(x => rememberRecent(f, x));
    });

    resetForm();
    updateCount();
    updateSyncStatus();
    showToast('Respondent saved');
    syncQueue();
});

$('btn-clear').addEventListener('click', async () => {
    if (refreshProgress() === 0) return;
    const ok = await openModal({ title: 'Clear this form?', html: 'All answers on the form will be removed. Saved respondents are not affected.', okLabel: 'Clear', danger: true });
    if (ok) resetForm();
});

$('btn-undo').addEventListener('click', async () => {
    const history = readJSON(HISTORY_KEY, []);
    const id = history[history.length - 1];
    if (!id) { showToast('Nothing to undo', 'error'); return; }
    if (inFlightIds.has(id)) { showToast('Sending it right now. Try again in a moment.', 'error'); return; }
    const record = readJSON(QUEUE_KEY, []).find(r => r.eventId === id);
    if (!record) {
        history.pop();
        writeJSON(HISTORY_KEY, history);
        showToast('Already synced to the sheet. Cannot undo.', 'error');
        return;
    }
    const ok = await openModal({
        title: 'Delete the last saved respondent?',
        html: `Saved at ${escapeHtml(record.time)}${record.category ? ' · ' + escapeHtml(record.category) : ''}.`,
        okLabel: 'Delete',
        danger: true
    });
    if (!ok) return;
    history.pop();
    writeJSON(HISTORY_KEY, history);
    writeJSON(QUEUE_KEY, readJSON(QUEUE_KEY, []).filter(r => r.eventId !== id));
    writeJSON(BACKUP_KEY, readJSON(BACKUP_KEY, []).filter(r => r.eventId !== id));
    updateCount();
    updateAutoInfo();
    updateSyncStatus();
    showToast('Last respondent deleted');
});

function sessionRecords() {
    if (!session) return [];
    return readJSON(BACKUP_KEY, []).filter(r => r.sessionId === session.id);
}
function updateCount() { $('count-session').textContent = sessionRecords().length; }

// ---------------------------------------------------------------------
// End survey
// ---------------------------------------------------------------------
$('btn-end').addEventListener('click', async () => {
    const records = sessionRecords();
    const draftN = refreshProgress();
    const ok = await openModal({
        title: 'End survey?',
        html: `Location <b>${escapeHtml(session.locationId)}</b> (${escapeHtml(session.locationName || '')}): ${records.length} respondent(s) saved.` +
            (draftN ? '<br><b>The form on screen is not saved yet</b> and will be kept as a draft.' : ''),
        okLabel: 'End survey',
        danger: true
    });
    if (!ok) return;
    session.active = false;
    saveSession();
    writeJSON(HISTORY_KEY, []);
    syncQueue();
    const pending = readJSON(QUEUE_KEY, []).length;
    await openModal({
        title: `${session.locationId} · ${session.locationName || ''}: survey ended`,
        html: `<table>
            <tr><td>Respondents saved</td><td>${records.length}</td></tr>
            <tr><td>Waiting to sync (this device)</td><td>${pending}</td></tr>
        </table>` + (pending ? '<p style="margin-top:0.6rem">Keep the app open with internet until everything is synced, or export a backup.</p>' : ''),
        okLabel: 'New survey',
        showCancel: false
    });
    fillSetupFromSession();
    showScreen('setup');
});

function fillSetupFromSession() {
    inputName.value = session.name || '';
    inputLocId.value = session.locationId || '';
    inputLocName.value = session.locationName || '';
    setupGps = session.gps || null;
    if (setupGps) showGpsStatus(`GPS saved: ${setupGps.lat}, ${setupGps.lon}`, 'ok');
    checkSetupForm();
}

// ---------------------------------------------------------------------
// Sync (batches of 50, removed from the queue only after server success)
// ---------------------------------------------------------------------
function isBackendConfigured() { return !!CONFIG.appsScriptUrl && CONFIG.appsScriptUrl !== PLACEHOLDER_URL; }

function syncQueue() {
    if (isSyncing || !navigator.onLine || !isBackendConfigured()) { updateSyncStatus(); return; }
    const queue = readJSON(QUEUE_KEY, []);
    if (!queue.length) { updateSyncStatus(); return; }
    const batch = queue.slice(0, BATCH_SIZE);
    isSyncing = true;
    inFlightIds = new Set(batch.map(r => r.eventId));
    updateSyncStatus();

    fetch(CONFIG.appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: SYNC_ACTION, payload: batch }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
        .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(result => {
            if (result.status !== 'success') throw new Error(result.message || 'Server error');
            writeJSON(QUEUE_KEY, readJSON(QUEUE_KEY, []).filter(r => !inFlightIds.has(r.eventId)));
            lastSyncError = null;
        })
        .catch(err => { lastSyncError = err.message || String(err); console.error('Sync failed:', err); })
        .finally(() => {
            isSyncing = false;
            inFlightIds = new Set();
            updateSyncStatus();
            if (!lastSyncError && readJSON(QUEUE_KEY, []).length) setTimeout(syncQueue, 800);
        });
}

function updateSyncStatus() {
    const node = $('sync-status');
    const pending = readJSON(QUEUE_KEY, []).length;
    let cls = 'sync-status', label;
    if (!isBackendConfigured()) { cls += ' unconfigured'; label = `Not linked to sheet · ${pending} on device`; }
    else if (!navigator.onLine) { cls += ' offline'; label = `Offline · ${pending} pending`; }
    else if (isSyncing) { cls += ' syncing'; label = `Syncing · ${pending} pending`; }
    else if (lastSyncError && pending) { cls += ' error'; label = `Sync error · ${pending} pending`; }
    else if (pending) { cls += ' pending'; label = `Online · ${pending} pending`; }
    else label = 'Online · Synced';
    node.className = cls;
    node.querySelector('.sync-text').textContent = label;
    node.title = lastSyncError ? `Last error: ${lastSyncError}` : '';
}
window.addEventListener('online', () => { updateSyncStatus(); syncQueue(); });
window.addEventListener('offline', updateSyncStatus);

// ---------------------------------------------------------------------
// Local backup export
// ---------------------------------------------------------------------
function exportLocalBackup() {
    const records = readJSON(BACKUP_KEY, []);
    const pending = readJSON(QUEUE_KEY, []);
    if (!records.length && !pending.length) { showToast('No responses on this device yet', 'error'); return; }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records, pendingSync: pending, draft: answers }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = `pedestrian_od_backup_${formatDate(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Backup exported (${records.length} respondents)`);
}
$('btn-export').addEventListener('click', exportLocalBackup);
$('btn-export-setup').addEventListener('click', exportLocalBackup);

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
function init() {
    let theme = 'dark';
    try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(theme);

    // Netlify's hosting badge sits in the bottom-right corner; the CSS keeps
    // the Save button out from under it. Netlify inserts its script after
    // app.js, so look again once the whole page has been parsed.
    const markHostBadge = () => {
        if (/\.netlify\.app$/.test(location.hostname) || document.querySelector('script[src*="/.netlify/scripts/"]')) {
            document.body.classList.add('has-host-badge');
        }
    };
    markHostBadge();
    document.addEventListener('DOMContentLoaded', markHostBadge);

    if (CONFIG.surveyAreaName) {
        document.querySelector('#screen-welcome .subtitle').textContent = `${CONFIG.surveyAreaName} · One form per respondent`;
    }

    $('preset-locations').innerHTML = (CONFIG.presetLocations || []).map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    buildForm();
    if (session) fillSetupFromSession();
    if (session && session.active) {
        startSurveyScreen();
        if (refreshProgress()) showToast('Unsaved form restored');
    }

    updateSyncStatus();
    setInterval(syncQueue, SYNC_INTERVAL_MS);
    setInterval(() => { if (screens.survey.classList.contains('active')) updateAutoInfo(); }, 20000);
    if (!isBackendConfigured()) setTimeout(() => showToast('Apps Script URL not set: data is kept on this device only', 'error'), 600);
    syncQueue();
}

init();

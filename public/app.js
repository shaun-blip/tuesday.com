// ===== tuesday.com - Beau Bottles Workflow =====
(function() {
'use strict';

// ===== API Helper =====
let currentUser = null;
let currentPage = 'board';

async function api(method, url, body) {
    const token = localStorage.getItem('tuesday_token');
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) { localStorage.removeItem('tuesday_token'); window.location.href = '/login.html'; return; }
    if (!res.ok) { const err = await res.json().catch(() => ({error:'Request failed'})); throw new Error(err.error || 'Request failed'); }
    return res.json();
}

async function fetchBoard() {
    const data = await api('GET', '/api/board');
    state.boardName = data.boardName;
    state.members = data.members;
    state.groups = data.groups;
    state.items = data.items;
    if (currentPage === 'board') render();
}

// ===== State =====
let state = { boardName: 'Beau Bottles Workflow', members: [], groups: [], items: [] };

let filterPersons = [];
let filterStatuses = [];
let filterPriorities = [];
let activeSort = '';
let hiddenCols = [];
let groupByMode = 'default';

// loadState/saveState removed — data is fetched from server via fetchBoard()

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// ===== DOM Refs =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const tableContent = $('#table-content');
const searchInput = $('#search-input');
const searchBox = $('#search-box');

const personFilterBtn = $('#person-filter-btn');
const filterBtn = $('#filter-btn');
const sortBtn = $('#sort-btn');
const hideBtn = $('#hide-btn');
const groupbyBtn = $('#groupby-btn');

const personDropdown = $('#person-dropdown');
const filterDropdown = $('#filter-dropdown');
const sortDropdown = $('#sort-dropdown');
const hideDropdown = $('#hide-dropdown');
const groupbyDropdown = $('#groupby-dropdown');

const itemModal = $('#item-modal');
const itemForm = $('#item-form');
const modalTitle = $('#modal-title');
const itemIdInput = $('#item-id');
const itemGroupIdInput = $('#item-group-id');
const itemTitleInput = $('#item-title');
const itemStatusInput = $('#item-status');
const itemPriorityInput = $('#item-priority');
const itemDateInput = $('#item-date');
const personCheckboxes = $('#person-checkboxes');
const fileInput = $('#file-input');
const fileUploadArea = $('#file-upload-area');
const attachmentList = $('#attachment-list');
const deleteItemBtn = $('#delete-item-btn');

const groupModal = $('#group-modal');
const groupForm = $('#group-form');
const groupModalTitle = $('#group-modal-title');
const groupIdInput = $('#group-id');
const groupNameInput = $('#group-name');
const deleteGroupBtn = $('#delete-group-btn');

const confirmModal = $('#confirm-modal');
const confirmMessage = $('#confirm-message');
const confirmOk = $('#confirm-ok');
const confirmCancel = $('#confirm-cancel');

const inlinePopup = $('#inline-popup');
const updatesPanel = $('#updates-panel');
const filePreviewModal = $('#file-preview-modal');
const filePreviewTitle = $('#file-preview-title');
const filePreviewContent = $('#file-preview-content');
const filePreviewDownload = $('#file-preview-download');

let pendingAttachments = [];
let originalAttachmentIds = [];
let confirmCallback = null;
let currentUpdatesItemId = null;
let currentUpdatesParentId = null;

// ===== Status & Priority Config =====
const STATUS_CONFIG = {
    'stuck':        { label: 'Stuck',        bg: 'var(--status-stuck)',       hex: '#e2445c' },
    'ongoing':      { label: 'Ongoing',      bg: 'var(--status-ongoing)',     hex: '#c4def6', dark: true },
    'done':         { label: 'Done',         bg: 'var(--status-done)',        hex: '#00c875' },
    'working_on_it':{ label: 'Working on it',bg: 'var(--status-working)',     hex: '#fdab3d' },
    'not_started':  { label: 'Not Started',  bg: 'var(--status-not-started)', hex: '#c4c4c4' },
    'input_needed': { label: 'Input Needed', bg: 'var(--status-input-needed)',hex: '#5c5c5c' },
    'in_process':   { label: 'In Process',   bg: 'var(--status-in-process)',  hex: '#0086c0' }
};

const PRIORITY_CONFIG = {
    'critical': { label: 'Critical \u26A0\uFE0F', bg: 'var(--priority-critical)', hex: '#333333' },
    'high':     { label: 'High',     bg: 'var(--priority-high)',     hex: '#401694' },
    'medium':   { label: 'Medium',   bg: 'var(--priority-medium)',   hex: '#5559df' },
    'low':      { label: 'Low',      bg: 'var(--priority-low)',      hex: '#579bfc' }
};

const STATUS_ORDER = { 'stuck':0, 'input_needed':1, 'working_on_it':2, 'in_process':3, 'ongoing':4, 'not_started':5, 'done':6, '':7 };
const PRIORITY_ORDER = { 'critical':0, 'high':1, 'medium':2, 'low':3, '':4 };

// ===== Dropdown Management =====
const dropdowns = [
    { btn: null, panel: null, id: 'person' },
    { btn: null, panel: null, id: 'filter' },
    { btn: null, panel: null, id: 'sort' },
    { btn: null, panel: null, id: 'hide' },
    { btn: null, panel: null, id: 'groupby' }
];

function initDropdownRefs() {
    dropdowns[0].btn = personFilterBtn; dropdowns[0].panel = personDropdown;
    dropdowns[1].btn = filterBtn; dropdowns[1].panel = filterDropdown;
    dropdowns[2].btn = sortBtn; dropdowns[2].panel = sortDropdown;
    dropdowns[3].btn = hideBtn; dropdowns[3].panel = hideDropdown;
    dropdowns[4].btn = groupbyBtn; dropdowns[4].panel = groupbyDropdown;
}

function toggleDropdown(targetId) {
    const newItemDD = $('#new-item-dropdown');
    if (newItemDD) newItemDD.classList.remove('open');
    dropdowns.forEach(d => {
        if (d.id === targetId) {
            const isOpen = d.panel.classList.contains('open');
            d.panel.classList.toggle('open', !isOpen);
            d.btn.classList.toggle('active', !isOpen);
        } else {
            d.panel.classList.remove('open');
            d.btn.classList.remove('active');
        }
    });
}

function closeAllDropdowns() {
    dropdowns.forEach(d => { d.panel.classList.remove('open'); d.btn.classList.remove('active'); });
}

function positionDropdown(btn, panel) {
    const rect = btn.getBoundingClientRect();
    const mainRect = $('#main-content').getBoundingClientRect();
    panel.style.left = (rect.left - mainRect.left) + 'px';
    panel.style.top = (rect.bottom - mainRect.top + 4) + 'px';
}

// ===== Populate Filter Dropdowns =====
function populatePersonFilter() {
    const container = $('#person-filter-list');
    container.innerHTML = '';
    state.members.forEach(m => {
        const label = document.createElement('label');
        label.className = 'dropdown-option';
        const checked = filterPersons.includes(m.id) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${m.id}" ${checked}><span class="person-mini" style="background:${m.color}">${esc(m.name)}</span>${esc(m.fullName)}`;
        label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) { if (!filterPersons.includes(m.id)) filterPersons.push(m.id); }
            else { filterPersons = filterPersons.filter(p => p !== m.id); }
            updateBadges(); render();
        });
        container.appendChild(label);
    });
}

function populateStatusFilter() {
    const container = $('#status-filter-list');
    container.innerHTML = '';
    Object.entries(STATUS_CONFIG).forEach(([key, cfg]) => {
        const label = document.createElement('label');
        label.className = 'dropdown-option';
        const checked = filterStatuses.includes(key) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${key}" ${checked}><span class="status-swatch" style="background:${cfg.hex}"></span>${cfg.label}`;
        label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) { if (!filterStatuses.includes(key)) filterStatuses.push(key); }
            else { filterStatuses = filterStatuses.filter(s => s !== key); }
            updateBadges(); render();
        });
        container.appendChild(label);
    });
}

function populatePriorityFilter() {
    const container = $('#priority-filter-list');
    container.innerHTML = '';
    Object.entries(PRIORITY_CONFIG).forEach(([key, cfg]) => {
        const label = document.createElement('label');
        label.className = 'dropdown-option';
        const checked = filterPriorities.includes(key) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${key}" ${checked}><span class="priority-swatch" style="background:${cfg.hex}"></span>${cfg.label.replace(' \u26A0\uFE0F', '')}`;
        label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) { if (!filterPriorities.includes(key)) filterPriorities.push(key); }
            else { filterPriorities = filterPriorities.filter(p => p !== key); }
            updateBadges(); render();
        });
        container.appendChild(label);
    });
}

function updateBadges() {
    updateBtnBadge(personFilterBtn, filterPersons.length);
    updateBtnBadge(filterBtn, filterStatuses.length + filterPriorities.length);
    sortBtn.classList.toggle('active', activeSort !== '');
    updateBtnBadge(hideBtn, hiddenCols.length);
    groupbyBtn.classList.toggle('active', groupByMode !== 'default');
}

function updateBtnBadge(btn, count) {
    let badge = btn.querySelector('.filter-badge');
    if (count > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'filter-badge'; btn.appendChild(badge); }
        badge.textContent = count;
    } else { if (badge) badge.remove(); }
}

// ===== Filtering & Sorting =====
function applyFilters(items) {
    let filtered = items;
    const query = searchInput.value.toLowerCase().trim();
    if (query) {
        filtered = filtered.filter(it =>
            it.title.toLowerCase().includes(query) ||
            it.persons.some(pid => { const m = state.members.find(mm => mm.id === pid); return m && (m.name.toLowerCase().includes(query) || m.fullName.toLowerCase().includes(query)); }) ||
            (it.subitems && it.subitems.some(s => s.title.toLowerCase().includes(query)))
        );
    }
    if (filterPersons.length > 0) filtered = filtered.filter(it => it.persons.some(pid => filterPersons.includes(pid)));
    if (filterStatuses.length > 0) filtered = filtered.filter(it => filterStatuses.includes(it.status));
    if (filterPriorities.length > 0) filtered = filtered.filter(it => filterPriorities.includes(it.priority));
    return filtered;
}

function applySorting(items) {
    if (!activeSort) return items;
    const sorted = [...items];
    switch(activeSort) {
        case 'title_asc': sorted.sort((a,b) => a.title.localeCompare(b.title)); break;
        case 'title_desc': sorted.sort((a,b) => b.title.localeCompare(a.title)); break;
        case 'status': sorted.sort((a,b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)); break;
        case 'priority': sorted.sort((a,b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)); break;
        case 'date_asc': sorted.sort((a,b) => { if(!a.date&&!b.date)return 0; if(!a.date)return 1; if(!b.date)return -1; return a.date.localeCompare(b.date); }); break;
        case 'date_desc': sorted.sort((a,b) => { if(!a.date&&!b.date)return 0; if(!a.date)return 1; if(!b.date)return -1; return b.date.localeCompare(a.date); }); break;
    }
    return sorted;
}

// ===== Group By =====
function getGroupedData() {
    if (groupByMode === 'default') {
        return state.groups.map(g => ({ id:g.id, name:g.name, color:g.color, collapsed:g.collapsed, isVirtual:false, items:state.items.filter(it => it.groupId === g.id) }));
    }
    const allItems = [...state.items];
    const vg = [];
    if (groupByMode === 'status') {
        const keys = [...new Set(allItems.map(it => it.status || ''))].sort((a,b) => (STATUS_ORDER[a]??99)-(STATUS_ORDER[b]??99));
        keys.forEach(key => { const cfg = STATUS_CONFIG[key]; vg.push({ id:'vg_s_'+(key||'none'), name:cfg?cfg.label:'(No Status)', color:cfg?cfg.hex:'#999', collapsed:false, isVirtual:true, items:allItems.filter(it=>(it.status||'')===key) }); });
    } else if (groupByMode === 'priority') {
        const keys = [...new Set(allItems.map(it => it.priority || ''))].sort((a,b) => (PRIORITY_ORDER[a]??99)-(PRIORITY_ORDER[b]??99));
        keys.forEach(key => { const cfg = PRIORITY_CONFIG[key]; vg.push({ id:'vg_p_'+(key||'none'), name:cfg?cfg.label.replace(' \u26A0\uFE0F',''):'(No Priority)', color:cfg?cfg.hex:'#999', collapsed:false, isVirtual:true, items:allItems.filter(it=>(it.priority||'')===key) }); });
    } else if (groupByMode === 'person') {
        state.members.forEach(m => { vg.push({ id:'vg_m_'+m.id, name:m.fullName, color:m.color, collapsed:false, isVirtual:true, items:allItems.filter(it=>it.persons.includes(m.id)) }); });
        const unassigned = allItems.filter(it => !it.persons || it.persons.length === 0);
        if (unassigned.length > 0) vg.push({ id:'vg_m_none', name:'Unassigned', color:'#999', collapsed:false, isVirtual:true, items:unassigned });
    }
    return vg;
}

// ===== Inline Popup System =====
function closeInlinePopup() { inlinePopup.classList.remove('open'); inlinePopup.innerHTML = ''; }

function showInlinePopup(cellEl, contentEl) {
    inlinePopup.innerHTML = '';
    if (contentEl instanceof DocumentFragment) { inlinePopup.appendChild(contentEl); }
    else { inlinePopup.appendChild(contentEl); }
    inlinePopup.classList.add('open');
    const rect = cellEl.getBoundingClientRect();
    const popupRect = inlinePopup.getBoundingClientRect();
    const popupWidth = popupRect.width || 220;
    const popupHeight = popupRect.height || 200;
    let top = rect.bottom + 4;
    let left = rect.left + (rect.width / 2) - (popupWidth / 2);
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (left < 16) left = 16;
    if (top + popupHeight > window.innerHeight - 16) top = rect.top - popupHeight - 4;
    inlinePopup.style.left = left + 'px';
    inlinePopup.style.top = top + 'px';
}

function openStatusPicker(cellEl, itemId, parentId) {
    const frag = document.createDocumentFragment();
    const noneOpt = document.createElement('div');
    noneOpt.className = 'inline-popup-option';
    noneOpt.innerHTML = '<span class="option-color" style="background:#eee;color:var(--text-muted);">None</span>';
    noneOpt.addEventListener('click', () => updateItemField(itemId, 'status', '', parentId));
    frag.appendChild(noneOpt);
    Object.entries(STATUS_CONFIG).forEach(([key, cfg]) => {
        const opt = document.createElement('div');
        opt.className = 'inline-popup-option';
        const cs = cfg.dark ? `background:${cfg.hex};color:var(--text);` : `background:${cfg.hex};`;
        opt.innerHTML = `<span class="option-color" style="${cs}">${cfg.label}</span>`;
        opt.addEventListener('click', () => updateItemField(itemId, 'status', key, parentId));
        frag.appendChild(opt);
    });
    showInlinePopup(cellEl, frag);
}

function openPriorityPicker(cellEl, itemId, parentId) {
    const frag = document.createDocumentFragment();
    const noneOpt = document.createElement('div');
    noneOpt.className = 'inline-popup-option';
    noneOpt.innerHTML = '<span class="option-color" style="background:#eee;color:var(--text-muted);">None</span>';
    noneOpt.addEventListener('click', () => updateItemField(itemId, 'priority', '', parentId));
    frag.appendChild(noneOpt);
    Object.entries(PRIORITY_CONFIG).forEach(([key, cfg]) => {
        const opt = document.createElement('div');
        opt.className = 'inline-popup-option';
        opt.innerHTML = `<span class="option-color" style="background:${cfg.hex}">${cfg.label}</span>`;
        opt.addEventListener('click', () => updateItemField(itemId, 'priority', key, parentId));
        frag.appendChild(opt);
    });
    showInlinePopup(cellEl, frag);
}

function openDatePicker(cellEl, itemId, parentId) {
    const item = parentId ? findSubitem(parentId, itemId) : state.items.find(it => it.id === itemId);
    const container = document.createElement('div');
    container.className = 'inline-popup-date';
    container.innerHTML = `<input type="date" value="${item ? item.date || '' : ''}"><div class="popup-actions"><button class="btn-cancel" style="padding:4px 12px;font-size:12px;">Clear</button><button class="btn-save" style="padding:4px 12px;font-size:12px;">Save</button></div>`;
    const dateInput = container.querySelector('input');
    container.querySelector('.btn-save').addEventListener('click', () => updateItemField(itemId, 'date', dateInput.value, parentId));
    container.querySelector('.btn-cancel').addEventListener('click', () => updateItemField(itemId, 'date', '', parentId));
    showInlinePopup(cellEl, container);
    dateInput.focus();
}

function openFilesPicker(cellEl, itemId, parentId) {
    const item = parentId ? findSubitem(parentId, itemId) : state.items.find(it => it.id === itemId);
    const container = document.createElement('div');
    container.className = 'inline-popup-files';
    if (item && item.attachments && item.attachments.length > 0) {
        item.attachments.forEach(att => {
            const row = document.createElement('div');
            row.className = 'attachment-item';
            row.innerHTML = `<span class="file-name" style="cursor:pointer;text-decoration:underline;">${esc(att.name)}</span><span class="file-size">${formatSize(att.size)}</span><button class="remove-att" title="Delete file">&times;</button>`;
            row.querySelector('.file-name').addEventListener('click', (e) => { e.stopPropagation(); closeInlinePopup(); openFilePreview(att); });
            row.querySelector('.remove-att').addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm('Are you sure you want to delete "' + att.name + '"?', async () => { await api('DELETE', '/api/attachments/' + att.id); closeInlinePopup(); await fetchBoard(); });
            });
            container.appendChild(row);
        });
    }
    const uploadArea = document.createElement('div');
    uploadArea.className = 'file-upload-mini';
    uploadArea.textContent = '+ Add file';
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file'; hiddenInput.multiple = true; hiddenInput.style.display = 'none';
    uploadArea.addEventListener('click', () => hiddenInput.click());
    hiddenInput.addEventListener('change', (e) => handleInlineFiles(itemId, e.target.files, parentId));
    container.appendChild(uploadArea);
    container.appendChild(hiddenInput);
    showInlinePopup(cellEl, container);
}

function handleInlineFiles(itemId, files, parentId) {
    if (!files || !files.length) return;
    const parentType = parentId ? 'subitem' : 'item';
    Array.from(files).forEach(file => {
        if (file.size > 2*1024*1024) { alert(`"${file.name}" too large. Max 2MB.`); return; }
        const reader = new FileReader();
        reader.onload = async () => { await api('POST', '/api/attachments', { parentType, parentId: itemId, name: file.name, size: file.size, type: file.type, data: reader.result }); closeInlinePopup(); await fetchBoard(); };
        reader.readAsDataURL(file);
    });
}

function findSubitem(parentId, subId) {
    const parent = state.items.find(it => it.id === parentId);
    return parent ? parent.subitems.find(s => s.id === subId) : null;
}

async function updateItemField(itemId, field, value, parentId) {
    closeInlinePopup();
    const url = parentId ? '/api/subitems/' + itemId : '/api/items/' + itemId;
    await api('PUT', url, { [field]: value });
    await fetchBoard();
}

// ===== Updates Panel =====
function openUpdatesPanel(itemId, parentId) {
    currentUpdatesItemId = itemId;
    currentUpdatesParentId = parentId || null;
    const item = parentId ? findSubitem(parentId, itemId) : state.items.find(it => it.id === itemId);
    if (!item) return;
    $('#updates-panel-title').textContent = item.title;
    renderUpdatesBody(item);
    renderAuthorSelect();
    updatesPanel.classList.add('open');
    $('#updates-text').value = '';
}

function closeUpdatesPanel() { updatesPanel.classList.remove('open'); currentUpdatesItemId = null; currentUpdatesParentId = null; }

function renderUpdatesBody(item) {
    const body = $('#updates-panel-body');
    body.innerHTML = '';
    if (!item.updates || item.updates.length === 0) {
        body.innerHTML = `<div class="updates-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div>No updates yet</div><div style="font-size:12px;margin-top:4px;">Be the first to post an update</div></div>`;
        return;
    }
    const sorted = [...item.updates].sort((a,b) => b.timestamp - a.timestamp);
    sorted.forEach(upd => {
        const member = state.members.find(m => m.id === upd.author);
        const el = document.createElement('div');
        el.className = 'update-item';
        el.innerHTML = `<div class="update-header"><span class="avatar" style="background:${member?member.color:'#999'};width:28px;height:28px;font-size:11px;font-weight:600;">${member?esc(member.name):'?'}</span><span class="update-author-name">${member?esc(member.fullName):'Unknown'}</span><span class="update-timestamp">${formatTimestamp(upd.timestamp)}</span></div><div class="update-text">${highlightMentions(upd.text)}</div>`;
        body.appendChild(el);
    });
}

function renderAuthorSelect() {
    const container = $('#updates-author-select');
    container.innerHTML = '';
    if (!currentUser) return;
    const m = state.members.find(mm => mm.id === currentUser.id);
    if (!m) return;
    const av = document.createElement('span');
    av.className = 'avatar selected';
    av.style.cssText = `background:${m.color};width:28px;height:28px;font-size:11px;font-weight:600;`;
    av.textContent = m.name;
    av.title = m.fullName;
    container.appendChild(av);
}

async function postUpdate() {
    if (!currentUpdatesItemId || !currentUser) return;
    const text = $('#updates-text').value.trim();
    if (!text) return;
    const isSubitem = !!currentUpdatesParentId;
    const url = isSubitem ? '/api/subitems/' + currentUpdatesItemId + '/updates' : '/api/items/' + currentUpdatesItemId + '/updates';
    await api('POST', url, { text });
    $('#updates-text').value = '';
    await fetchBoard();
    // Re-render updates panel for same item
    const item = currentUpdatesParentId ? findSubitem(currentUpdatesParentId, currentUpdatesItemId) : state.items.find(it => it.id === currentUpdatesItemId);
    if (item) renderUpdatesBody(item);
}

// ===== @Mention Autocomplete =====
let mentionActive = false;
let mentionQuery = '';
let mentionStartPos = -1;
let mentionSelectedIdx = 0;

function getMentionDropdown() { return $('#mention-dropdown'); }

function getFilteredMembers(query) {
    const q = query.toLowerCase();
    return state.members.filter(m => m.fullName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
}

function showMentionDropdown(matches) {
    const dd = getMentionDropdown();
    dd.innerHTML = '';
    matches.forEach((m, i) => {
        const opt = document.createElement('div');
        opt.className = 'mention-option' + (i === mentionSelectedIdx ? ' active' : '');
        opt.innerHTML = `<span class="avatar" style="background:${m.color};width:26px;height:26px;font-size:10px;font-weight:600;">${esc(m.name)}</span><span class="mention-option-name">${esc(m.fullName)}</span>`;
        opt.addEventListener('mousedown', (e) => { e.preventDefault(); insertMention(m); });
        opt.addEventListener('mouseenter', () => {
            mentionSelectedIdx = i;
            dd.querySelectorAll('.mention-option').forEach((o, j) => o.classList.toggle('active', j === i));
        });
        dd.appendChild(opt);
    });
    dd.classList.add('open');
}

function hideMentionDropdown() {
    getMentionDropdown().classList.remove('open');
    mentionActive = false;
    mentionStartPos = -1;
    mentionSelectedIdx = 0;
}

function insertMention(member) {
    const textarea = $('#updates-text');
    const before = textarea.value.substring(0, mentionStartPos);
    const after = textarea.value.substring(textarea.selectionStart);
    const mention = '@' + member.fullName;
    textarea.value = before + mention + ' ' + after;
    const newPos = before.length + mention.length + 1;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
    hideMentionDropdown();
}

function handleMentionInput(e) {
    const textarea = e.target;
    const pos = textarea.selectionStart;
    const text = textarea.value;

    // Look backward from cursor for an @ that starts a mention
    let atPos = -1;
    for (let i = pos - 1; i >= 0; i--) {
        if (text[i] === '@') { atPos = i; break; }
        if (text[i] === ' ' && i < pos - 1 && atPos === -1) { /* keep searching for @ before a space only if query might have spaces (names do) */ }
        if (text[i] === '\n') break;
    }

    if (atPos >= 0 && (atPos === 0 || text[atPos - 1] === ' ' || text[atPos - 1] === '\n')) {
        mentionQuery = text.substring(atPos + 1, pos);
        mentionStartPos = atPos;
        const matches = getFilteredMembers(mentionQuery);
        if (matches.length > 0) {
            mentionActive = true;
            mentionSelectedIdx = Math.min(mentionSelectedIdx, matches.length - 1);
            showMentionDropdown(matches);
            return;
        }
    }
    hideMentionDropdown();
}

function handleMentionKeydown(e) {
    if (!mentionActive) return;
    const matches = getFilteredMembers(mentionQuery);
    if (!matches.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionSelectedIdx = (mentionSelectedIdx + 1) % matches.length;
        showMentionDropdown(matches);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionSelectedIdx = (mentionSelectedIdx - 1 + matches.length) % matches.length;
        showMentionDropdown(matches);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        insertMention(matches[mentionSelectedIdx]);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionDropdown();
    }
}

function highlightMentions(text) {
    let escaped = esc(text);
    // Sort members by name length descending to match longest names first
    const sorted = [...state.members].sort((a, b) => b.fullName.length - a.fullName.length);
    for (const m of sorted) {
        const mention = '@' + esc(m.fullName);
        if (escaped.includes(mention)) {
            escaped = escaped.split(mention).join(`<span class="mention-tag">${mention}</span>`);
        }
    }
    return escaped;
}

function formatTimestamp(ts) {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    const numTs = d.getTime();
    if (isNaN(numTs)) return '';
    const diffMs = Date.now() - numTs;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + 'm ago';
    if (diffHr < 24) return diffHr + 'h ago';
    if (diffDay < 7) return diffDay + 'd ago';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ===== Page Routing =====
function navigateTo(page) {
    const pages = ['home', 'board', 'my-work', 'admin'];
    if (!pages.includes(page)) page = 'home';
    currentPage = page;
    // Show/hide page containers
    pages.forEach(p => {
        const el = $('#page-' + p);
        if (el) el.style.display = p === page ? '' : 'none';
    });
    // Show/hide board-specific elements
    const boardOnly = ['#toolbar', '#board-tabs'];
    boardOnly.forEach(sel => { const el = $(sel); if (el) el.style.display = page === 'board' ? '' : 'none'; });
    // Update board header title
    const titleEl = $('#board-title');
    if (page === 'home') titleEl.textContent = 'Home';
    else if (page === 'my-work') titleEl.textContent = 'My Work';
    else if (page === 'admin') titleEl.textContent = 'Members';
    else titleEl.textContent = state.boardName || 'Beau Bottles Workflow';
    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navId = page === 'board' ? null : 'nav-' + page;
    if (navId) { const n = $('#' + navId); if (n) n.classList.add('active'); }
    document.querySelectorAll('.board-list-item').forEach(b => b.classList.toggle('active', page === 'board'));
    // Render page content
    if (page === 'home') renderDashboard();
    else if (page === 'my-work') renderMyWork();
    else if (page === 'admin') renderAdmin();
    else renderTable();
}

// ===== Render =====
function render() {
    renderSidebar();
    navigateTo(currentPage);
}

function renderSidebar() {
    const boardListEl = $('#board-list');
    boardListEl.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'board-list-item' + (currentPage === 'board' ? ' active' : '');
    item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg> Beau Bottles Workflow`;
    item.addEventListener('click', () => { window.location.hash = '#board'; });
    boardListEl.appendChild(item);
    // User profile in sidebar
    if (currentUser) {
        const m = state.members.find(mm => mm.id === currentUser.id);
        const avatarEl = $('#sidebar-avatar');
        const nameEl = $('#sidebar-user-name');
        if (avatarEl && m) { avatarEl.style.background = m.color; avatarEl.textContent = m.name || currentUser.initials; }
        if (nameEl) nameEl.textContent = currentUser.name || '';
    }
}

// ===== Dashboard =====
async function renderDashboard() {
    try {
        const data = await api('GET', '/api/dashboard');
        const welcome = $('#dash-welcome');
        const statsEl = $('#dash-stats');
        const attentionEl = $('#dash-attention');
        const activityEl = $('#dash-activity');
        welcome.innerHTML = `<h2>Good ${getTimeOfDay()}, ${currentUser ? currentUser.name.split(' ')[0] : ''}!</h2><p>Here's your project overview</p>`;
        statsEl.innerHTML = `
            <div class="stat-card"><div class="stat-number">${data.stats.total}</div><div class="stat-label">Total Items</div></div>
            <div class="stat-card stat-done"><div class="stat-number">${data.stats.done}</div><div class="stat-label">Done</div></div>
            <div class="stat-card stat-working"><div class="stat-number">${data.stats.working}</div><div class="stat-label">In Progress</div></div>
            <div class="stat-card stat-stuck"><div class="stat-number">${data.stats.stuck}</div><div class="stat-label">Stuck</div></div>`;
        if (data.needsAttention && data.needsAttention.length) {
            attentionEl.innerHTML = data.needsAttention.map(it => `<div class="dash-item"><span class="dash-item-title">${esc(it.title)}</span><span class="status-label ${it.status}" style="font-size:11px;">${(STATUS_CONFIG[it.status]||{}).label||it.status}</span></div>`).join('');
        } else { attentionEl.innerHTML = '<p class="dash-empty">No items needing attention</p>'; }
        if (data.activity && data.activity.length) {
            activityEl.innerHTML = data.activity.map(a => {
                const ts = typeof a.created_at === 'number' ? a.created_at : new Date(a.created_at).getTime();
                return `<div class="activity-item"><span class="activity-action">${esc(a.action.replace(/_/g,' '))}</span><span class="activity-detail">${esc(a.item_title||'')} ${a.details ? '— '+esc(a.details):''}</span><span class="activity-time">${formatTimestamp(ts)}</span></div>`;
            }).join('');
        } else { activityEl.innerHTML = '<p class="dash-empty">No recent activity</p>'; }
    } catch (e) { console.error('Dashboard error:', e); }
}

function getTimeOfDay() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
}

// ===== My Work =====
async function renderMyWork() {
    try {
        const items = await api('GET', '/api/my-work');
        const container = $('#my-work-content');
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="dash-empty" style="padding:40px;text-align:center;"><p>No items assigned to you yet.</p></div>';
            return;
        }
        // Group by status
        const grouped = {};
        items.forEach(it => {
            const key = it.status || 'unset';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(it);
        });
        let html = '';
        for (const [status, items] of Object.entries(grouped)) {
            const cfg = STATUS_CONFIG[status] || { label: 'No Status', bg: '#c4c4c4' };
            html += `<div class="my-work-group"><h4 class="my-work-group-title">${cfg.label} (${items.length})</h4>`;
            items.forEach(it => {
                html += `<div class="my-work-item" data-item-id="${it.id}">
                    <span class="my-work-item-title">${esc(it.title)}</span>
                    <span class="status-label ${status}" style="font-size:11px;">${cfg.label}</span>
                    ${it.priority ? `<span class="priority-label ${it.priority}" style="font-size:11px;">${(PRIORITY_CONFIG[it.priority]||{}).label||it.priority}</span>` : ''}
                </div>`;
            });
            html += '</div>';
        }
        container.innerHTML = html;
    } catch (e) { console.error('My Work error:', e); }
}

// ===== Notification System =====
let notifPollTimer = null;
async function pollNotifications() {
    try {
        const data = await api('GET', '/api/notifications/unread-count');
        const badge = $('#notif-badge');
        if (data.count > 0) { badge.textContent = data.count > 99 ? '99+' : data.count; badge.style.display = ''; }
        else { badge.style.display = 'none'; }
    } catch (e) { /* silent */ }
}

async function renderNotifications() {
    try {
        const notifs = await api('GET', '/api/notifications');
        const list = $('#notif-list');
        if (!notifs || notifs.length === 0) {
            list.innerHTML = '<div class="notif-empty">No notifications</div>';
            return;
        }
        list.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-item-id="${n.item_id}">
                <div class="notif-message">${esc(n.actor_name || '')} ${esc(n.message || '')}</div>
                <div class="notif-item-title">${esc(n.item_title || '')}</div>
                <div class="notif-time">${formatTimestamp(n.created_at)}</div>
            </div>
        `).join('');
        list.querySelectorAll('.notif-item').forEach(el => {
            el.addEventListener('click', async () => {
                const nid = el.dataset.notifId;
                await api('PUT', '/api/notifications/' + nid + '/read');
                el.classList.remove('unread');
                pollNotifications();
            });
        });
    } catch (e) { console.error('Notification error:', e); }
}

// ===== Bulk Actions =====
let selectedItems = new Set();
function updateBulkBar() {
    const bar = $('#bulk-bar');
    if (selectedItems.size > 0) {
        bar.style.display = 'flex';
        $('#bulk-count').textContent = selectedItems.size + ' selected';
    } else {
        bar.style.display = 'none';
    }
}

async function executeBulkAction(action) {
    const ids = [...selectedItems];
    if (!ids.length) return;
    try {
        if (action === 'delete') {
            await api('DELETE', '/api/items/bulk', { itemIds: ids });
        } else if (action === 'status' || action === 'priority') {
            // Show picker inline — use first option as example
            const val = prompt(`Enter new ${action} (e.g., ${action === 'status' ? 'done, stuck, working_on_it' : 'high, medium, low'}):`);
            if (!val) return;
            const field = action === 'status' ? 'status' : 'priority';
            await api('PUT', '/api/items/bulk', { itemIds: ids, field, value: val });
        } else if (action === 'move') {
            const groupNames = state.groups.map(g => g.name).join(', ');
            const name = prompt(`Move to which group? (${groupNames}):`);
            if (!name) return;
            const g = state.groups.find(gg => gg.name.toLowerCase().includes(name.toLowerCase()));
            if (!g) { alert('Group not found'); return; }
            await api('PUT', '/api/items/bulk', { itemIds: ids, field: 'group_id', value: g.id });
        }
        selectedItems.clear();
        updateBulkBar();
        await fetchBoard();
    } catch (e) { alert(e.message); }
}

// ===== Drag and Drop =====
function initDragAndDrop() {
    if (typeof Sortable === 'undefined') return;
    // Group reordering
    const tableContent = $('#table-content');
    if (tableContent) {
        new Sortable(tableContent, {
            animation: 150,
            handle: '.group-header',
            draggable: '.group',
            ghostClass: 'drag-ghost',
            onEnd: async (evt) => {
                const groups = [...tableContent.querySelectorAll('.group')];
                const reorder = groups.map((g, i) => ({ id: g.dataset.groupId, position: i }));
                await api('PUT', '/api/groups/reorder', { items: reorder });
                await fetchBoard();
            }
        });
    }
    // Item reordering within groups
    tableContent.querySelectorAll('tbody').forEach(tbody => {
        new Sortable(tbody, {
            animation: 150,
            group: 'items',
            handle: '.item-name',
            draggable: '.item-row:not(.subitem-row)',
            ghostClass: 'drag-ghost',
            onEnd: async (evt) => {
                // Collect all item positions across all groups
                const allItems = [];
                tableContent.querySelectorAll('.group').forEach(groupEl => {
                    const gid = groupEl.dataset.groupId;
                    groupEl.querySelectorAll('tbody .item-row:not(.subitem-row)').forEach((tr, idx) => {
                        allItems.push({ id: tr.dataset.itemId, group_id: gid, position: idx });
                    });
                });
                await api('PUT', '/api/items/reorder', { items: allItems });
                await fetchBoard();
            }
        });
    });
}

function renderTable() {
    closeInlinePopup();
    tableContent.innerHTML = '';
    const groups = getGroupedData();

    groups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group';
        groupEl.dataset.groupId = group.id;

        let items = applyFilters(group.items);
        items = applySorting(items);

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `
            <button class="group-toggle ${group.collapsed ? 'collapsed' : ''}" style="color:${group.color}">&#9660;</button>
            <span class="group-title" style="color:${group.color}">${esc(group.name)}</span>
            <span class="group-count">${items.length} items</span>
            ${!group.isVirtual ? '<button class="group-edit-btn" title="Edit group">&#9998;</button>' : ''}`;

        header.querySelector('.group-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!group.isVirtual) { api('PUT', '/api/groups/' + group.id, { collapsed: !group.collapsed }).then(() => fetchBoard()); return; }
            else { group.collapsed = !group.collapsed; }
            render();
        });

        const editBtn = header.querySelector('.group-edit-btn');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditGroup(group.id); });

        groupEl.appendChild(header);

        if (!group.collapsed) {
            const table = document.createElement('table');
            table.className = 'group-table';
            const colH = (col) => hiddenCols.includes(col) ? ' col-hidden' : '';

            table.innerHTML = `<thead><tr>
                <th class="col-header" style="border-left:6px solid ${group.color}"></th>
                <th class="col-header" style="width:36px;"></th>
                <th class="col-header col-item">Item</th>
                <th class="col-header col-person${colH('person')}">Person</th>
                <th class="col-header col-status${colH('status')}">Status</th>
                <th class="col-header col-priority${colH('priority')}">Priority</th>
                <th class="col-header col-date${colH('date')}">Estimated Comp...</th>
                <th class="col-header col-files${colH('files')}">Files</th>
            </tr></thead>`;

            const tbody = document.createElement('tbody');

            items.forEach(item => {
                renderItemRow(tbody, item, group, colH, null);
            });

            table.appendChild(tbody);
            groupEl.appendChild(table);

            if (!group.isVirtual) {
                const addRow = document.createElement('div');
                addRow.className = 'add-item-row';
                addRow.textContent = '+ Add item';
                addRow.style.borderLeft = `6px solid ${group.color}`;
                addRow.addEventListener('click', () => openNewItem(group.id));
                groupEl.appendChild(addRow);
            }

            const spacer = document.createElement('div');
            spacer.style.height = '8px';
            groupEl.appendChild(spacer);
        }

        tableContent.appendChild(groupEl);
    });
    // Init drag and drop after render
    setTimeout(() => initDragAndDrop(), 0);
}

function renderItemRow(tbody, item, group, colH, parentId) {
    const isSubitem = !!parentId;
    const tr = document.createElement('tr');
    tr.className = isSubitem ? 'item-row subitem-row' : 'item-row';
    tr.dataset.itemId = item.id;

    const hasSubitems = !isSubitem && item.subitems && item.subitems.length > 0;
    const toggleHtml = !isSubitem && hasSubitems ? `<button class="subitem-toggle ${item.subitemsCollapsed ? 'collapsed' : ''}">&#9660;</button>` : (!isSubitem ? '<span style="display:inline-block;width:18px;"></span>' : '');
    const countBadge = hasSubitems ? `<span class="subitem-count">${item.subitems.length}</span>` : '';
    const addSubBtn = !isSubitem ? '<button class="add-subitem-btn">+ Sub</button>' : '';
    const updCount = (item.updates && item.updates.length > 0) ? `<span class="updates-badge">${item.updates.length > 99 ? '99+' : item.updates.length}</span>` : '';

    const borderStyle = isSubitem ? `border-left:3px solid ${group.color};padding-left:28px;opacity:0.5;` : `border-left:6px solid ${group.color};padding-left:8px;`;

    tr.innerHTML = `
        <td style="width:32px;"><div style="${borderStyle}"><input type="checkbox" class="row-checkbox"></div></td>
        <td class="updates-icon-cell"><button class="updates-icon" title="Updates"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${updCount}</button></td>
        <td class="item-name">${toggleHtml}${esc(item.title)}${countBadge}${addSubBtn}</td>
        <td class="person-cell${colH('person')}"><div class="avatar-stack">${renderAvatars(item.persons)}</div></td>
        <td class="status-cell${colH('status')}">${renderStatusLabel(item.status)}</td>
        <td class="priority-cell${colH('priority')}">${renderPriorityLabel(item.priority)}</td>
        <td class="date-cell${colH('date')}">${formatDate(item.date)}</td>
        <td class="files-cell${colH('files')}">${renderFileIcons(item.attachments)}</td>`;

    // Updates icon click
    const updBtn = tr.querySelector('.updates-icon');
    if (updBtn) updBtn.addEventListener('click', (e) => { e.stopPropagation(); openUpdatesPanel(item.id, parentId); });

    // Subitem toggle
    const toggleBtn = tr.querySelector('.subitem-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); api('PUT', '/api/items/' + item.id, { subitems_collapsed: !item.subitemsCollapsed }).then(() => fetchBoard()); });

    // Add subitem button
    const addSubEl = tr.querySelector('.add-subitem-btn');
    if (addSubEl) addSubEl.addEventListener('click', (e) => { e.stopPropagation(); openNewSubitem(item.id); });

    // Inline editing: status
    const statusCell = tr.querySelector('.status-cell');
    if (statusCell && !statusCell.classList.contains('col-hidden')) {
        statusCell.addEventListener('click', (e) => { e.stopPropagation(); openStatusPicker(statusCell, item.id, parentId); });
    }

    // Inline editing: priority
    const priorityCell = tr.querySelector('.priority-cell');
    if (priorityCell && !priorityCell.classList.contains('col-hidden')) {
        priorityCell.addEventListener('click', (e) => { e.stopPropagation(); openPriorityPicker(priorityCell, item.id, parentId); });
    }

    // Inline editing: date
    const dateCell = tr.querySelector('.date-cell');
    if (dateCell && !dateCell.classList.contains('col-hidden')) {
        dateCell.addEventListener('click', (e) => { e.stopPropagation(); openDatePicker(dateCell, item.id, parentId); });
    }

    // Inline editing: files
    const filesCell = tr.querySelector('.files-cell');
    if (filesCell && !filesCell.classList.contains('col-hidden')) {
        filesCell.addEventListener('click', (e) => { e.stopPropagation(); openFilesPicker(filesCell, item.id, parentId); });
    }

    // Bulk select checkbox
    const rowCheckbox = tr.querySelector('.row-checkbox');
    if (rowCheckbox && !isSubitem) {
        rowCheckbox.checked = selectedItems.has(item.id);
        rowCheckbox.addEventListener('change', () => {
            if (rowCheckbox.checked) selectedItems.add(item.id);
            else selectedItems.delete(item.id);
            updateBulkBar();
        });
    }

    // Row click → edit modal
    tr.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        if (isSubitem) openEditSubitem(parentId, item.id);
        else openEditItem(item.id);
    });

    tbody.appendChild(tr);

    // Render subitems if expanded
    if (!isSubitem && hasSubitems && !item.subitemsCollapsed) {
        item.subitems.forEach(sub => renderItemRow(tbody, sub, group, colH, item.id));

        const addSubRow = document.createElement('tr');
        addSubRow.innerHTML = `<td colspan="8"><div class="add-subitem-row">+ Add subitem</div></td>`;
        addSubRow.querySelector('.add-subitem-row').addEventListener('click', () => openNewSubitem(item.id));
        tbody.appendChild(addSubRow);
    }
}

// ===== Render Helpers =====
function renderAvatars(personIds) {
    if (!personIds || personIds.length === 0) return '';
    const seen = new Set(); const unique = [];
    personIds.forEach(pid => { if (!seen.has(pid)) { seen.add(pid); unique.push(pid); } });
    return unique.map(pid => { const m = state.members.find(mm => mm.id === pid); if (!m) return ''; return `<span class="avatar" style="background:${m.color}" title="${esc(m.fullName)}">${esc(m.name)}</span>`; }).join('');
}

function renderStatusLabel(status) {
    if (!status) return '<span class="status-label empty"></span>';
    const cfg = STATUS_CONFIG[status]; if (!cfg) return '<span class="status-label empty"></span>';
    const cs = cfg.dark ? `background:${cfg.bg};color:var(--text);` : `background:${cfg.bg};`;
    return `<span class="status-label ${status}" style="${cs}">${cfg.label}</span>`;
}

function renderPriorityLabel(priority) {
    if (!priority) return '<span class="priority-label empty"></span>';
    const cfg = PRIORITY_CONFIG[priority]; if (!cfg) return '<span class="priority-label empty"></span>';
    return `<span class="priority-label ${priority}" style="background:${cfg.bg}">${cfg.label}</span>`;
}

function formatDate(dateStr) { if (!dateStr) return ''; const d = new Date(dateStr+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }

function renderFileIcons(attachments) {
    if (!attachments || attachments.length === 0) return '';
    return attachments.map(att => { let cls='generic'; const ext=att.name.split('.').pop().toLowerCase(); if(['pdf'].includes(ext))cls='pdf'; else if(['doc','docx'].includes(ext))cls='doc'; else if(['jpg','jpeg','png','gif','webp','svg'].includes(ext))cls='img'; return `<span class="file-icon ${cls}" title="${esc(att.name)}">${ext.toUpperCase().slice(0,3)}</span>`; }).join('');
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ===== Item Modal =====
function openNewItem(groupId) {
    modalTitle.textContent = 'New Item';
    itemForm.reset(); itemIdInput.value = ''; itemGroupIdInput.value = groupId;
    delete itemForm.dataset.parentItemId;
    pendingAttachments = []; originalAttachmentIds = []; renderAttachments(); renderPersonCheckboxes([]);
    deleteItemBtn.style.display = 'none';
    itemModal.classList.add('open'); itemTitleInput.focus();
}

function openEditItem(itemId) {
    const item = state.items.find(it => it.id === itemId); if (!item) return;
    modalTitle.textContent = 'Edit Item';
    itemIdInput.value = item.id; itemGroupIdInput.value = item.groupId;
    delete itemForm.dataset.parentItemId;
    itemTitleInput.value = item.title; itemStatusInput.value = item.status || '';
    itemPriorityInput.value = item.priority || ''; itemDateInput.value = item.date || '';
    pendingAttachments = item.attachments ? [...item.attachments] : [];
    originalAttachmentIds = item.attachments ? item.attachments.map(a => a.id) : [];
    renderAttachments(); renderPersonCheckboxes(item.persons || []);
    deleteItemBtn.style.display = ''; itemModal.classList.add('open'); itemTitleInput.focus();
}

function openNewSubitem(parentItemId) {
    const parent = state.items.find(it => it.id === parentItemId); if (!parent) return;
    modalTitle.textContent = 'New Subitem';
    itemForm.reset(); itemIdInput.value = ''; itemGroupIdInput.value = parent.groupId;
    itemForm.dataset.parentItemId = parentItemId;
    pendingAttachments = []; originalAttachmentIds = []; renderAttachments(); renderPersonCheckboxes([]);
    deleteItemBtn.style.display = 'none';
    itemModal.classList.add('open'); itemTitleInput.focus();
}

function openEditSubitem(parentId, subId) {
    const parent = state.items.find(it => it.id === parentId); if (!parent) return;
    const sub = parent.subitems.find(s => s.id === subId); if (!sub) return;
    modalTitle.textContent = 'Edit Subitem';
    itemIdInput.value = sub.id; itemGroupIdInput.value = parent.groupId;
    itemForm.dataset.parentItemId = parentId;
    itemTitleInput.value = sub.title; itemStatusInput.value = sub.status || '';
    itemPriorityInput.value = sub.priority || ''; itemDateInput.value = sub.date || '';
    pendingAttachments = sub.attachments ? [...sub.attachments] : [];
    originalAttachmentIds = sub.attachments ? sub.attachments.map(a => a.id) : [];
    renderAttachments(); renderPersonCheckboxes(sub.persons || []);
    deleteItemBtn.style.display = ''; itemModal.classList.add('open'); itemTitleInput.focus();
}

function renderPersonCheckboxes(selected) {
    personCheckboxes.innerHTML = '';
    state.members.forEach(m => {
        const el = document.createElement('div');
        el.className = 'person-check' + (selected.includes(m.id) ? ' selected' : '');
        el.innerHTML = `<span class="mini-avatar" style="background:${m.color}">${esc(m.name)}</span>${esc(m.fullName)}`;
        el.addEventListener('click', () => el.classList.toggle('selected'));
        personCheckboxes.appendChild(el);
    });
}

function getSelectedPersons() {
    return [...personCheckboxes.querySelectorAll('.person-check.selected')].map(el => {
        const name = el.querySelector('.mini-avatar').textContent;
        const m = state.members.find(mm => mm.name === name);
        return m ? m.id : null;
    }).filter(Boolean);
}

async function saveItem(e) {
    e.preventDefault();
    const id = itemIdInput.value;
    const parentItemId = itemForm.dataset.parentItemId;
    const data = { title:itemTitleInput.value.trim(), status:itemStatusInput.value, priority:itemPriorityInput.value, date:itemDateInput.value, persons:getSelectedPersons() };
    if (!data.title) return;

    try {
        let savedId = id;
        const isSubitem = !!parentItemId;
        const parentType = isSubitem ? 'subitem' : 'item';

        if (isSubitem) {
            if (id) { await api('PUT', '/api/subitems/' + id, data); }
            else { const res = await api('POST', '/api/items/' + parentItemId + '/subitems', data); savedId = res.id; }
        } else {
            data.groupId = itemGroupIdInput.value;
            if (id) { await api('PUT', '/api/items/' + id, data); }
            else { const res = await api('POST', '/api/items', data); savedId = res.id; }
        }

        // Sync attachments: delete removed
        for (const origId of originalAttachmentIds) {
            if (!pendingAttachments.find(a => a.id === origId)) {
                await api('DELETE', '/api/attachments/' + origId);
            }
        }
        // Upload new attachments
        for (const att of pendingAttachments) {
            if (att.data && !originalAttachmentIds.includes(att.id)) {
                await api('POST', '/api/attachments', { parentType, parentId: savedId, name: att.name, size: att.size, type: att.type, data: att.data });
            }
        }

        closeItemModal(); await fetchBoard();
    } catch (err) { alert(err.message); }
}

function deleteItem() {
    const id = itemIdInput.value;
    const parentItemId = itemForm.dataset.parentItemId;
    if (!id) return;
    showConfirm('Delete this item? This cannot be undone.', async () => {
        const url = parentItemId ? '/api/subitems/' + id : '/api/items/' + id;
        await api('DELETE', url);
        if (currentUpdatesItemId === id) closeUpdatesPanel();
        closeItemModal(); await fetchBoard();
    });
}

function closeItemModal() { itemModal.classList.remove('open'); pendingAttachments = []; delete itemForm.dataset.parentItemId; }

// ===== File Attachments =====
function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.size > 2*1024*1024) { alert(`"${file.name}" too large. Max 2MB.`); return; }
        const reader = new FileReader();
        reader.onload = () => { pendingAttachments.push({ id:genId(), name:file.name, size:file.size, type:file.type, data:reader.result }); renderAttachments(); };
        reader.readAsDataURL(file);
    });
}

function renderAttachments() {
    attachmentList.innerHTML = '';
    pendingAttachments.forEach((att, i) => {
        const el = document.createElement('div');
        el.className = 'attachment-item';
        el.innerHTML = `<span class="file-name" title="${esc(att.name)}">${esc(att.name)}</span><span class="file-size">${formatSize(att.size)}</span><button class="remove-att" title="Remove">&times;</button>`;
        el.querySelector('.file-name').addEventListener('click', () => { openFilePreview(att); });
        el.querySelector('.remove-att').addEventListener('click', () => { showConfirm('Are you sure you want to delete "' + att.name + '"?', () => { pendingAttachments.splice(i,1); renderAttachments(); }); });
        attachmentList.appendChild(el);
    });
}

function formatSize(b) { if(b<1024)return b+' B'; if(b<1024*1024)return(b/1024).toFixed(1)+' KB'; return(b/(1024*1024)).toFixed(1)+' MB'; }

// ===== Group Modal =====
function openNewGroup() {
    groupModalTitle.textContent = 'New Group'; groupForm.reset(); groupIdInput.value = '';
    deleteGroupBtn.style.display = 'none'; setActiveColor('#group-color-picker','#fdab3d');
    groupModal.classList.add('open'); groupNameInput.focus();
}

function openEditGroup(gid) {
    const g = state.groups.find(gg => gg.id === gid); if (!g) return;
    groupModalTitle.textContent = 'Edit Group'; groupIdInput.value = g.id;
    groupNameInput.value = g.name; setActiveColor('#group-color-picker', g.color);
    deleteGroupBtn.style.display = ''; groupModal.classList.add('open'); groupNameInput.focus();
}

async function saveGroup(e) {
    e.preventDefault();
    const id = groupIdInput.value; const name = groupNameInput.value.trim(); const color = getActiveColor('#group-color-picker');
    if (!name) return;
    try {
        if (id) { await api('PUT', '/api/groups/' + id, { name, color }); }
        else { await api('POST', '/api/groups', { name, color }); }
        closeGroupModal(); await fetchBoard();
    } catch (err) { alert(err.message); }
}

function deleteGroup() {
    const id = groupIdInput.value; if (!id) return;
    const g = state.groups.find(gg => gg.id === id);
    showConfirm(`Delete group "${g ? g.name : ''}" and all its items?`, async () => {
        await api('DELETE', '/api/groups/' + id);
        closeGroupModal(); await fetchBoard();
    });
}

function closeGroupModal() { groupModal.classList.remove('open'); }

// ===== Confirm Modal =====
function showConfirm(msg, cb) { confirmMessage.textContent = msg; confirmCallback = cb; confirmModal.classList.add('open'); }
function closeConfirm() { confirmModal.classList.remove('open'); confirmCallback = null; }

// ===== File Preview =====
let currentPreviewFile = null;

function openFilePreview(att) {
    currentPreviewFile = att;
    filePreviewTitle.textContent = att.name;
    filePreviewContent.innerHTML = '';

    const mimeType = att.type || '';
    const ext = att.name.split('.').pop().toLowerCase();
    const hasData = !!att.data;

    filePreviewDownload.disabled = !hasData;
    filePreviewDownload.style.opacity = hasData ? '1' : '0.5';

    if (!hasData) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:center;padding:40px 20px;';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:48px;margin-bottom:16px;';
        icon.textContent = ext === 'pdf' ? '\uD83D\uDCC4' : ext === 'doc' || ext === 'docx' ? '\uD83D\uDCC4' : ext === 'xls' || ext === 'xlsx' ? '\uD83D\uDCCA' : '\uD83D\uDCC1';
        const label = document.createElement('p');
        label.style.cssText = 'color:var(--text-muted);font-size:14px;margin:0;';
        label.textContent = 'File data is not available for preview or download.';
        const info = document.createElement('p');
        info.style.cssText = 'color:var(--text-muted);font-size:12px;margin-top:8px;';
        info.textContent = `${att.name} (${formatSize(att.size)})`;
        wrapper.appendChild(icon);
        wrapper.appendChild(label);
        wrapper.appendChild(info);
        filePreviewContent.appendChild(wrapper);
    } else if (mimeType.startsWith('image/') || ['png','jpg','jpeg','gif','svg','webp','bmp'].includes(ext)) {
        const img = document.createElement('img');
        img.src = att.data;
        img.style.cssText = 'max-width:100%;max-height:60vh;object-fit:contain;border-radius:4px;';
        filePreviewContent.appendChild(img);
    } else if (mimeType === 'application/pdf' || ext === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = att.data;
        iframe.style.cssText = 'width:100%;height:60vh;border:none;border-radius:4px;';
        filePreviewContent.appendChild(iframe);
    } else {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:center;padding:40px 20px;';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:48px;margin-bottom:16px;';
        icon.textContent = ext === 'doc' || ext === 'docx' ? '\uD83D\uDCC4' : ext === 'xls' || ext === 'xlsx' ? '\uD83D\uDCCA' : '\uD83D\uDCC1';
        const label = document.createElement('p');
        label.style.cssText = 'color:var(--text-muted);font-size:14px;margin:0;';
        label.textContent = 'Preview not available for this file type. Click Download to open.';
        const info = document.createElement('p');
        info.style.cssText = 'color:var(--text-muted);font-size:12px;margin-top:8px;';
        info.textContent = `${att.name} (${formatSize(att.size)})`;
        wrapper.appendChild(icon);
        wrapper.appendChild(label);
        wrapper.appendChild(info);
        filePreviewContent.appendChild(wrapper);
    }

    filePreviewModal.classList.add('open');
}

function closeFilePreview() {
    filePreviewModal.classList.remove('open');
    filePreviewContent.innerHTML = '';
    currentPreviewFile = null;
}

function downloadCurrentPreview() {
    if (!currentPreviewFile || !currentPreviewFile.data) return;
    const a = document.createElement('a');
    a.href = currentPreviewFile.data;
    a.download = currentPreviewFile.name;
    a.click();
}

// ===== Color Picker =====
function setActiveColor(sel, color) { $$(sel+' .color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color)); }
function getActiveColor(sel) { const a = $(sel+' .color-swatch.active'); return a ? a.dataset.color : '#fdab3d'; }

// ===== Event Listeners =====
async function init() {
    // Auth check — redirect to login if no token
    const token = localStorage.getItem('tuesday_token');
    if (!token) { window.location.href = '/login.html'; return; }
    try { currentUser = await api('GET', '/api/auth/me'); } catch (e) { window.location.href = '/login.html'; return; }

    initDropdownRefs();

    // ===== New item split button =====
    $('#new-item-btn').addEventListener('click', () => { const fg = state.groups[0]; if (fg) openNewItem(fg.id); });
    const newItemCaret = $('#new-item-caret');
    const newItemDropdown = $('#new-item-dropdown');
    newItemCaret.addEventListener('click', (e) => { e.stopPropagation(); newItemDropdown.classList.toggle('open'); });
    $('#new-item-option').addEventListener('click', () => { newItemDropdown.classList.remove('open'); const fg = state.groups[0]; if (fg) openNewItem(fg.id); });
    $('#new-group-option').addEventListener('click', () => { newItemDropdown.classList.remove('open'); openNewGroup(); });

    // Search
    $('#search-toggle-btn').addEventListener('click', () => { searchBox.style.display = searchBox.style.display === 'none' ? 'flex' : 'none'; if (searchBox.style.display === 'flex') searchInput.focus(); });
    $('#search-close-btn').addEventListener('click', () => { searchInput.value = ''; searchBox.style.display = 'none'; render(); });
    searchInput.addEventListener('input', () => render());

    // Toolbar dropdowns
    personFilterBtn.addEventListener('click', (e) => { e.stopPropagation(); populatePersonFilter(); positionDropdown(personFilterBtn, personDropdown); toggleDropdown('person'); });
    filterBtn.addEventListener('click', (e) => { e.stopPropagation(); populateStatusFilter(); populatePriorityFilter(); positionDropdown(filterBtn, filterDropdown); toggleDropdown('filter'); });
    sortBtn.addEventListener('click', (e) => { e.stopPropagation(); positionDropdown(sortBtn, sortDropdown); toggleDropdown('sort'); });
    hideBtn.addEventListener('click', (e) => { e.stopPropagation(); positionDropdown(hideBtn, hideDropdown); toggleDropdown('hide'); });
    groupbyBtn.addEventListener('click', (e) => { e.stopPropagation(); positionDropdown(groupbyBtn, groupbyDropdown); toggleDropdown('groupby'); });

    $('#person-clear').addEventListener('click', () => { filterPersons = []; populatePersonFilter(); updateBadges(); render(); });
    $('#filter-clear').addEventListener('click', () => { filterStatuses = []; filterPriorities = []; populateStatusFilter(); populatePriorityFilter(); updateBadges(); render(); });

    sortDropdown.querySelectorAll('input[name="sort"]').forEach(radio => { radio.addEventListener('change', () => { activeSort = radio.value; updateBadges(); render(); }); });
    hideDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.addEventListener('change', () => { const col = cb.dataset.col; if(cb.checked) hiddenCols = hiddenCols.filter(c=>c!==col); else if(!hiddenCols.includes(col)) hiddenCols.push(col); updateBadges(); render(); }); });
    groupbyDropdown.querySelectorAll('input[name="groupby"]').forEach(radio => { radio.addEventListener('change', () => { groupByMode = radio.value; updateBadges(); render(); }); });

    // Close all on outside click
    document.addEventListener('click', (e) => {
        let insideDropdown = false;
        dropdowns.forEach(d => { if (d.panel.contains(e.target) || d.btn.contains(e.target)) insideDropdown = true; });
        if (!insideDropdown) closeAllDropdowns();
        if (!$('#new-item-split').contains(e.target)) newItemDropdown.classList.remove('open');
        if (!inlinePopup.contains(e.target) && !e.target.closest('.status-cell') && !e.target.closest('.priority-cell') && !e.target.closest('.date-cell') && !e.target.closest('.files-cell')) closeInlinePopup();
    });

    // Item modal
    itemForm.addEventListener('submit', saveItem);
    $('#close-modal').addEventListener('click', closeItemModal);
    $('#cancel-modal').addEventListener('click', closeItemModal);
    deleteItemBtn.addEventListener('click', deleteItem);

    // File upload
    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value=''; });
    fileUploadArea.addEventListener('dragover', e => { e.preventDefault(); fileUploadArea.style.borderColor='var(--primary)'; });
    fileUploadArea.addEventListener('dragleave', () => { fileUploadArea.style.borderColor=''; });
    fileUploadArea.addEventListener('drop', e => { e.preventDefault(); fileUploadArea.style.borderColor=''; handleFiles(e.dataTransfer.files); });

    // Group modal
    $('#add-group-btn').addEventListener('click', openNewGroup);
    groupForm.addEventListener('submit', saveGroup);
    $('#close-group-modal').addEventListener('click', closeGroupModal);
    $('#cancel-group-modal').addEventListener('click', closeGroupModal);
    deleteGroupBtn.addEventListener('click', deleteGroup);

    // Updates panel
    $('#close-updates-panel').addEventListener('click', closeUpdatesPanel);
    $('#updates-send-btn').addEventListener('click', postUpdate);
    $('#updates-text').addEventListener('keydown', (e) => {
        handleMentionKeydown(e);
        if (!mentionActive && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postUpdate(); }
    });
    $('#updates-text').addEventListener('input', handleMentionInput);
    $('#updates-text').addEventListener('blur', () => { setTimeout(hideMentionDropdown, 150); });

    // Confirm
    confirmOk.addEventListener('click', () => { if(confirmCallback) confirmCallback(); closeConfirm(); });
    confirmCancel.addEventListener('click', closeConfirm);

    // File preview
    $('#close-file-preview').addEventListener('click', closeFilePreview);
    $('#file-preview-close-btn').addEventListener('click', closeFilePreview);
    filePreviewDownload.addEventListener('click', downloadCurrentPreview);
    filePreviewModal.addEventListener('click', (e) => { if (e.target === filePreviewModal) closeFilePreview(); });

    // Color pickers
    $$('.color-picker .color-swatch').forEach(sw => {
        sw.addEventListener('click', e => { e.preventDefault(); sw.closest('.color-picker').querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active')); sw.classList.add('active'); });
    });

    // Close modals on overlay click
    [itemModal, groupModal, confirmModal].forEach(m => {
        m.addEventListener('click', e => { if(e.target===m) m.classList.remove('open'); });
    });

    // Escape key (priority order)
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (inlinePopup.classList.contains('open')) { closeInlinePopup(); return; }
            if (updatesPanel.classList.contains('open')) { closeUpdatesPanel(); return; }
            [itemModal, groupModal, confirmModal].forEach(m => m.classList.remove('open'));
            closeAllDropdowns();
            newItemDropdown.classList.remove('open');
        }
    });

    // ===== Hash Routing =====
    function handleHash() {
        const hash = window.location.hash.replace('#', '') || 'home';
        currentPage = hash;
        if (state.members.length) render();
    }
    window.addEventListener('hashchange', handleHash);

    // ===== Change Password =====
    const passwordModal = $('#password-modal');
    const passwordForm = $('#password-form');
    const passwordError = $('#password-error');
    const passwordSuccess = $('#password-success');

    $('#change-password-btn').addEventListener('click', () => {
        passwordForm.reset();
        passwordError.style.display = 'none';
        passwordSuccess.style.display = 'none';
        passwordModal.classList.add('open');
        $('#current-password').focus();
    });

    $('#close-password-modal').addEventListener('click', () => passwordModal.classList.remove('open'));
    $('#cancel-password-modal').addEventListener('click', () => passwordModal.classList.remove('open'));
    passwordModal.addEventListener('click', (e) => { if (e.target === passwordModal) passwordModal.classList.remove('open'); });

    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        passwordError.style.display = 'none';
        passwordSuccess.style.display = 'none';

        const currentPassword = $('#current-password').value;
        const newPassword = $('#new-password').value;
        const confirmPassword = $('#confirm-new-password').value;

        if (newPassword !== confirmPassword) {
            passwordError.textContent = 'New passwords do not match';
            passwordError.style.display = 'block';
            return;
        }

        const btn = $('#save-password-btn');
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            await api('PUT', '/api/auth/change-password', { currentPassword, newPassword });
            passwordSuccess.textContent = 'Password changed successfully!';
            passwordSuccess.style.display = 'block';
            passwordForm.reset();
            setTimeout(() => passwordModal.classList.remove('open'), 1500);
        } catch (err) {
            passwordError.textContent = err.message;
            passwordError.style.display = 'block';
        } finally {
            btn.textContent = 'Change Password';
            btn.disabled = false;
        }
    });

    // ===== Logout =====
    $('#logout-btn').addEventListener('click', () => {
        localStorage.removeItem('tuesday_token');
        localStorage.removeItem('tuesday_user');
        window.location.href = '/login.html';
    });

    // ===== Notification Bell =====
    const notifBell = $('#notif-bell');
    const notifDropdown = $('#notif-dropdown');
    notifBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('open');
        if (notifDropdown.classList.contains('open')) renderNotifications();
    });
    document.addEventListener('click', (e) => {
        if (!notifDropdown.contains(e.target) && !notifBell.contains(e.target)) notifDropdown.classList.remove('open');
    });
    $('#notif-mark-all').addEventListener('click', async () => {
        await api('PUT', '/api/notifications/read-all');
        await renderNotifications();
        pollNotifications();
    });

    // ===== Bulk Actions =====
    $('#bulk-close').addEventListener('click', () => { selectedItems.clear(); updateBulkBar(); render(); });
    document.querySelectorAll('.bulk-btn').forEach(btn => {
        btn.addEventListener('click', () => executeBulkAction(btn.dataset.action));
    });

    // ===== Password visibility toggle =====
    document.addEventListener('click', e => {
        const toggleBtn = e.target.closest('.password-toggle');
        if (!toggleBtn) return;
        const wrapper = toggleBtn.closest('.password-wrapper');
        if (!wrapper) return;
        const input = wrapper.querySelector('input');
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggleBtn.innerHTML = isHidden
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });

    // ===== Admin / Members =====
    const mergeModal = $('#merge-modal');
    const mergeKeep = $('#merge-keep');
    const mergeRemove = $('#merge-remove');
    const mergeError = $('#merge-error');

    $('#close-merge-modal').addEventListener('click', () => mergeModal.classList.remove('open'));
    $('#cancel-merge-modal').addEventListener('click', () => mergeModal.classList.remove('open'));
    mergeModal.addEventListener('click', e => { if (e.target === mergeModal) mergeModal.classList.remove('open'); });

    $('#confirm-merge-btn').addEventListener('click', async () => {
        const keepId = mergeKeep.value;
        const removeId = mergeRemove.value;
        mergeError.style.display = 'none';
        if (!keepId || !removeId) { mergeError.textContent = 'Select both accounts'; mergeError.style.display = 'block'; return; }
        if (keepId === removeId) { mergeError.textContent = 'Cannot merge an account with itself'; mergeError.style.display = 'block'; return; }
        const removeOption = mergeRemove.querySelector(`option[value="${removeId}"]`);
        const removeName = removeOption ? removeOption.textContent : removeId;
        if (!confirm(`Are you sure you want to merge and remove "${removeName}"? This cannot be undone.`)) return;
        try {
            await api('POST', '/api/admin/merge-users', { keepId, removeId });
            mergeModal.classList.remove('open');
            await fetchBoard();
            renderAdmin();
        } catch (err) {
            mergeError.textContent = err.message;
            mergeError.style.display = 'block';
        }
    });

    // ===== Init: Fetch Board + Set Page =====
    // Set page from hash BEFORE fetchBoard to prevent page flicker (board→home flash)
    currentPage = window.location.hash.replace('#', '') || 'home';
    await fetchBoard();
    // Start notification polling
    pollNotifications();
    notifPollTimer = setInterval(pollNotifications, 30000);
    // Render the correct page
    render();
}

// ===== Admin Page Rendering =====
async function renderAdmin() {
    const container = $('#admin-users-list');
    if (!container) return;
    try {
        const users = await api('GET', '/api/admin/users');
        container.innerHTML = `
            <div class="admin-toolbar">
                <button class="btn-save" id="open-merge-btn" style="font-size:13px;padding:6px 16px;">Merge Accounts</button>
            </div>
            <table class="admin-table">
                <thead><tr>
                    <th></th><th>Name</th><th>Email</th><th>Items</th><th>Updates</th><th>Joined</th><th></th>
                </tr></thead>
                <tbody>
                ${users.map(u => {
                    const d = u.created_at ? new Date(u.created_at) : null;
                    const dateStr = d ? d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
                    return `<tr>
                        <td><span class="avatar" style="background:${u.color};width:30px;height:30px;font-size:11px;">${esc(u.initials)}</span></td>
                        <td><strong>${esc(u.name)}</strong></td>
                        <td>${esc(u.email)}</td>
                        <td>${u.assigned_items}</td>
                        <td>${u.updates_count}</td>
                        <td>${dateStr}</td>
                        <td><button class="admin-delete-btn" data-uid="${u.id}" data-uname="${esc(u.name)}" title="Delete user">&times;</button></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        `;

        // Open merge modal
        const openMergeBtn = $('#open-merge-btn');
        if (openMergeBtn) {
            openMergeBtn.addEventListener('click', () => {
                const mergeKeep = $('#merge-keep');
                const mergeRemove = $('#merge-remove');
                const mergeError = $('#merge-error');
                mergeError.style.display = 'none';
                const opts = users.map(u => `<option value="${u.id}">${esc(u.name)} (${esc(u.email)})</option>`).join('');
                mergeKeep.innerHTML = '<option value="">Select account to keep...</option>' + opts;
                mergeRemove.innerHTML = '<option value="">Select account to remove...</option>' + opts;
                const mergeModal = $('#merge-modal');
                mergeModal.classList.add('open');
            });
        }

        // Delete user buttons
        container.querySelectorAll('.admin-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const uname = btn.dataset.uname;
                if (!confirm(`Are you sure you want to delete "${uname}"? This cannot be undone.`)) return;
                try {
                    await api('DELETE', '/api/admin/users/' + uid);
                    await fetchBoard();
                    renderAdmin();
                } catch (err) { alert(err.message); }
            });
        });
    } catch (err) {
        container.innerHTML = `<p style="color:#dc2626;">Error loading users: ${esc(err.message)}</p>`;
    }
}

init();
})();

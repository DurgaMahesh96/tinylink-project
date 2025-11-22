// Advanced dashboard frontend logic (Dark Premium)
// NOTE: API_BASE points to backend root (no trailing /api) and fetch calls use /api/...
const API_BASE = "http://localhost:3000";

const $ = q => document.querySelector(q);
const targetInp = $("#target");
const codeInp = $("#code");
const createBtn = $("#createBtn");
const createMsg = $("#createMsg");
const tbody = $("#linksTbody");
const totalLinks = $("#totalLinks");
const totalClicks = $("#totalClicks");
const lastCreated = $("#lastCreated");
const refreshBtn = $("#refreshBtn");
const bulkRefresh = $("#bulkRefresh");
const searchInput = $("#searchInput");
const sortBy = $("#sortBy");
const openCode = $("#openCode");
const openBtn = $("#openBtn");
const backendStatus = $("#backendStatus");
const themeToggle = $("#themeToggle");
const navCreate = $("#navCreate");
const navStats = $("#navStats");
const createExample = $("#createExample");

let linksCache = [];
let page = 1;
let pageSize = parseInt($("#pageSize")?.value || 10);
let topChart = null;

// theme toggle (keeps simple dark)
themeToggle?.addEventListener('change', e => {
  if (e.target.checked) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
});

// small toast helper
function showToast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `px-4 py-2 rounded mb-2 ${type==='err' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`;
  el.innerText = msg;
  const container = document.createElement('div');
  container.className = 'toast fixed right-4 bottom-4 z-50';
  container.appendChild(el);
  document.body.appendChild(container);
  setTimeout(()=> container.remove(), 2200);
}

// skeleton loader
function showSkeleton(rows=6) {
  tbody.innerHTML = '';
  for (let i=0;i<rows;i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-3"><div class="h-4 w-24 skeleton rounded"></div></td>
      <td class="px-4 py-3"><div class="h-4 w-full skeleton rounded"></div></td>
      <td class="px-4 py-3 text-center"><div class="h-4 w-8 skeleton rounded mx-auto"></div></td>
      <td class="px-4 py-3"><div class="h-4 w-36 skeleton rounded"></div></td>
      <td class="px-4 py-3 text-center"><div class="h-4 w-24 skeleton rounded mx-auto"></div></td>
    `;
    tbody.appendChild(tr);
  }
}

// load links
async function loadLinks() {
  try {
    showSkeleton(6);
    const res = await fetch(`${API_BASE}/api/links`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    linksCache = Array.isArray(data) ? data : [];
    page = 1;
    renderTable(linksCache);
    updateCards(linksCache);
    renderChart(linksCache);
    backendStatus.innerText = 'online';
  } catch (e) {
    backendStatus.innerText = 'offline';
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Cannot reach backend. Make sure server is running.</td></tr>`;
  }
}

function getPaginated(list) {
  const start = (page-1) * pageSize;
  return list.slice(start, start + pageSize);
}

function updatePageInfo(total) {
  const info = $("#pageInfo");
  if (!info) return;
  const start = (page-1)*pageSize + 1;
  const end = Math.min(total, page*pageSize);
  info.innerText = total === 0 ? `0-0 of 0` : `${start}-${end} of ${total}`;
}

// render table
function renderTable(items) {
  const q = (searchInput?.value || '').toLowerCase().trim();
  let list = items.filter(it => {
    if (!q) return true;
    return (it.code && it.code.toLowerCase().includes(q)) || (it.target && it.target.toLowerCase().includes(q));
  });

  if (sortBy?.value === 'clicks_desc') list.sort((a,b) => (b.clicks||0) - (a.clicks||0));
  else list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (page > pages) page = pages;

  const pageItems = getPaginated(list);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No links found.</td></tr>`;
    updatePageInfo(total);
    return;
  }

  tbody.innerHTML = '';
  pageItems.forEach(l => {
    const last = l.last_clicked ? new Date(l.last_clicked).toLocaleString() : 'Never';
    const shortTarget = l.target.length > 100 ? l.target.slice(0,100) + '…' : l.target;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/2';
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium mono">${l.code}</td>
      <td class="px-4 py-3"><div class="truncate-2 text-slate-200 text-sm">${shortTarget}</div></td>
      <td class="px-4 py-3 text-center">${l.clicks ?? 0}</td>
      <td class="px-4 py-3 text-slate-300">${last}</td>
      <td class="px-4 py-3 text-center">
        <a class="inline-block px-3 py-1 text-sm rounded hover:underline" href="stats.html?code=${l.code}">Stats</a>
        <button class="ml-2 px-3 py-1 text-sm" style="background:#FF5C6C;color:white;border-radius:6px" data-code="${l.code}">Delete</button>
        <button class="ml-2 px-2 py-1 text-sm border rounded" data-copy="${l.code}">Copy</button>
        <button class="ml-2 px-2 py-1 text-sm border rounded" data-qr="${l.code}">QR</button>
      </td>
    `;
    tbody.appendChild(tr);

    // delete
    tr.querySelector('button[data-code]')?.addEventListener('click', async ev => {
      const code = ev.currentTarget.dataset.code;
      if (!confirm(`Delete ${code}?`)) return;
      const d = await fetch(`${API_BASE}/api/links/${code}`, { method: 'DELETE' });
      if (d.ok) { showToast('Deleted'); loadLinks(); } else showToast('Delete failed', 'err');
    });

    // copy
    tr.querySelector('button[data-copy]')?.addEventListener('click', async ev => {
      const code = ev.currentTarget.dataset.copy;
      const short = `${window.location.origin.replace(window.location.pathname, '')}/${code}`;
      await navigator.clipboard.writeText(short).catch(()=>{});
      showToast('Copied: ' + short);
    });

    // QR
    tr.querySelector('button[data-qr]')?.addEventListener('click', ev => {
      const code = ev.currentTarget.dataset.qr;
      const short = `${window.location.origin.replace(window.location.pathname, '')}/${code}`;
      $("#qrModal").classList.remove('hidden');
      new QRious({ element: $("#qrCanvas"), value: short, size: 200 });
    });
  });

  updatePageInfo(total);
}

// create link
createBtn?.addEventListener('click', async () => {
  const target = targetInp.value.trim();
  const code = codeInp.value.trim();

  if (!target) { showToast('Enter target URL','err'); return; }
  createBtn.disabled = true;
  createBtn.innerText = 'Creating...';
  try {
    const res = await fetch(`${API_BASE}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, code: code || undefined })
    });
    const data = await res.json();
    if (!res.ok) showToast(data.error || 'Create failed','err');
    else { showToast('Created: ' + data.code); targetInp.value=''; codeInp.value=''; loadLinks(); }
  } catch (e) {
    showToast('Network error','err');
  } finally {
    createBtn.disabled = false;
    createBtn.innerText = 'Create';
  }
});

// example
createExample?.addEventListener('click', () => {
  targetInp.value = 'https://example.com/some/very/long/path';
  codeInp.value = '';
  targetInp.focus();
});

// cards
function updateCards(list) {
  totalLinks.innerText = list.length;
  totalClicks.innerText = list.reduce((s,it)=>s+(it.clicks||0),0);
  const mostRecent = [...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  lastCreated.innerText = mostRecent ? new Date(mostRecent.created_at).toLocaleString() : '—';
}

// chart
function renderChart(list) {
  const sorted = [...list].sort((a,b)=> (b.clicks||0)-(a.clicks||0)).slice(0,5);
  const labels = sorted.map(i=>i.code);
  const values = sorted.map(i=>i.clicks||0);
  const ctx = document.getElementById('topChart').getContext('2d');
  if (topChart) topChart.destroy();
  topChart = new Chart(ctx, {
    type: 'bar',
    data:{ labels, datasets:[{ label:'Clicks', data:values, backgroundColor:'rgba(57,162,255,0.9)', borderColor:'rgba(57,162,255,1)', borderWidth:1 }]},
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{ ticks:{ color:getComputedStyle(document.body).color }}, y:{ beginAtZero:true, ticks:{ color:getComputedStyle(document.body).color }}}}
  });
}

// open redirect
openBtn?.addEventListener('click', () => {
  const code = openCode.value.trim();
  if (!code) { showToast('Enter code','err'); return; }
  window.open(`${API_BASE}/${encodeURIComponent(code)}`, '_blank');
});

// pagination
$("#prevPage")?.addEventListener('click', ()=>{ if (page>1) { page--; renderTable(linksCache); }});
$("#nextPage")?.addEventListener('click', ()=>{ const pages = Math.max(1, Math.ceil(linksCache.length / pageSize)); if (page < pages) { page++; renderTable(linksCache); }});
$("#pageSize")?.addEventListener('change', e => { pageSize = parseInt(e.target.value); page = 1; renderTable(linksCache); });

// refresh/search/sort
refreshBtn?.addEventListener('click', loadLinks);
bulkRefresh?.addEventListener('click', loadLinks);
searchInput?.addEventListener('input', ()=> renderTable(linksCache));
sortBy?.addEventListener('change', ()=> renderTable(linksCache));

// nav
navCreate?.addEventListener('click', ()=>{ targetInp.focus(); window.scrollTo({top:0,behavior:'smooth'}); });
navStats?.addEventListener('click', ()=>{ const code = prompt('Enter code to view stats:'); if (code) location.href = `stats.html?code=${encodeURIComponent(code)}`; });

// close QR
$("#closeQr")?.addEventListener('click', ()=> $("#qrModal")?.classList.add('hidden'));

// initial
loadLinks();


let flipbook = null;
let currentManifest = null;
let publicConfig = null;
let adminAuthed = false;

async function api(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data?.detail || 'Request failed');
  return data;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function setAdminMsg(msg, err = false) {
  const el = document.getElementById('adminMsg');
  el.textContent = msg;
  el.style.color = err ? '#ffd5d9' : '';
}

function setViewerMsg(msg, err = false) {
  const el = document.getElementById('viewerMsg');
  el.textContent = msg;
  el.style.color = err ? '#ffd5d9' : '';
}

function setAdminLoginMsg(msg, err = false) {
  const el = document.getElementById('adminLoginMsg');
  el.textContent = msg;
  el.style.color = err ? '#ffd5d9' : '';
}

function updatePageLabel() {
  const label = document.getElementById('pageLabel');
  if (!flipbook) {
    label.textContent = 'Page 0 / 0';
    return;
  }
  label.textContent = `Page ${flipbook.getCurrentPageIndex() + 1} / ${flipbook.getPageCount()}`;
}

async function loadPublicConfig() {
  publicConfig = await api('/api/public-config');
  setText('albumTitle', publicConfig.title || 'Album Flipbook');
  setText('albumSubtitle', publicConfig.subtitle || '');
  document.getElementById('lockViewerBtn').classList.toggle('hidden', !publicConfig.viewerProtected);
  const overlay = document.getElementById('viewerLoginOverlay');
  if (publicConfig.viewerProtected) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

async function loadManifest() {
  try {
    currentManifest = await api('/api/manifest');
    document.getElementById('viewerLoginOverlay').classList.add('hidden');
    renderBook();
  } catch (err) {
    if ((err.message || '').toLowerCase().includes('viewer password')) {
      document.getElementById('status').textContent = 'Viewer password required.';
      document.getElementById('status').classList.remove('hidden');
      document.getElementById('bookWrap').classList.add('hidden');
      document.getElementById('viewerLoginOverlay').classList.remove('hidden');
      return;
    }
    throw err;
  }
}

function renderBook() {
  const status = document.getElementById('status');
  const wrap = document.getElementById('bookWrap');
  const container = document.getElementById('flipbook');
  container.innerHTML = '';

  if (!currentManifest?.pageUrls?.length) {
    status.textContent = 'No pages yet. Use the admin panel to upload a PDF or images.';
    status.classList.remove('hidden');
    wrap.classList.add('hidden');
    updatePageLabel();
    return;
  }

  flipbook = new St.PageFlip(container, {
    width: 700,
    height: 1000,
    size: 'stretch',
    minWidth: 280,
    maxWidth: 1400,
    minHeight: 400,
    maxHeight: 1000,
    showCover: currentManifest.showCover !== false,
    drawShadow: true,
    flippingTime: 900,
    usePortrait: true,
    maxShadowOpacity: 0.28,
    mobileScrollSupport: false,
    swipeDistance: 24,
    clickEventForward: true,
    useMouseEvents: true,
    autoSize: true,
  });
  flipbook.on('init', updatePageLabel);
  flipbook.on('flip', updatePageLabel);
  flipbook.loadFromImages(currentManifest.pageUrls);
  status.classList.add('hidden');
  wrap.classList.remove('hidden');
  updatePageLabel();

  const meta = document.getElementById('metaForm');
  meta.title.value = currentManifest.title || '';
  meta.subtitle.value = currentManifest.subtitle || '';
  meta.showCover.checked = currentManifest.showCover !== false;
  setText('albumTitle', currentManifest.title || 'Album Flipbook');
  setText('albumSubtitle', currentManifest.subtitle || '');
}

async function refreshAll() {
  await loadPublicConfig();
  if (!publicConfig.viewerProtected) {
    await loadManifest();
    return;
  }
  try {
    await loadManifest();
  } catch (_) {}
}

async function openAdminPanel() {
  const status = await api('/api/admin/status');
  adminAuthed = !!status.authenticated;
  if (adminAuthed) {
    document.getElementById('adminPanel').classList.toggle('hidden');
    await loadSecurityForm();
  } else {
    document.getElementById('adminLoginOverlay').classList.remove('hidden');
  }
}

async function loadSecurityForm() {
  const sec = await api('/api/admin/security');
  const form = document.getElementById('securityForm');
  form.viewerProtected.checked = !!sec.viewerProtected;
}

async function handleViewerLogin(e) {
  e.preventDefault();
  try {
    const fd = new FormData(e.currentTarget);
    await api('/api/viewer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: fd.get('password') || '' }),
    });
    e.currentTarget.reset();
    setViewerMsg('');
    await loadManifest();
  } catch (err) {
    setViewerMsg(err.message, true);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  try {
    const fd = new FormData(e.currentTarget);
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: fd.get('password') || '' }),
    });
    adminAuthed = true;
    e.currentTarget.reset();
    setAdminLoginMsg('');
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    await loadSecurityForm();
  } catch (err) {
    setAdminLoginMsg(err.message, true);
  }
}

async function handleSecuritySave(e) {
  e.preventDefault();
  try {
    const fd = new FormData(e.currentTarget);
    const payload = {
      viewerProtected: fd.get('viewerProtected') === 'on',
      viewerPassword: fd.get('viewerPassword') || '',
      adminPassword: fd.get('adminPassword') || '',
    };
    const result = await api('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    e.currentTarget.reset();
    await loadSecurityForm();
    await refreshAll();
    setAdminMsg(result.adminPasswordChanged ? 'Security updated. Admin password changed.' : 'Security updated.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function handleMetaSave(e) {
  e.preventDefault();
  try {
    const fd = new FormData(e.currentTarget);
    await api('/api/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fd.get('title') || 'Album Flipbook',
        subtitle: fd.get('subtitle') || '',
        showCover: fd.get('showCover') === 'on',
      }),
    });
    await refreshAll();
    setAdminMsg('Album text updated.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function handleUpload(e, url) {
  e.preventDefault();
  try {
    setAdminMsg('Uploading…');
    const fd = new FormData(e.currentTarget);
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Upload failed');
    e.currentTarget.reset();
    await refreshAll();
    setAdminMsg('Upload complete.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function clearAlbum() {
  try {
    await api('/api/clear', { method: 'POST' });
    await refreshAll();
    setAdminMsg('Album cleared.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function logoutAdmin() {
  await api('/api/admin/logout', { method: 'POST' });
  adminAuthed = false;
  document.getElementById('adminPanel').classList.add('hidden');
  setAdminMsg('');
}

async function lockViewer() {
  await api('/api/viewer/logout', { method: 'POST' });
  await refreshAll();
}

function bindUi() {
  document.getElementById('prevBtn').addEventListener('click', () => flipbook && flipbook.flipPrev('top'));
  document.getElementById('nextBtn').addEventListener('click', () => flipbook && flipbook.flipNext('top'));
  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  });
  document.getElementById('lockViewerBtn').addEventListener('click', lockViewer);
  document.getElementById('adminToggleBtn').addEventListener('click', openAdminPanel);
  document.getElementById('viewerLoginForm').addEventListener('submit', handleViewerLogin);
  document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
  document.getElementById('cancelAdminLoginBtn').addEventListener('click', () => document.getElementById('adminLoginOverlay').classList.add('hidden'));
  document.getElementById('securityForm').addEventListener('submit', handleSecuritySave);
  document.getElementById('metaForm').addEventListener('submit', handleMetaSave);
  document.getElementById('pdfForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/pdf'));
  document.getElementById('imagesForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/images'));
  document.getElementById('clearBtn').addEventListener('click', clearAlbum);
  document.getElementById('logoutAdminBtn').addEventListener('click', logoutAdmin);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') flipbook && flipbook.flipPrev('top');
    if (e.key === 'ArrowRight') flipbook && flipbook.flipNext('top');
  });
}

bindUi();
refreshAll().catch((err) => setAdminMsg(err.message, true));

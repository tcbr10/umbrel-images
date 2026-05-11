
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
  el.style.color = err ? '#ffb3b8' : '';
}

function setViewerMsg(msg, err = false) {
  const el = document.getElementById('viewerMsg');
  el.textContent = msg;
  el.style.color = err ? '#ffb3b8' : '';
}

function updatePageLabel() {
  const label = document.getElementById('pageLabel');
  if (!flipbook) {
    label.textContent = 'Page 0 / 0';
    return;
  }
  label.textContent = `Page ${flipbook.getCurrentPageIndex() + 1} / ${flipbook.getPageCount()}`;
}

// Admin Panel Toggle & Routing
async function handleRoute() {
  const hash = window.location.hash;
  if (hash === '#admin') {
    const status = await api('/api/admin/status');
    adminAuthed = !!status.authenticated;
    if (adminAuthed) {
      document.getElementById('adminPanel').classList.remove('hidden');
      document.getElementById('mainLayout').classList.add('has-admin');
      await loadSecurityForm();
    } else {
      document.getElementById('adminLoginOverlay').classList.remove('hidden');
    }
  } else {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('mainLayout').classList.remove('has-admin');
    document.getElementById('adminLoginOverlay').classList.add('hidden');
  }
}

function closeAdmin() {
  window.location.hash = '';
}

function setDims(w, h) {
  const form = document.getElementById('metaForm');
  form.pageWidth.value = w;
  form.pageHeight.value = h;
}

async function loadPublicConfig() {
  publicConfig = await api('/api/public-config');
  setText('albumTitle', publicConfig.title || 'Album Flipbook');
  setText('albumSubtitle', publicConfig.subtitle || '');

  const overlay = document.getElementById('viewerLoginOverlay');
  if (publicConfig.viewerProtected) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
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
    status.textContent = 'No pages yet. Log in to admin panel to upload.';
    status.classList.remove('hidden');
    wrap.classList.add('hidden');
    updatePageLabel();
    return;
  }

  // Dynamic dimensions based on admin config
  const pWidth = currentManifest.pageWidth || 700;
  const pHeight = currentManifest.pageHeight || 1000;

  flipbook = new St.PageFlip(container, {
    width: pWidth,
    height: pHeight,
    size: 'stretch',
    minWidth: 280,
    maxWidth: pWidth * 2,
    minHeight: 400,
    maxHeight: pHeight * 2,
    showCover: currentManifest.showCover !== false,
    drawShadow: true,
    flippingTime: 900,
    usePortrait: true,
    maxShadowOpacity: 0.25,
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

  // Populate admin forms with current values
  const meta = document.getElementById('metaForm');
  meta.title.value = currentManifest.title || '';
  meta.subtitle.value = currentManifest.subtitle || '';
  meta.pageWidth.value = pWidth;
  meta.pageHeight.value = pHeight;
  meta.showCover.checked = currentManifest.showCover !== false;

  setText('albumTitle', currentManifest.title || 'Album Flipbook');
  setText('albumSubtitle', currentManifest.subtitle || '');
}

async function refreshAll() {
  await loadPublicConfig();
  if (!publicConfig.viewerProtected) {
    await loadManifest();
  } else {
    try { await loadManifest(); } catch (_) {}
  }
}

async function loadSecurityForm() {
  const sec = await api('/api/admin/security');
  const form = document.getElementById('securityForm');
  form.viewerProtected.checked = !!sec.viewerProtected;
}

// Event Handlers
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
    document.getElementById('adminLoginMsg').textContent = '';

    // Reroute to open panel
    handleRoute();
  } catch (err) {
    document.getElementById('adminLoginMsg').textContent = err.message;
    document.getElementById('adminLoginMsg').style.color = '#ffb3b8';
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
        pageWidth: parseInt(fd.get('pageWidth')) || 700,
        pageHeight: parseInt(fd.get('pageHeight')) || 1000
      }),
    });
    await refreshAll();
    setAdminMsg('Settings updated. Layout recalculated.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function handleUpload(e, url) {
  e.preventDefault();
  try {
    setAdminMsg('Uploading... Please wait.');
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
  closeAdmin();
}

function bindUi() {
  // Navigation & View
  document.getElementById('prevBtn').addEventListener('click', () => flipbook && flipbook.flipPrev('top'));
  document.getElementById('nextBtn').addEventListener('click', () => flipbook && flipbook.flipNext('top'));
  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  });

  // Hash routing
  window.addEventListener('hashchange', handleRoute);
  document.getElementById('closeAdminBtn').addEventListener('click', closeAdmin);
  document.getElementById('cancelAdminLoginBtn').addEventListener('click', closeAdmin);

  // Forms
  document.getElementById('viewerLoginForm').addEventListener('submit', handleViewerLogin);
  document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
  document.getElementById('securityForm').addEventListener('submit', handleSecuritySave);
  document.getElementById('metaForm').addEventListener('submit', handleMetaSave);
  document.getElementById('pdfForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/pdf'));
  document.getElementById('imagesForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/images'));
  document.getElementById('clearBtn').addEventListener('click', clearAlbum);
  document.getElementById('logoutAdminBtn').addEventListener('click', logoutAdmin);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') flipbook && flipbook.flipPrev('top');
    if (e.key === 'ArrowRight') flipbook && flipbook.flipNext('top');
  });
}

// Global expose for preset buttons
window.setDims = setDims;

bindUi();
handleRoute();
refreshAll().catch((err) => console.error(err));

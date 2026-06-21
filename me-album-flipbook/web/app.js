let flipbook = null;
let currentManifest = null;
let publicConfig = null;
let adminAuthed = false;

async function api(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) { }
  if (!res.ok) throw new Error(data?.detail || 'Request failed');
  return data;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function setAdminMsg(msg, err = false) {
  const el = document.getElementById('adminMsg');
  if (el) {
    el.textContent = msg;
    el.style.color = err ? '#ffb3b8' : '';
  }
}

function setViewerMsg(msg, err = false) {
  const el = document.getElementById('viewerMsg');
  if (el) {
    el.textContent = msg;
    el.style.color = err ? '#ffb3b8' : '';
  }
}

function updatePageLabel() {
  const label = document.getElementById('pageLabel');
  if (!flipbook || !label) {
    if (label) label.textContent = 'Page 0 / 0';
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
  if (form) {
    form.pageWidth.value = w;
    form.pageHeight.value = h;
  }
}

async function loadPublicConfig() {
  publicConfig = await api('/api/public-config');
  setText('albumTitle', publicConfig.title || 'Album Flipbook');
  setText('albumSubtitle', publicConfig.subtitle || '');

  const overlay = document.getElementById('viewerLoginOverlay');
  if (overlay) {
    if (publicConfig.viewerProtected) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }
}

async function loadManifest() {
  try {
    currentManifest = await api('/api/manifest');
    const viewerLoginOverlay = document.getElementById('viewerLoginOverlay');
    if (viewerLoginOverlay) viewerLoginOverlay.classList.add('hidden');
    renderBook();
  } catch (err) {
    if ((err.message || '').toLowerCase().includes('viewer password')) {
      const statusEl = document.getElementById('status');
      const bookWrapEl = document.getElementById('bookWrap');
      const viewerLoginOverlay = document.getElementById('viewerLoginOverlay');

      if (statusEl) {
        statusEl.textContent = 'Viewer password required.';
        statusEl.classList.remove('hidden');
      }
      if (bookWrapEl) bookWrapEl.classList.add('hidden');
      if (viewerLoginOverlay) viewerLoginOverlay.classList.remove('hidden');
      return;
    }
    throw err;
  }
}

function renderBook() {
  const status = document.getElementById('status');
  const wrap = document.getElementById('bookWrap');
  const container = document.getElementById('flipbook');
  if (!container) return;
  container.innerHTML = '';

  if (!currentManifest?.pageUrls?.length) {
    if (status) {
      status.textContent = 'No pages yet. Log in to admin panel to upload.';
      status.classList.remove('hidden');
    }
    if (wrap) wrap.classList.add('hidden');
    updatePageLabel();
    return;
  }

  // Dynamic dimensions based on admin config
  const pWidth = currentManifest.pageWidth || 700;
  const pHeight = currentManifest.pageHeight || 1000;

  // 1. קריאת הגדרת RTL מהאחסון המקומי
  const isRtl = localStorage.getItem('isRtl') === 'true';

  // 2. הגדרת כיוון המכולה והכפתורים בהתאם
  if (isRtl) {
    container.style.direction = 'rtl';
    document.getElementById('btnPrev').innerHTML = '&#8594;';
    document.getElementById('btnNext').innerHTML = '&#8592;';
  } else {
    container.style.direction = 'ltr';
    document.getElementById('btnPrev').innerHTML = '&#8592;';
    document.getElementById('btnNext').innerHTML = '&#8594;';
  }

  // 3. יצירת ה-flipbook
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

  let finalUrls = [...currentManifest.pageUrls];
  if (isRtl && finalUrls.length > 0) {
    finalUrls.reverse();
  }

  flipbook.loadFromImages(finalUrls);

  // 5. קפיצה לעמוד האחרון (העטיפה הקדמית ב-RTL)
  if (isRtl) {
    setTimeout(() => {
      if (flipbook) flipbook.turnToPage(flipbook.getPageCount() - 1);
    }, 500);
  }

  if (status) status.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');
  updatePageLabel();

  // Populate admin forms with current values
  const meta = document.getElementById('metaForm');
  if (meta) {
    meta.title.value = currentManifest.title || '';
    meta.subtitle.value = currentManifest.subtitle || '';
    meta.pageWidth.value = pWidth;
    meta.pageHeight.value = pHeight;
    meta.showCover.checked = currentManifest.showCover !== false;
  }
  
  setText('albumTitle', currentManifest.title || 'Album Flipbook');
  setText('albumSubtitle', currentManifest.subtitle || '');

  // הטיפול ב-Checkbox של הלקוח
  const rtlToggle = document.getElementById('localRtlToggle');
  if (rtlToggle) {
    rtlToggle.checked = isRtl;
    // מסירים מאזינים קודמים כדי שלא ייווצר כפל בעת רענון
    const newToggle = rtlToggle.cloneNode(true);
    rtlToggle.parentNode.replaceChild(newToggle, rtlToggle);
    
    newToggle.addEventListener('change', (e) => {
      localStorage.setItem('isRtl', e.target.checked ? 'true' : 'false');
      renderBook(); // רענון מיידי של הספר
    });
  }
}
// *** כאן הייתה חסרה סגירת הסוגריים המסולסלים של פונקציית renderBook בסקריפט שלך! ***

async function refreshAll() {
  await loadPublicConfig();
  if (!publicConfig.viewerProtected) {
    await loadManifest();
  } else {
    try { await loadManifest(); } catch (_) { }
  }
}

async function loadSecurityForm() {
  const sec = await api('/api/admin/security');
  const form = document.getElementById('securityForm');
  if (form) form.viewerProtected.checked = !!sec.viewerProtected;
}

// Event Handlers
async function handleViewerLogin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const fd = new FormData(form);
    await api('/api/viewer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: fd.get('password') || '' }),
    });
    form.reset();
    setViewerMsg('');
    await loadManifest();
  } catch (err) {
    setViewerMsg(err.message, true);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const fd = new FormData(form);
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: fd.get('password') || '' }),
    });
    adminAuthed = true;
    form.reset();
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
  const form = e.target;
  try {
    const fd = new FormData(form);
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
    form.reset();
    await loadSecurityForm();
    await refreshAll();
    setAdminMsg(result.adminPasswordChanged ? 'Security updated. Admin password changed.' : 'Security updated.');
  } catch (err) {
    setAdminMsg(err.message, true);
  }
}

async function handleMetaSave(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const fd = new FormData(form);
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
  const form = e.target;
  try {
    setAdminMsg('Uploading... Please wait.');
    const fd = new FormData(form);
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Upload failed');
    form.reset();
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
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (!flipbook) return;
      const isRtl = localStorage.getItem('isRtl') === 'true';
      isRtl ? flipbook.flipNext('top') : flipbook.flipPrev('top');
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!flipbook) return;
      const isRtl = localStorage.getItem('isRtl') === 'true';
      isRtl ? flipbook.flipPrev('top') : flipbook.flipNext('top');
    });
  }

  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', async () => {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    });
  }

  // Hash routing
  window.addEventListener('hashchange', handleRoute);

  const closeBtn = document.getElementById('closeAdminBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeAdmin);

  const cancelLoginBtn = document.getElementById('cancelAdminLoginBtn');
  if (cancelLoginBtn) cancelLoginBtn.addEventListener('click', closeAdmin);

  // Forms
  const viewerForm = document.getElementById('viewerLoginForm');
  if (viewerForm) viewerForm.addEventListener('submit', handleViewerLogin);

  const adminForm = document.getElementById('adminLoginForm');
  if (adminForm) adminForm.addEventListener('submit', handleAdminLogin);

  const secForm = document.getElementById('securityForm');
  if (secForm) secForm.addEventListener('submit', handleSecuritySave);

  const mForm = document.getElementById('metaForm');
  if (mForm) mForm.addEventListener('submit', handleMetaSave);

  const pForm = document.getElementById('pdfForm');
  if (pForm) pForm.addEventListener('submit', (e) => handleUpload(e, '/api/upload/pdf'));

  const iForm = document.getElementById('imagesForm');
  if (iForm) iForm.addEventListener('submit', (e) => handleUpload(e, '/api/upload/images'));

  const cBtn = document.getElementById('clearBtn');
  if (cBtn) cBtn.addEventListener('click', clearAlbum);

  const logBtn = document.getElementById('logoutAdminBtn');
  if (logBtn) logBtn.addEventListener('click', logoutAdmin);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const isRtl = localStorage.getItem('isRtl') === 'true';

    if (e.key === 'ArrowLeft') {
      if (flipbook) isRtl ? flipbook.flipNext('top') : flipbook.flipPrev('top');
    }
    if (e.key === 'ArrowRight') {
      if (flipbook) isRtl ? flipbook.flipPrev('top') : flipbook.flipNext('top');
    }
  });
}

// Global expose for preset buttons
window.setDims = setDims;

bindUi();
handleRoute();
refreshAll().catch((err) => console.error(err));

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

function updatePageLabel(pageNumber) {
  const label = document.getElementById('pageLabel');
  const $book = $('#flipbook');
  if (!$book.turn('is')) {
    label.textContent = 'Page 0 / 0';
    return;
  }
  const current = pageNumber || $book.turn('page');
  const total = $book.turn('pages');
  label.textContent = `Page ${current} / ${total}`;
}

async function handleRoute() {
  const hash = window.location.hash;
  if (hash === '#admin') {
    const status = await api('/api/admin/status');
    adminAuthed = !!status.authenticated;
    if (adminAuthed) {
      document.getElementById('adminPanel').classList.remove('hidden');
      document.getElementById('mainLayout').classList.add('has-admin');
      await loadSecurityForm();
      setTimeout(resizeBook, 300); // trigger resize when panel opens
    } else {
      document.getElementById('adminLoginOverlay').classList.remove('hidden');
    }
  } else {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('mainLayout').classList.remove('has-admin');
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    setTimeout(resizeBook, 300);
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

function resizeBook() {
  const wrap = document.getElementById('bookWrap');
  const book = document.getElementById('flipbook');
  const $book = $(book);

  if (!wrap || !$book.turn('is') || !currentManifest) return;

  const pWidth = currentManifest.pageWidth || 700;
  const pHeight = currentManifest.pageHeight || 1000;
  const isMobile = window.innerWidth < 768;
  const bookTotalWidth = isMobile ? pWidth : pWidth * 2;

  const scaleW = wrap.clientWidth / bookTotalWidth;
  const scaleH = wrap.clientHeight / pHeight;
  let scale = Math.min(scaleW, scaleH) * 0.95;
  if (scale > 1) scale = 1;

  book.style.transform = `scale(${scale})`;
  book.style.transformOrigin = 'center center';
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
  const $book = $('#flipbook');

  if (!currentManifest?.pageUrls?.length) {
    status.textContent = 'No pages yet. Log in to admin panel to upload.';
    status.classList.remove('hidden');
    wrap.classList.add('hidden');
    updatePageLabel();
    return;
  }

  status.classList.add('hidden');
  wrap.classList.remove('hidden');

  const pWidth = currentManifest.pageWidth || 700;
  const pHeight = currentManifest.pageHeight || 1000;
  const isMobile = window.innerWidth < 768;

  if ($book.turn('is')) {
    $book.turn('destroy');
  }
  $book.html('');
  $book.css('transform', 'none');

  currentManifest.pageUrls.forEach(url => {
    const div = $('<div />').css({
      'background-image': `url(${url})`,
      'background-size': '100% 100%',
      'background-color': '#fff'
    });
    $book.append(div);
  });

  $book.turn({
    width: isMobile ? pWidth : pWidth * 2,
    height: pHeight,
    display: isMobile ? 'single' : 'double',
    autoCenter: true,
    gradients: true,
    elevation: 50,
    when: {
      turning: function(event, page, view) {
        updatePageLabel(page);
      }
    }
  });

  updatePageLabel();
  resizeBook();

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
  document.getElementById('prevBtn').addEventListener('click', () => $('#flipbook').turn('is') && $('#flipbook').turn('previous'));
  document.getElementById('nextBtn').addEventListener('click', () => $('#flipbook').turn('is') && $('#flipbook').turn('next'));
  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  });

  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('resize', resizeBook);

  document.getElementById('closeAdminBtn').addEventListener('click', closeAdmin);
  document.getElementById('cancelAdminLoginBtn').addEventListener('click', closeAdmin);

  document.getElementById('viewerLoginForm').addEventListener('submit', handleViewerLogin);
  document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
  document.getElementById('securityForm').addEventListener('submit', handleSecuritySave);
  document.getElementById('metaForm').addEventListener('submit', handleMetaSave);
  document.getElementById('pdfForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/pdf'));
  document.getElementById('imagesForm').addEventListener('submit', (e) => handleUpload(e, '/api/upload/images'));
  document.getElementById('clearBtn').addEventListener('click', clearAlbum);
  document.getElementById('logoutAdminBtn').addEventListener('click', logoutAdmin);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') $('#flipbook').turn('is') && $('#flipbook').turn('previous');
    if (e.key === 'ArrowRight') $('#flipbook').turn('is') && $('#flipbook').turn('next');
  });
}

window.setDims = setDims;
bindUi();
handleRoute();
refreshAll().catch((err) => console.error(err));

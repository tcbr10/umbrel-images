from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from typing import List, Optional
from PIL import Image, ImageDraw, ImageFont
import fitz
import base64
import hashlib
import hmac
import io
import json
import re
import secrets
import time

APP_DIR = Path('/app')
WEB_DIR = APP_DIR / 'web'
DATA_DIR = Path('/data')
PAGES_DIR = DATA_DIR / 'pages'
MANIFEST_FILE = DATA_DIR / 'manifest.json'
SETTINGS_FILE = DATA_DIR / 'settings.json'
SECRET_FILE = DATA_DIR / 'session-secret.txt'
COOKIE_VIEWER = 'album_viewer'
COOKIE_ADMIN = 'album_admin'
ALLOWED_IMG = {'.jpg', '.jpeg', '.png', '.webp'}
DEFAULT_ADMIN_PASSWORD = 'umbrel'

app = FastAPI(title='Album Flipbook Secure')
app.mount('/static', StaticFiles(directory=str(WEB_DIR)), name='static')

def read_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default

def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def load_manifest():
    data = read_json(MANIFEST_FILE, {})
    
    # תמיד נוודא שכל שדות החובה קיימים בקובץ
    if 'title' not in data: data['title'] = 'Album Preview'
    if 'subtitle' not in data: data['subtitle'] = 'Upload PDF or images to start'
    if 'showCover' not in data: data['showCover'] = True
    if 'pageWidth' not in data: data['pageWidth'] = 700
    if 'pageHeight' not in data: data['pageHeight'] = 1000
    if 'pages' not in data: data['pages'] = []
    
    # זה התיקון הקריטי: אם אין rtl בקובץ הישן - נוסיף אותו!
    if 'rtl' not in data: data['rtl'] = False
    
    return data

def save_manifest(data):
    write_json(MANIFEST_FILE, data)

def load_settings():
    default = {
        'admin_password_hash': hash_password(DEFAULT_ADMIN_PASSWORD),
        'viewer_password_hash': '',
        'viewer_protected': False,
        'admin_version': 1,
        'viewer_version': 1,
    }
    data = read_json(SETTINGS_FILE, default)
    changed = False
    for k, v in default.items():
        if k not in data:
            data[k] = v
            changed = True
    if changed:
        write_json(SETTINGS_FILE, data)
    return data

def save_settings(data):
    write_json(SETTINGS_FILE, data)

def load_secret() -> str:
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text(encoding='utf-8').strip()
    secret = secrets.token_hex(32)
    SECRET_FILE.write_text(secret, encoding='utf-8')
    return secret

def sign_payload(payload: str) -> str:
    secret = load_secret().encode('utf-8')
    return hmac.new(secret, payload.encode('utf-8'), hashlib.sha256).hexdigest()

def create_token(role: str, version: int, lifetime: int = 604800) -> str:
    exp = int(time.time()) + lifetime
    nonce = secrets.token_hex(8)
    payload = f'{role}|{version}|{exp}|{nonce}'
    sig = sign_payload(payload)
    raw = f'{payload}|{sig}'.encode('utf-8')
    return base64.urlsafe_b64encode(raw).decode('utf-8')

def verify_token(token: Optional[str], role: str, version: int) -> bool:
    if not token: return False
    try:
        raw = base64.urlsafe_b64decode(token.encode('utf-8')).decode('utf-8')
        parts = raw.split('|')
        if len(parts) != 5: return False
        token_role, token_version, token_exp, nonce, sig = parts
        payload = '|'.join(parts[:4])
        if token_role != role or int(token_version) != int(version) or int(token_exp) < int(time.time()):
            return False
        expected = sign_payload(payload)
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

def require_admin(request: Request):
    settings = load_settings()
    token = request.cookies.get(COOKIE_ADMIN)
    if not verify_token(token, 'admin', settings['admin_version']):
        raise HTTPException(status_code=401, detail='Admin login required')
    return settings

def require_viewer(request: Request):
    settings = load_settings()
    if not settings.get('viewer_protected'):
        return settings
    token = request.cookies.get(COOKIE_VIEWER)
    if not verify_token(token, 'viewer', settings['viewer_version']):
        raise HTTPException(status_code=401, detail='Viewer password required')
    return settings

def clear_pages():
    if PAGES_DIR.exists():
        for p in PAGES_DIR.iterdir():
            if p.is_file(): p.unlink()

def natural_key(s: str):
    parts = re.split(r'(\d+)', s)
    return [int(p) if p.isdigit() else p.lower() for p in parts]

def ensure_demo():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    load_settings()
    load_secret()
    manifest = load_manifest()
    if manifest.get('pages') and all((PAGES_DIR / p).exists() for p in manifest.get('pages', [])):
        return
    clear_pages()
    w, h = 1400, 1000
    try:
        big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 88)
        mid = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
    except Exception:
        big = mid = ImageFont.load_default()
    colors = [('#f6efe6', '#432817'), ('#eae8ff', '#302452'), ('#e8f6f2', '#17463a'), ('#fff1e6', '#61381d')]
    names = []
    for i in range(1, 5):
        bg, fg = colors[(i - 1) % len(colors)]
        img = Image.new('RGB', (w, h), bg)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((42, 42, w - 42, h - 42), radius=34, outline='#d6cabd', width=3)
        d.line((110, 92, 110, h - 92), fill='#d1c4b3', width=3)
        d.text((160, 150), 'Album Flipbook', fill=fg, font=big)
        d.text((160, 292), f'Sample page {i}', fill=fg, font=mid)
        d.text((160, 362), 'Click Admin at the bottom to upload a PDF or images.', fill=fg, font=mid)
        name = f'{i:02d}.jpg'
        img.save(PAGES_DIR / name, quality=92)
        names.append(name)
    save_manifest({'title': 'Album Preview', 'subtitle': 'Default admin password: umbrel', 'showCover': True, 'pageWidth': 700, 'pageHeight': 1000, 'pages': names})

class LoginPayload(BaseModel):
    password: str

class MetaPayload(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    showCover: Optional[bool] = None
    pageWidth: Optional[int] = None
    pageHeight: Optional[int] = None
    rtl: Optional[bool] = None     # <--- הוסף את השורה הזו


class SecurityPayload(BaseModel):
    viewerProtected: bool = False
    viewerPassword: str = ''
    adminPassword: str = ''

@app.on_event('startup')
def on_startup():
    ensure_demo()

@app.get('/', response_class=HTMLResponse)
def index():
    return (WEB_DIR / 'index.html').read_text(encoding='utf-8')

@app.get('/health')
def health():
    manifest = load_manifest()
    settings = load_settings()
    return {
        'ok': True,
        'pages': len(manifest.get('pages', [])),
        'viewerProtected': settings.get('viewer_protected', False)
    }

@app.get('/api/public-config')
def public_config():
    manifest = load_manifest()
    settings = load_settings()
    return {
        'title': manifest.get('title', 'Album Flipbook'),
        'subtitle': manifest.get('subtitle', ''),
        'viewerProtected': settings.get('viewer_protected', False)
    }

@app.post('/api/viewer/login')
def viewer_login(payload: LoginPayload, response: Response):
    settings = load_settings()
    if not settings.get('viewer_protected'):
        return {'ok': True, 'viewerProtected': False}
    if hash_password(payload.password) != settings.get('viewer_password_hash', ''):
        raise HTTPException(status_code=401, detail='Wrong viewer password')
    token = create_token('viewer', settings['viewer_version'])
    response.set_cookie(COOKIE_VIEWER, token, httponly=True, samesite='lax', max_age=604800)
    return {'ok': True, 'viewerProtected': True}

@app.post('/api/admin/login')
def admin_login(payload: LoginPayload, response: Response):
    settings = load_settings()
    if hash_password(payload.password) != settings.get('admin_password_hash', ''):
        raise HTTPException(status_code=401, detail='Wrong admin password')
    token = create_token('admin', settings['admin_version'])
    response.set_cookie(COOKIE_ADMIN, token, httponly=True, samesite='lax', max_age=604800)
    return {'ok': True}

@app.post('/api/admin/logout')
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_ADMIN)
    return {'ok': True}

@app.get('/api/admin/status')
def admin_status(request: Request):
    settings = load_settings()
    token = request.cookies.get(COOKIE_ADMIN)
    return {'authenticated': verify_token(token, 'admin', settings['admin_version'])}

@app.get('/api/admin/security')
def admin_security(request: Request):
    settings = require_admin(request)
    return {
        'viewerProtected': settings.get('viewer_protected', False),
        'viewerPasswordSet': bool(settings.get('viewer_password_hash')),
    }

@app.post('/api/admin/security')
def save_security(payload: SecurityPayload, request: Request, response: Response):
    settings = require_admin(request)
    changed_admin = False
    changed_viewer = False

    new_viewer_protected = bool(payload.viewerProtected)
    viewer_password = (payload.viewerPassword or '').strip()
    admin_password = (payload.adminPassword or '').strip()

    if new_viewer_protected:
        if viewer_password:
            settings['viewer_password_hash'] = hash_password(viewer_password)
            changed_viewer = True
        elif not settings.get('viewer_password_hash'):
            raise HTTPException(status_code=400, detail='Set a viewer password before enabling protection')
        if settings.get('viewer_protected') != True:
            changed_viewer = True
        settings['viewer_protected'] = True
    else:
        if settings.get('viewer_protected'):
            changed_viewer = True
        settings['viewer_protected'] = False
        if viewer_password:
            settings['viewer_password_hash'] = hash_password(viewer_password)
            changed_viewer = True

    if admin_password:
        settings['admin_password_hash'] = hash_password(admin_password)
        settings['admin_version'] = int(settings.get('admin_version', 1)) + 1
        changed_admin = True

    if changed_viewer:
        settings['viewer_version'] = int(settings.get('viewer_version', 1)) + 1
        response.delete_cookie(COOKIE_VIEWER)

    save_settings(settings)

    if changed_admin:
        new_token = create_token('admin', settings['admin_version'])
        response.set_cookie(COOKIE_ADMIN, new_token, httponly=True, samesite='lax', max_age=604800)

    return {
        'ok': True,
        'viewerProtected': settings.get('viewer_protected', False),
        'viewerPasswordSet': bool(settings.get('viewer_password_hash')),
        'adminPasswordChanged': changed_admin,
    }

@app.get('/api/manifest')
def api_manifest(request: Request):
    require_viewer(request)
    manifest = load_manifest()
    manifest['pageUrls'] = [f'/api/pages/{name}' for name in manifest.get('pages', [])]
    return manifest

@app.get('/api/pages/{name}')
def api_page(name: str, request: Request):
    require_viewer(request)
    path = PAGES_DIR / Path(name).name
    if not path.exists():
        raise HTTPException(status_code=404, detail='Page not found')
    return FileResponse(path)

@app.post('/api/meta')
def api_meta(payload: MetaPayload, request: Request):
    require_admin(request)
    manifest = load_manifest()
    if payload.title is not None: manifest['title'] = payload.title
    if payload.subtitle is not None: manifest['subtitle'] = payload.subtitle
    if payload.showCover is not None: manifest['showCover'] = payload.showCover
    if payload.pageWidth is not None: manifest['pageWidth'] = payload.pageWidth
    if payload.pageHeight is not None: manifest['pageHeight'] = payload.pageHeight
    if payload.rtl is not None: manifest['rtl'] = payload.rtl         # <--- הוסף את השורה הזו
    save_manifest(manifest)
    return {'ok': True, 'manifest': manifest}

@app.post('/api/clear')
def api_clear(request: Request):
    require_admin(request)
    clear_pages()
    manifest = load_manifest()
    manifest['pages'] = []
    save_manifest(manifest)
    return {'ok': True}

@app.post('/api/upload/images')
async def upload_images(
    request: Request,
    files: List[UploadFile] = File(...),
    replace: bool = Form(True)
):
    require_admin(request)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    existing = [] if replace else sorted([p.name for p in PAGES_DIR.iterdir() if p.is_file()], key=natural_key)
    if replace: clear_pages()
    start_index = len(existing) + 1
    saved = []
    for idx, upload in enumerate(files, start=start_index):
        ext = Path(upload.filename or '').suffix.lower()
        if ext not in ALLOWED_IMG: continue
        img = Image.open(io.BytesIO(await upload.read())).convert('RGB')
        name = f'{idx:03d}.jpg'
        img.save(PAGES_DIR / name, quality=92)
        saved.append(name)
    pages = existing + saved
    if not pages:
        raise HTTPException(status_code=400, detail='No valid images uploaded')
    manifest = load_manifest()
    manifest['pages'] = pages
    save_manifest(manifest)
    return {'ok': True, 'count': len(pages)}

@app.post('/api/upload/pdf')
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
    replace: bool = Form(True),
    scale: float = Form(2.0),
):
    require_admin(request)
    ext = Path(file.filename or '').suffix.lower()
    if ext != '.pdf':
        raise HTTPException(status_code=400, detail='Only PDF is supported')
    if replace: clear_pages()
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    raw = await file.read()
    doc = fitz.open(stream=raw, filetype='pdf')
    if doc.page_count == 0:
        raise HTTPException(status_code=400, detail='PDF has no pages')
    existing = [] if replace else sorted([p.name for p in PAGES_DIR.iterdir() if p.is_file()], key=natural_key)
    start_index = len(existing) + 1
    pages = existing.copy()
    for i, page in enumerate(doc, start=start_index):
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        out = PAGES_DIR / f'{i:03d}.jpg'
        pix.save(str(out))
        pages.append(out.name)
    manifest = load_manifest()
    manifest['pages'] = pages
    save_manifest(manifest)
    return {'ok': True, 'count': len(pages)}

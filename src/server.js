import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  upsertUser, getUser, createKey, revokeKeys, findKey, recordUsage,
  usageStats, keyInfo, allUsers
} from './store.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const origin = (process.env.APP_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, '');
const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const limit = Math.max(1, Number(process.env.DAILY_LIMIT || 450));
const sessionSecret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
if (process.env.NODE_ENV === 'production' && sessionSecret === 'development-only-change-this-secret') {
  throw new Error('Configura SESSION_SECRET con un valor largo y aleatorio en producción.');
}
const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${origin}/auth/google/callback`;
const oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, callbackUrl);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(session({
  name: 'sai.sid', secret: sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https://'), maxAge: 7 * 86400000 }
}));
app.use(morgan('tiny'));
app.use(express.static('public', { etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

const isAdmin = user => Boolean(user && adminEmails.includes(user.email.toLowerCase()));
const current = req => req.session?.userId ? getUser(req.session.userId) : null;
const needLogin = (req, res, next) => {
  if (!current(req)) return res.status(401).json({ status: false, error: 'Inicia sesión con Google.' });
  next();
};
const fail = (res, status, error) => res.status(status).json({ status: false, error, creator: 'SAI', year: 2026 });

const providerEndpoints = {
  '/api/ytsearch': { env: 'YTSEARCH_UPSTREAM', required: 'q', title: 'Búsqueda de YouTube', hint: 'Ej. Shakira', method: 'GET' },
  '/api/play/audio': { env: 'YTMP3_UPSTREAM', required: 'q', title: 'Descargar audio', hint: 'Ej. Shakira', method: 'GET' },
  '/api/play/video': { env: 'YTMP4_UPSTREAM', required: 'q', title: 'Descargar video', hint: 'Ej. Shakira', method: 'GET' },
  '/api/facebook': { env: 'FACEBOOK_UPSTREAM', required: 'url', title: 'Facebook', hint: 'Pega una URL pública de Facebook', method: 'GET' },
  '/api/tiktok': { env: 'TIKTOK_UPSTREAM', required: 'url', title: 'TikTok', hint: 'Pega una URL pública de TikTok', method: 'GET' },
  '/api/instagram': { env: 'INSTAGRAM_UPSTREAM', required: 'url', title: 'Instagram', hint: 'Pega una URL pública de Instagram', method: 'GET' },
  '/api/spotify': { env: 'SPOTIFY_UPSTREAM', required: 'q', title: 'Spotify', hint: 'Ej. canción o artista', method: 'GET' }
};

function parseProviderBody(raw) {
  try { return JSON.parse(raw); }
  catch { return { result: String(raw).slice(0, 50000) }; }
}

async function executeEndpoint(path, params, user, admin = false) {
  const cleanParams = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  if (!user) return { code: 401, body: { status: false, error: 'Inicia sesión con Google.', creator: 'SAI', year: 2026 } };

  const stats = usageStats(user.id);
  if (!admin && stats.today >= limit) {
    return { code: 429, body: { status: false, error: 'Límite diario alcanzado.', limit, dailyUsage: stats.today, creator: 'SAI', year: 2026 } };
  }

  if (path === '/api/ping') {
    recordUsage(user.id, path, 200);
    return { code: 200, body: { status: true, name: 'SaitamaAPI', message: 'API conectada', creator: 'SAI', year: 2026 } };
  }
  if (path === '/api/info') {
    recordUsage(user.id, path, 200);
    return { code: 200, body: { status: true, name: 'SaitamaAPI', version: 'PRO', endpoints: ['/api/ping', '/api/info', ...Object.keys(providerEndpoints)], dailyLimit: admin ? null : limit, unlimited: admin, creator: 'SAI', year: 2026 } };
  }

  const cfg = providerEndpoints[path];
  if (!cfg) return { code: 404, body: { status: false, error: 'Endpoint desconocido.', creator: 'SAI', year: 2026 } };
  const term = String(cleanParams[cfg.required] || '').trim().slice(0, 2000);
  if (!term) {
    recordUsage(user.id, path, 400);
    return { code: 400, body: { status: false, error: `Falta el parámetro ${cfg.required}.`, required: cfg.required, creator: 'SAI', year: 2026 } };
  }

  const upstream = process.env[cfg.env];
  if (!upstream) {
    recordUsage(user.id, path, 503);
    return { code: 503, body: { status: false, error: `Este endpoint aún no está configurado. Falta ${cfg.env} en las variables del servidor.`, creator: 'SAI', year: 2026 } };
  }

  try {
    const target = new URL(upstream);
    target.searchParams.set(cfg.required, term);
    for (const [key, value] of Object.entries(cleanParams)) {
      if (key === cfg.required || !/^[a-zA-Z0-9_-]{1,32}$/.test(key)) continue;
      if (value === undefined || value === null || String(value).length === 0) continue;
      target.searchParams.set(key, String(value).slice(0, 200));
    }
    const response = await fetch(target, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const parsed = parseProviderBody(await response.text());
    recordUsage(user.id, path, response.status);
    const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: parsed };
    return { code: response.status, body: { ...payload, status: response.ok && payload.status !== false, creator: 'SAI', year: 2026 } };
  } catch (error) {
    console.error(`Endpoint ${path}:`, error?.message || error);
    recordUsage(user.id, path, 502);
    return { code: 502, body: { status: false, error: 'El proveedor no respondió o tardó demasiado.', creator: 'SAI', year: 2026 } };
  }
}

app.get('/', (req, res) => res.sendFile(process.cwd() + '/public/index.html'));
app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables del servidor.');
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  res.redirect(oauth.generateAuthUrl({ access_type: 'online', scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
});
app.get('/auth/google/callback', async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
      return res.status(400).send('Estado OAuth inválido. Vuelve a iniciar sesión.');
    }
    delete req.session.oauthState;
    const { tokens } = await oauth.getToken(String(req.query.code));
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.email || !profile.email_verified) return res.status(403).send('Google no confirmó el correo.');
    const user = upsertUser({ email: profile.email, name: profile.name, picture: profile.picture });
    req.session.userId = user.id;
    req.session.save(err => {
      if (err) return res.status(500).send('No se pudo guardar la sesión. Intenta de nuevo.');
      res.redirect('/#dashboard');
    });
  } catch (error) {
    console.error('Google OAuth:', error?.message || error);
    res.status(500).send('Error al iniciar sesión. Revisa la configuración OAuth y los registros del servidor.');
  }
});
app.post('/auth/logout', (req, res) => req.session.destroy(err => {
  if (err) return res.status(500).json({ status: false, error: 'No se pudo cerrar la sesión.' });
  res.clearCookie('sai.sid', { path: '/' });
  res.json({ status: true, message: 'Sesión cerrada.' });
}));

app.get('/api/me', (req, res) => {
  const user = current(req);
  if (!user) return res.json({ authenticated: false, googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
  const stats = usageStats(user.id);
  const admin = isAdmin(user);
  res.json({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, createdAt: user.createdAt, admin },
    limit: admin ? null : limit,
    unlimited: admin,
    usage: stats,
    keys: keyInfo(user.id),
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

app.post('/api/keys', needLogin, (req, res) => {
  const user = current(req);
  revokeKeys(user.id);
  const key = createKey(user.id);
  res.status(201).json({ status: true, key, message: 'Clave creada. Cópiala y guárdala ahora; no se vuelve a mostrar completa.' });
});
app.delete('/api/keys', needLogin, (req, res) => {
  revokeKeys(current(req).id);
  res.json({ status: true, message: 'Clave revocada.' });
});

// The dashboard tester uses the signed-in session and the user's active-key record.
// The raw key never needs to be sent to browser JavaScript or placed in a URL.
app.post('/dashboard/api/test', needLogin, async (req, res) => {
  const user = current(req);
  if (!keyInfo(user.id).length) return fail(res, 403, 'Primero genera tu API Key desde el panel.');
  const path = String(req.body?.path || '');
  if (path !== '/api/ping' && path !== '/api/info' && !Object.hasOwn(providerEndpoints, path)) {
    return fail(res, 400, 'Selecciona un endpoint permitido.');
  }
  const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
  const result = await executeEndpoint(path, params, user, isAdmin(user));
  res.status(result.code).json(result.body);
});

app.get('/api/admin/users', needLogin, (req, res) => {
  if (!isAdmin(current(req))) return fail(res, 403, 'Solo administradores.');
  res.json({ users: allUsers().map(user => ({
    id: user.id, email: user.email, name: user.name,
    keys: user.keys.length, usage: usageStats(user.id).today
  })) });
});

function apiAuth(req, res, next) {
  if (req.path === '/ping') { req.apiUser = null; req.apiAdmin = false; return next(); }
  const raw = (req.get('x-api-key') || req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const key = raw ? findKey(raw) : null;
  if (!key) return fail(res, 401, 'API key ausente o inválida. Usa x-api-key: sai_...');
  const user = getUser(key.userId);
  if (!user) return fail(res, 401, 'Usuario no encontrado.');
  const admin = isAdmin(user);
  if (!admin && usageStats(user.id).today >= limit) {
    return res.status(429).json({ status: false, error: 'Límite diario alcanzado.', limit, creator: 'SAI', year: 2026 });
  }
  req.apiUser = user;
  req.apiAdmin = admin;
  next();
}
app.use('/api', apiAuth);
app.get('/api/ping', (req, res) => res.json({ status: true, name: 'SaitamaAPI', creator: 'SAI', year: 2026 }));
app.get('/api/info', (req, res) => {
  const user = req.apiUser;
  recordUsage(user.id, '/api/info', 200);
  res.json({ status: true, name: 'SaitamaAPI', version: 'PRO', endpoints: ['/api/info', ...Object.keys(providerEndpoints)], limit: req.apiAdmin ? null : limit, creator: 'SAI', year: 2026 });
});
for (const path of Object.keys(providerEndpoints)) {
  app.get(path, async (req, res) => {
    const result = await executeEndpoint(path, req.query, req.apiUser, req.apiAdmin);
    res.status(result.code).json(result.body);
  });
}

app.use((err, req, res, next) => {
  console.error('SERVER_ERROR:', err?.message || err);
  res.status(500).json({ status: false, error: 'Error interno del servidor.', creator: 'SAI', year: 2026 });
});
app.listen(PORT, () => console.log(`SaitamaAPI PRO listo en ${origin} · puerto ${PORT}`));

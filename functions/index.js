const admin = require('firebase-admin');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');

const app = admin.initializeApp();

const db = getFirestore(app, 'default');
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_FIELD_LENGTH = 1200;

const allowedOrigins = new Set([
  'https://loomlogic-professional.web.app',
  'https://loomlogic-professional.firebaseapp.com',
  'https://loomlogic3.github.io',
]);

const clean = (value, maxLength = MAX_FIELD_LENGTH) => String(value || '').trim().slice(0, maxLength);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getClientKey = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.ip || 'unknown');
  return ip.split(',')[0].trim().replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 100) || 'unknown';
};

const applyCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin-Token');
};

const getAdminToken = (req) => {
  const header = String(req.headers.authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return String(req.headers['x-admin-token'] || '').trim();
};

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
};

const isAdminAuthorized = (req) => {
  const configuredToken = String(process.env.ADMIN_VIEWER_TOKEN || '').trim();
  if (!configuredToken) return { ok: false, status: 503, error: 'Admin access is not configured.' };
  if (getAdminToken(req) !== configuredToken) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
};

const listInquiries = async (req, res) => {
  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const snapshot = await db
    .collection('inquiries')
    .orderBy('createdAt', 'desc')
    .limit(40)
    .get();

  const inquiries = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || '',
      email: data.email || '',
      projectType: data.projectType || '',
      budget: data.budget || '',
      message: data.message || '',
      source: data.source || '',
      status: data.status || 'new',
      createdAt: toIsoDate(data.createdAt),
    };
  });

  res.status(200).json({ ok: true, inquiries });
};

const functionOptions = { region: 'us-central1', secrets: ['ADMIN_VIEWER_TOKEN'] };

exports.verifyAdmin = onRequest(functionOptions, (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  res.status(200).json({ ok: true });
});

const checkRateLimit = async (key) => {
  const ref = db.collection('rateLimits').doc(`inquiry_${key}`);
  const now = Date.now();
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const windowStart = data.windowStart || now;
    const expired = now - windowStart > WINDOW_MS;
    const count = expired ? 1 : (data.count || 0) + 1;
    transaction.set(ref, {
      count,
      windowStart: expired ? now : windowStart,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return count <= MAX_PER_WINDOW;
  });
  return result;
};

exports.submitInquiry = onRequest(functionOptions, async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method === 'GET') {
    try {
      await listInquiries(req, res);
    } catch (error) {
      console.error('Inquiry list failed', error && error.message ? error.message : error);
      res.status(500).json({ ok: false, error: 'Inquiries could not be loaded.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const clientKey = getClientKey(req);
    const allowed = await checkRateLimit(clientKey);
    if (!allowed) {
      res.status(429).json({ ok: false, error: 'Too many inquiries. Please try again later.' });
      return;
    }

    const body = req.body || {};
    const inquiry = {
      name: clean(body.name, 120),
      email: clean(body.email, 180).toLowerCase(),
      projectType: clean(body.projectType, 160),
      budget: clean(body.budget, 120),
      message: clean(body.message, 1200),
      source: clean(body.source, 80) || 'professional-site',
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
      userAgent: clean(req.headers['user-agent'], 300),
    };

    if (!inquiry.name || !isEmail(inquiry.email) || !inquiry.projectType || !inquiry.message) {
      res.status(400).json({ ok: false, error: 'Missing required inquiry details.' });
      return;
    }

    const doc = await db.collection('inquiries').add(inquiry);
    res.status(201).json({ ok: true, id: doc.id });
  } catch (error) {
    console.error('Inquiry submission failed', error && error.message ? error.message : error);
    res.status(500).json({ ok: false, error: 'Inquiry could not be submitted.' });
  }
});

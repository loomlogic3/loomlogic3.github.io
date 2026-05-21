const admin = require('firebase-admin');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');

const app = admin.initializeApp();

const db = getFirestore(app, 'default');
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MAX_FIELD_LENGTH = 1200;
const MAX_CHAT_MESSAGE_LENGTH = 900;
const MAX_CHAT_REPLY_LENGTH = 900;
const inquiryStatuses = new Set(['new', 'reviewed', 'contacted', 'closed']);
const socialDraftStatuses = new Set(['draft', 'approved', 'posted', 'archived']);

const allowedOrigins = new Set([
  'https://loomlogic-professional.web.app',
  'https://loomlogic-professional.firebaseapp.com',
  'https://loomlogic3.github.io',
]);

const clean = (value, maxLength = MAX_FIELD_LENGTH) => String(value || '').trim().slice(0, maxLength);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const assistantSystemPrompt = [
  'You are Loom&Logic AI, the public website assistant for Loom Logic.',
  'You help potential clients understand Loom Logic’s professional digital systems, automation dashboards, client intake systems, product prototypes, Web3 monitoring tools, and launch-ready content workflows.',
  'You explain the brand philosophy: “Add power only after adding control.”',
  'You are public-facing and must keep public website content separate from internal V2 trading controls.',
  'You must not provide financial advice, promise profits, ask for private keys, reveal secrets, expose internal infrastructure, or control bots/wallets/trading systems.',
  'You should guide interested clients to contact loomlogic3@gmail.com.',
].join(' ');

const assistantFallbackReply = (message) => {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('private key') || lower.includes('seed phrase') || lower.includes('wallet') || lower.includes('trade')) {
    return 'I’m a public information assistant for Loom Logic. I can explain public services and safety-first principles, but I cannot access private systems, wallets, trading controls, secrets, or live execution.';
  }
  if (lower.includes('contact') || lower.includes('email') || lower.includes('hire')) {
    return 'You can contact Loom Logic at loomlogic3@gmail.com. Share your project goal, timeline, and what kind of system you want to build.';
  }
  if (lower.includes('v2') || lower.includes('public website')) {
    return 'The public website is Loom Logic’s professional front door for clients. V2 is separate: it is an internal safety-first control plane, not a public trading promise or client money management service.';
  }
  if (lower.includes('safety') || lower.includes('control') || lower.includes('philosophy')) {
    return 'Loom Logic’s philosophy is: “Add power only after adding control.” That means approval gates, clear boundaries, logs, review, and safer workflows come before automation.';
  }
  return 'Loom Logic builds professional business websites, automation dashboards, client intake systems, product prototypes, Web3 monitoring tools, and launch-ready content workflows. This assistant provides general information only, not financial advice.';
};

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
  res.set('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
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
      adminNote: data.adminNote || '',
      source: data.source || '',
      status: data.status || 'new',
      createdAt: toIsoDate(data.createdAt),
      updatedAt: toIsoDate(data.updatedAt),
    };
  });

  res.status(200).json({ ok: true, inquiries });
};

const updateInquiry = async (req, res) => {
  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const body = req.body || {};
  const id = clean(body.id, 120).replace(/[^a-zA-Z0-9_-]/g, '');
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = clean(body.status, 40).toLowerCase();
    if (!inquiryStatuses.has(status)) {
      res.status(400).json({ ok: false, error: 'Invalid inquiry status.' });
      return;
    }
    updates.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'adminNote')) {
    updates.adminNote = clean(body.adminNote, 1000);
  }

  if (!id || !Object.keys(updates).length) {
    res.status(400).json({ ok: false, error: 'Invalid inquiry update.' });
    return;
  }

  const ref = db.collection('inquiries').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    res.status(404).json({ ok: false, error: 'Inquiry not found.' });
    return;
  }

  await ref.set({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  res.status(200).json({ ok: true, id, ...updates });
};

const serializeSocialDraft = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    account: data.account || '',
    platform: data.platform || '',
    goal: data.goal || '',
    tone: data.tone || '',
    topic: data.topic || '',
    notes: data.notes || '',
    label: data.label || '',
    text: data.text || '',
    status: data.status || 'draft',
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
};

const listSocialDrafts = async (req, res) => {
  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const snapshot = await db
    .collection('socialDrafts')
    .orderBy('createdAt', 'desc')
    .limit(60)
    .get();

  res.status(200).json({ ok: true, drafts: snapshot.docs.map(serializeSocialDraft) });
};

const createSocialDraft = async (req, res) => {
  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const body = req.body || {};
  const draft = {
    account: clean(body.account, 80),
    platform: clean(body.platform, 80),
    goal: clean(body.goal, 120),
    tone: clean(body.tone, 120),
    topic: clean(body.topic, 180),
    notes: clean(body.notes, 600),
    label: clean(body.label, 120),
    text: clean(body.text, 900),
    status: 'draft',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!draft.account || !draft.platform || !draft.label || !draft.text) {
    res.status(400).json({ ok: false, error: 'Missing draft details.' });
    return;
  }

  const doc = await db.collection('socialDrafts').add(draft);
  res.status(201).json({ ok: true, id: doc.id });
};

const updateSocialDraft = async (req, res) => {
  const auth = isAdminAuthorized(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const body = req.body || {};
  const id = clean(body.id, 120).replace(/[^a-zA-Z0-9_-]/g, '');
  const status = clean(body.status, 40).toLowerCase();
  if (!id || !socialDraftStatuses.has(status)) {
    res.status(400).json({ ok: false, error: 'Invalid draft update.' });
    return;
  }

  const ref = db.collection('socialDrafts').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    res.status(404).json({ ok: false, error: 'Draft not found.' });
    return;
  }

  await ref.set({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  res.status(200).json({ ok: true, id, status });
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

exports.manageSocialDrafts = onRequest(functionOptions, async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'GET') {
      await listSocialDrafts(req, res);
      return;
    }

    if (req.method === 'POST') {
      await createSocialDraft(req, res);
      return;
    }

    if (req.method === 'PATCH') {
      await updateSocialDraft(req, res);
      return;
    }

    res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Social draft request failed', error && error.message ? error.message : error);
    res.status(500).json({ ok: false, error: 'Social draft request failed.' });
  }
});

const checkRateLimit = async (key, bucket = 'inquiry', maxPerWindow = MAX_PER_WINDOW) => {
  const safeBucket = clean(bucket, 40).replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  const ref = db.collection('rateLimits').doc(`${safeBucket}_${key}`);
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
    return count <= maxPerWindow;
  });
  return result;
};

const limitReply = (reply) => clean(reply, MAX_CHAT_REPLY_LENGTH);

const callGemini = async (message) => {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = clean(process.env.GEMINI_MODEL, 80) || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: assistantSystemPrompt }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: message }],
      }],
      generationConfig: {
        maxOutputTokens: 220,
        temperature: 0.35,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}`);
  }

  const data = await response.json();
  return limitReply(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ') || '');
};

const callOllama = async (message) => {
  if (String(process.env.AI_PROVIDER || '').toLowerCase() !== 'ollama') return null;

  const baseUrl = clean(process.env.OLLAMA_BASE_URL, 180) || 'http://localhost:11434';
  const model = clean(process.env.OLLAMA_MODEL, 80) || 'llama3.2';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: assistantSystemPrompt },
        { role: 'user', content: message },
      ],
      options: {
        temperature: 0.35,
        num_predict: 220,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}`);
  }

  const data = await response.json();
  return limitReply(data?.message?.content || '');
};

const aiFunctionOptions = { region: 'us-central1' };

exports.aiChat = onRequest(aiFunctionOptions, async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const clientKey = getClientKey(req);
    const allowed = await checkRateLimit(clientKey, 'ai_chat', 10);
    if (!allowed) {
      res.status(429).json({
        ok: false,
        reply: 'The assistant is receiving too many requests from this connection. Please try again later.',
      });
      return;
    }

    const message = clean(req.body?.message, MAX_CHAT_MESSAGE_LENGTH);
    if (!message) {
      res.status(400).json({ ok: false, error: 'Message is required.' });
      return;
    }

    let reply = null;
    try {
      reply = await callOllama(message);
      if (!reply) reply = await callGemini(message);
    } catch (error) {
      console.error('AI provider unavailable', error && error.message ? error.message : 'provider failed');
    }

    res.status(200).json({
      ok: true,
      reply: reply || assistantFallbackReply(message),
      provider: reply ? (String(process.env.AI_PROVIDER || '').toLowerCase() || 'gemini') : 'fallback',
    });
  } catch (error) {
    console.error('AI chat request failed', error && error.message ? error.message : error);
    res.status(200).json({
      ok: true,
      reply: assistantFallbackReply(req.body?.message),
      provider: 'fallback',
    });
  }
});

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

  if (req.method === 'PATCH') {
    try {
      await updateInquiry(req, res);
    } catch (error) {
      console.error('Inquiry update failed', error && error.message ? error.message : error);
      res.status(500).json({ ok: false, error: 'Inquiry could not be updated.' });
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

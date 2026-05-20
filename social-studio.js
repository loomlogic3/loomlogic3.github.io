const socialForm = document.querySelector('[data-social-form]');
const socialResults = document.querySelector('[data-social-results]');
const socialSummary = document.querySelector('[data-social-summary]');
const draftGrid = document.querySelector('[data-draft-grid]');
const clearButton = document.querySelector('[data-clear-social]');
const draftLibrary = document.querySelector('[data-draft-library]');
const refreshDraftsButton = document.querySelector('[data-refresh-drafts]');
const draftFilterButtons = document.querySelectorAll('[data-draft-filter]');
const draftSearchInput = document.querySelector('[data-draft-search]');
const auth = window.loomAdminAuth;
const adminGate = document.querySelector('[data-admin-gate]');
const privateStudio = document.querySelector('[data-studio-private]');
const studioLoginForm = document.querySelector('[data-studio-login-form]');
const studioAuthStatus = document.querySelector('[data-studio-auth-status]');
const draftStatuses = ['draft', 'approved', 'posted', 'archived'];
let adminToken = '';
let activeDraftFilter = 'all';
let activeDraftSearch = '';
let savedDrafts = [];

const lockStudio = () => {
  privateStudio.hidden = true;
  privateStudio.setAttribute('aria-hidden', 'true');
  privateStudio.style.display = 'none';
  adminGate.hidden = false;
  adminGate.removeAttribute('aria-hidden');
  adminGate.style.display = '';
};

lockStudio();

const setStudioAuthStatus = (message, success = false) => {
  studioAuthStatus.textContent = message;
  studioAuthStatus.classList.toggle('is-success', success);
};

const unlockStudio = async (token) => {
  setStudioAuthStatus('Checking passcode...');
  await auth.verifyAdminToken(token);
  adminToken = token;
  auth.saveAdminToken(token);
  adminGate.hidden = true;
  adminGate.setAttribute('aria-hidden', 'true');
  adminGate.style.display = 'none';
  privateStudio.hidden = false;
  privateStudio.removeAttribute('aria-hidden');
  privateStudio.style.display = '';
  setStudioAuthStatus('Unlocked.', true);
  await loadDraftLibrary();
};

studioLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(studioLoginForm);
  const token = String(formData.get('passcode') || '').trim();
  if (!token) return;

  try {
    await unlockStudio(token);
  } catch (error) {
    auth.clearAdminToken();
    adminToken = '';
    lockStudio();
    setStudioAuthStatus(error.message || 'Admin access failed.');
  }
});

const accountVoices = {
  business: {
    name: 'Loom Logic business',
    handle: '@loomlogic3',
    perspective: 'we',
    focus: 'professional digital systems, client trust, automation, websites, and safe Web3 monitoring',
  },
  founder: {
    name: 'Founder personal',
    handle: '@oromitayo12',
    perspective: 'I',
    focus: 'building in public, practical lessons, client trust, and disciplined system design',
  },
  indigo: {
    name: 'IndigoArtHub',
    handle: 'IndigoArtHub',
    perspective: 'we',
    focus: 'creative platforms, Yoruba craftsmanship, Osogbo Adire, Batik, artisans, and collectors',
  },
  legacy: {
    name: 'Legacy',
    handle: 'Legacy',
    perspective: 'we',
    focus: 'learning, monitoring, operational history, and responsible Web3 system communication',
  },
  v2: {
    name: 'V2',
    handle: 'V2',
    perspective: 'we',
    focus: 'approval gates, read-only visibility, safety-first controls, and careful automation',
  },
};

const unsafePatterns = [
  { pattern: /guarante(e|ed|es|eing)/i, label: 'Avoid guarantees' },
  { pattern: /profit|profits|returns|roi/i, label: 'Avoid profit promises' },
  { pattern: /financial advice|investment advice/i, label: 'Avoid financial advice' },
  { pattern: /private key|seed phrase|wallet secret/i, label: 'Never request secrets' },
  { pattern: /dm everyone|mass dm|auto follow|follow for follow/i, label: 'Avoid spam automation' },
  { pattern: /get rich|moonshot|100x/i, label: 'Avoid hype language' },
];

const platformLimits = {
  X: 260,
  LinkedIn: 650,
  Instagram: 520,
  Facebook: 520,
  Threads: 420,
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const trimToLimit = (text, limit) => {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
};

const buildHashtags = (account, platform) => {
  const base = account === 'indigo'
    ? ['#IndigoArtHub', '#CreativeTech', '#AfricanArt']
    : ['#LoomLogic', '#DigitalSystems', '#Automation'];

  if (platform === 'LinkedIn') return base.slice(0, 2).join(' ');
  return base.join(' ');
};

const buildDrafts = ({ account, platform, goal, tone, topic, notes }) => {
  const voice = accountVoices[account] || accountVoices.business;
  const limit = platformLimits[platform] || 420;
  const hashtags = buildHashtags(account, platform);
  const safeNotes = notes ? ` Context: ${notes}` : '';
  const perspectiveLead = voice.perspective === 'I' ? 'I am building' : 'We build';

  const drafts = [
    {
      label: 'Trust Builder',
      text: `${perspectiveLead} ${voice.focus} around one principle: add power only after adding control. ${topic}. ${safeNotes} If your business needs a clearer digital system, start the conversation with Loom Logic. ${hashtags}`,
    },
    {
      label: 'Client Clarity',
      text: `${voice.name} focuses on ${goal.toLowerCase()}: ${topic}. The goal is not hype. It is a practical system people can understand, review, and trust. ${safeNotes} Contact Loom Logic when you are ready to scope a build. ${hashtags}`,
    },
    {
      label: 'Short Post',
      text: `${topic}. At Loom Logic, the rule is simple: add power only after adding control. Clear systems. Safer workflows. Better client trust. ${hashtags}`,
    },
  ];

  return drafts.map((draft) => ({
    ...draft,
    text: trimToLimit(draft.text, limit),
    limit,
    checks: scoreDraft(draft.text),
    tone,
    platform,
    handle: voice.handle,
    account,
    goal,
    topic,
    notes,
  }));
};

const scoreDraft = (text) => {
  const flags = unsafePatterns
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.label);

  const safeChecks = [
    'Human approval required',
    'No auto-posting',
    'No private system details',
    'No platform manipulation',
  ];

  return {
    status: flags.length ? 'Needs review' : 'Safe draft',
    flags,
    safeChecks,
  };
};

const renderDraft = (draft) => {
  const card = document.createElement('article');
  card.className = 'draft-card';

  const flagMarkup = draft.checks.flags.length
    ? draft.checks.flags.map((flag) => `<span class="risk">${flag}</span>`).join('')
    : '<span>Passed language scan</span>';

  card.innerHTML = `
    <div class="draft-card-head">
      <div>
        <span class="eyebrow">${draft.platform} · ${draft.handle}</span>
        <strong>${draft.label}</strong>
      </div>
      <span class="draft-status">${draft.checks.status}</span>
    </div>
    <p class="draft-text"></p>
    <div class="draft-meta">
      <span>${draft.text.length}/${draft.limit} characters</span>
      <span>${draft.tone}</span>
    </div>
    <div class="draft-checks">${flagMarkup}</div>
    <div class="studio-actions">
      <button class="secondary-action copy-draft" type="button">Copy Draft</button>
      <button class="secondary-action save-draft" type="button">Save Draft</button>
    </div>
  `;

  card.querySelector('.draft-text').textContent = draft.text;
  card.querySelector('.copy-draft').addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(draft.text);
      event.currentTarget.textContent = 'Copied';
    } catch {
      event.currentTarget.textContent = 'Select text to copy';
    }
  });
  card.querySelector('.save-draft').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Saving';
    try {
      await saveSocialDraft(draft);
      event.currentTarget.textContent = 'Saved';
      await loadDraftLibrary();
    } catch {
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = 'Try Again';
    }
  });

  return card;
};

const saveSocialDraft = async (draft) => {
  const response = await fetch('/api/social-drafts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(draft),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Draft could not be saved.');
  }
};

const updateSavedDraftStatus = async (id, status) => {
  const response = await fetch('/api/social-drafts', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify({ id, status }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Draft could not be updated.');
  }
};

const draftMatchesSearch = (draft) => {
  if (!activeDraftSearch) return true;
  const haystack = [
    draft.account,
    draft.platform,
    draft.goal,
    draft.tone,
    draft.topic,
    draft.notes,
    draft.label,
    draft.text,
    draft.status,
  ].join(' ').toLowerCase();
  return haystack.includes(activeDraftSearch);
};

const renderDraftLibrary = (drafts) => {
  const visibleDrafts = drafts.filter((draft) => {
    const statusMatches = activeDraftFilter === 'all' || (draft.status || 'draft') === activeDraftFilter;
    return statusMatches && draftMatchesSearch(draft);
  });

  if (!visibleDrafts.length) {
    draftLibrary.innerHTML = '<p class="empty-state">No saved drafts match this view.</p>';
    return;
  }

  draftLibrary.innerHTML = visibleDrafts.map((draft) => {
    const statusButtons = draftStatuses.map((status) => `
      <button
        class="status-chip ${status === (draft.status || 'draft') ? 'is-active' : ''}"
        type="button"
        data-draft-id="${escapeHtml(draft.id)}"
        data-draft-status="${status}"
      >
        ${escapeHtml(status)}
      </button>
    `).join('');

    return `
      <article class="draft-card">
        <div class="draft-card-head">
          <div>
            <span class="eyebrow">${escapeHtml(draft.platform)} · ${escapeHtml(draft.account)}</span>
            <strong>${escapeHtml(draft.label || 'Saved Draft')}</strong>
          </div>
          <span class="draft-status">${escapeHtml(draft.status || 'draft')}</span>
        </div>
        <p class="draft-text">${escapeHtml(draft.text)}</p>
        <div class="draft-meta">
          <span>${escapeHtml(draft.tone || 'No tone')}</span>
          <span>${escapeHtml(draft.topic || 'No topic')}</span>
        </div>
        <div class="inquiry-status-controls">${statusButtons}</div>
        <button class="secondary-action copy-saved-draft" type="button" data-draft-copy="${escapeHtml(draft.id)}">
          Copy Draft
        </button>
      </article>
    `;
  }).join('');
};

const loadDraftLibrary = async () => {
  draftLibrary.innerHTML = '<p class="empty-state">Loading saved drafts...</p>';
  const response = await fetch('/api/social-drafts', {
    headers: {
      'X-Admin-Token': adminToken,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Saved drafts could not be loaded.');
  }
  savedDrafts = data.drafts || [];
  renderDraftLibrary(savedDrafts);
};

socialForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(socialForm);
  const payload = {
    account: clean(formData.get('account')),
    platform: clean(formData.get('platform')),
    goal: clean(formData.get('goal')),
    tone: clean(formData.get('tone')),
    topic: clean(formData.get('topic')),
    notes: clean(formData.get('notes')),
  };

  const drafts = buildDrafts(payload);
  draftGrid.replaceChildren(...drafts.map(renderDraft));
  socialSummary.textContent = `${drafts.length} safe-review drafts generated for ${payload.platform}. Review every post manually before publishing.`;
  socialResults.hidden = false;
  socialResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

clearButton.addEventListener('click', () => {
  socialForm.reset();
  draftGrid.replaceChildren();
  socialResults.hidden = true;
});

refreshDraftsButton.addEventListener('click', () => {
  loadDraftLibrary().catch(() => {
    draftLibrary.innerHTML = '<p class="empty-state">Could not refresh saved drafts.</p>';
  });
});

draftFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeDraftFilter = button.getAttribute('data-draft-filter') || 'all';
    draftFilterButtons.forEach((filterButton) => {
      filterButton.classList.toggle('is-active', filterButton === button);
    });
    renderDraftLibrary(savedDrafts);
  });
});

draftSearchInput.addEventListener('input', () => {
  activeDraftSearch = draftSearchInput.value.trim().toLowerCase();
  renderDraftLibrary(savedDrafts);
});

draftLibrary.addEventListener('click', async (event) => {
  const statusButton = event.target.closest('[data-draft-id][data-draft-status]');
  if (statusButton) {
    const id = statusButton.getAttribute('data-draft-id');
    const status = statusButton.getAttribute('data-draft-status');
    statusButton.disabled = true;
    statusButton.textContent = 'Saving';
    try {
      await updateSavedDraftStatus(id, status);
      await loadDraftLibrary();
    } catch {
      statusButton.disabled = false;
      statusButton.textContent = status;
    }
    return;
  }

  const copyButton = event.target.closest('[data-draft-copy]');
  if (!copyButton) return;
  const draft = savedDrafts.find((item) => item.id === copyButton.getAttribute('data-draft-copy'));
  if (!draft) return;
  try {
    await navigator.clipboard.writeText(draft.text);
    copyButton.textContent = 'Copied';
  } catch {
    copyButton.textContent = 'Select text to copy';
  }
});

const socialForm = document.querySelector('[data-social-form]');
const socialResults = document.querySelector('[data-social-results]');
const socialSummary = document.querySelector('[data-social-summary]');
const draftGrid = document.querySelector('[data-draft-grid]');
const clearButton = document.querySelector('[data-clear-social]');

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
    <button class="secondary-action copy-draft" type="button">Copy Draft</button>
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

  return card;
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

const auth = window.loomAdminAuth;
const adminGate = document.querySelector('[data-admin-gate]');
const adminHome = document.querySelector('[data-admin-home]');
const loginForm = document.querySelector('[data-admin-home-login-form]');
const statusNode = document.querySelector('[data-admin-home-status]');
const lockButton = document.querySelector('[data-admin-home-lock]');
const refreshButton = document.querySelector('[data-admin-refresh]');
const totalNode = document.querySelector('[data-total-inquiries]');
const newNode = document.querySelector('[data-new-inquiries]');
const recentList = document.querySelector('[data-admin-recent-list]');
const totalDraftsNode = document.querySelector('[data-total-drafts]');
const approvedDraftsNode = document.querySelector('[data-approved-drafts]');
const postedDraftsNode = document.querySelector('[data-posted-drafts]');
const draftList = document.querySelector('[data-admin-draft-list]');

let adminToken = '';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value) => {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const setStatus = (message, success = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('is-success', success);
};

const lockAdminHome = () => {
  adminToken = '';
  adminHome.hidden = true;
  adminHome.setAttribute('aria-hidden', 'true');
  adminHome.style.display = 'none';
  adminGate.hidden = false;
  adminGate.removeAttribute('aria-hidden');
  adminGate.style.display = '';
};

const openAdminHome = () => {
  adminGate.hidden = true;
  adminGate.setAttribute('aria-hidden', 'true');
  adminGate.style.display = 'none';
  adminHome.hidden = false;
  adminHome.removeAttribute('aria-hidden');
  adminHome.style.display = '';
};

const renderRecent = (inquiries) => {
  const recent = inquiries.slice(0, 5);
  if (!recent.length) {
    recentList.innerHTML = '<p class="empty-state">No inquiries yet.</p>';
    return;
  }

  recentList.innerHTML = recent.map((inquiry) => `
    <article class="admin-recent-item">
      <div>
        <span class="eyebrow">${escapeHtml(inquiry.projectType || 'Project Inquiry')}</span>
        <strong>${escapeHtml(inquiry.name || 'Unnamed visitor')}</strong>
        <p>${escapeHtml(inquiry.message || 'No message provided.')}</p>
      </div>
      <div class="admin-recent-meta">
        <span>${escapeHtml(inquiry.status || 'new')}</span>
        <span>${escapeHtml(formatDate(inquiry.createdAt))}</span>
      </div>
    </article>
  `).join('');
};

const renderRecentDrafts = (drafts) => {
  const recent = drafts.slice(0, 5);
  if (!recent.length) {
    draftList.innerHTML = '<p class="empty-state">No saved drafts yet.</p>';
    return;
  }

  draftList.innerHTML = recent.map((draft) => `
    <article class="admin-recent-item">
      <div>
        <span class="eyebrow">${escapeHtml(draft.platform || 'Platform')} · ${escapeHtml(draft.account || 'Account')}</span>
        <strong>${escapeHtml(draft.label || 'Saved Draft')}</strong>
        <p>${escapeHtml(draft.text || 'No draft text.')}</p>
      </div>
      <div class="admin-recent-meta">
        <span>${escapeHtml(draft.status || 'draft')}</span>
        <span>${escapeHtml(formatDate(draft.createdAt))}</span>
      </div>
    </article>
  `).join('');
};

const loadAdminSummary = async () => {
  recentList.innerHTML = '<p class="empty-state">Loading recent inquiries...</p>';
  draftList.innerHTML = '<p class="empty-state">Loading saved drafts...</p>';

  const headers = {
    'X-Admin-Token': adminToken,
  };

  const [inquiryResponse, draftResponse] = await Promise.all([
    fetch('/api/inquiries', { headers }),
    fetch('/api/social-drafts', { headers }),
  ]);

  const inquiryData = await inquiryResponse.json().catch(() => ({}));
  if (!inquiryResponse.ok || !inquiryData.ok) {
    throw new Error(inquiryData.error || 'Admin summary could not be loaded.');
  }

  const draftData = await draftResponse.json().catch(() => ({}));
  if (!draftResponse.ok || !draftData.ok) {
    throw new Error(draftData.error || 'Draft summary could not be loaded.');
  }

  const inquiries = inquiryData.inquiries || [];
  const drafts = draftData.drafts || [];

  totalNode.textContent = String(inquiries.length);
  newNode.textContent = String(inquiries.filter((inquiry) => (inquiry.status || 'new') === 'new').length);
  totalDraftsNode.textContent = String(drafts.length);
  approvedDraftsNode.textContent = String(drafts.filter((draft) => (draft.status || 'draft') === 'approved').length);
  postedDraftsNode.textContent = String(drafts.filter((draft) => (draft.status || 'draft') === 'posted').length);
  renderRecent(inquiries);
  renderRecentDrafts(drafts);
};

const unlockAdminHome = async (token) => {
  setStatus('Checking passcode...');
  await auth.verifyAdminToken(token);
  adminToken = token;
  auth.saveAdminToken(token);
  openAdminHome();
  await loadAdminSummary();
};

lockAdminHome();

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const token = String(formData.get('passcode') || '').trim();
  if (!token) return;

  try {
    await unlockAdminHome(token);
  } catch (error) {
    auth.clearAdminToken();
    lockAdminHome();
    setStatus(error.message || 'Admin access failed.');
  }
});

lockButton.addEventListener('click', () => {
  auth.clearAdminToken();
  lockAdminHome();
  loginForm.reset();
  setStatus('Locked. Enter the admin passcode to continue.');
});

refreshButton.addEventListener('click', async () => {
  try {
    await loadAdminSummary();
  } catch (error) {
    recentList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'Could not refresh admin summary.')}</p>`;
  }
});

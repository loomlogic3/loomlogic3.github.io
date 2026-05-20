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

const loadAdminSummary = async () => {
  recentList.innerHTML = '<p class="empty-state">Loading recent inquiries...</p>';
  const response = await fetch('/api/inquiries', {
    headers: {
      'X-Admin-Token': adminToken,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Admin summary could not be loaded.');
  }

  const inquiries = data.inquiries || [];
  totalNode.textContent = String(inquiries.length);
  newNode.textContent = String(inquiries.filter((inquiry) => (inquiry.status || 'new') === 'new').length);
  renderRecent(inquiries);
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

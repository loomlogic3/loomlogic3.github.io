const auth = window.loomAdminAuth;
const loginPanel = document.querySelector('[data-admin-login-panel]');
const loginForm = document.querySelector('[data-admin-login-form]');
const statusNode = document.querySelector('[data-admin-status]');
const desk = document.querySelector('[data-inquiry-desk]');
const listNode = document.querySelector('[data-inquiry-list]');
const refreshButton = document.querySelector('[data-refresh-inquiries]');
const lockButton = document.querySelector('[data-lock-inquiries]');

let adminToken = '';

const lockDesk = () => {
  adminToken = '';
  desk.hidden = true;
  desk.setAttribute('aria-hidden', 'true');
  desk.style.display = 'none';
  loginPanel.hidden = false;
  loginPanel.removeAttribute('aria-hidden');
  loginPanel.style.display = '';
};

lockDesk();

const setStatus = (message, success = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('is-success', success);
};

const formatDate = (value) => {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const renderInquiries = (inquiries) => {
  if (!inquiries.length) {
    listNode.innerHTML = '<p class="empty-state">No inquiries yet.</p>';
    return;
  }

  listNode.innerHTML = inquiries
    .map((inquiry) => {
      const replyHref = `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(
        `Re: ${inquiry.projectType || 'Project inquiry'}`
      )}`;
      return `
        <article class="inquiry-item">
          <div class="inquiry-item-head">
            <div>
              <span class="eyebrow">${escapeHtml(inquiry.projectType || 'Project Inquiry')}</span>
              <h3>${escapeHtml(inquiry.name || 'Unnamed visitor')}</h3>
            </div>
            <span class="draft-status">${escapeHtml(inquiry.status || 'new')}</span>
          </div>
          <p class="inquiry-message">${escapeHtml(inquiry.message || 'No message provided.')}</p>
          <div class="inquiry-meta">
            <span>${escapeHtml(inquiry.email || 'No email')}</span>
            <span>${escapeHtml(inquiry.budget || 'Budget not specified')}</span>
            <span>${escapeHtml(formatDate(inquiry.createdAt))}</span>
          </div>
          <div class="inquiry-desk-actions">
            <a class="secondary-action" href="${replyHref}">Reply by email</a>
          </div>
        </article>
      `;
    })
    .join('');
};

const loadInquiries = async () => {
  listNode.innerHTML = '<p class="empty-state">Loading inquiries...</p>';
  const response = await fetch('/api/inquiries', {
    headers: {
      'X-Admin-Token': adminToken,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Inquiries could not be loaded.');
  }

  renderInquiries(data.inquiries || []);
};

const unlockDesk = async (token) => {
  setStatus('Checking passcode...');
  await auth.verifyAdminToken(token);
  adminToken = token;
  auth.saveAdminToken(token);
  loginPanel.hidden = true;
  loginPanel.setAttribute('aria-hidden', 'true');
  loginPanel.style.display = 'none';
  desk.hidden = false;
  desk.removeAttribute('aria-hidden');
  desk.style.display = '';
  await loadInquiries();
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const token = String(formData.get('passcode') || '').trim();
  if (!token) return;

  try {
    await unlockDesk(token);
  } catch (error) {
    auth.clearAdminToken();
    lockDesk();
    setStatus(error.message || 'Admin access failed.');
  }
});

refreshButton.addEventListener('click', async () => {
  try {
    await loadInquiries();
  } catch (error) {
    listNode.innerHTML = `<p class="empty-state">${error.message || 'Could not refresh inquiries.'}</p>`;
  }
});

lockButton.addEventListener('click', () => {
  auth.clearAdminToken();
  lockDesk();
  loginForm.reset();
  setStatus('Locked. Enter the admin passcode to view inquiries.');
});

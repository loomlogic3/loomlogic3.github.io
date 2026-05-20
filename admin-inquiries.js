const auth = window.loomAdminAuth;
const loginPanel = document.querySelector('[data-admin-login-panel]');
const loginForm = document.querySelector('[data-admin-login-form]');
const statusNode = document.querySelector('[data-admin-status]');
const desk = document.querySelector('[data-inquiry-desk]');
const listNode = document.querySelector('[data-inquiry-list]');
const refreshButton = document.querySelector('[data-refresh-inquiries]');
const lockButton = document.querySelector('[data-lock-inquiries]');
const filterButtons = document.querySelectorAll('[data-inquiry-filter]');

let adminToken = '';
const inquiryStatuses = ['new', 'reviewed', 'contacted', 'closed'];
let activeFilter = 'all';
let currentInquiries = [];

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
  const visibleInquiries = activeFilter === 'all'
    ? inquiries
    : inquiries.filter((inquiry) => (inquiry.status || 'new') === activeFilter);

  if (!visibleInquiries.length) {
    listNode.innerHTML = '<p class="empty-state">No inquiries yet.</p>';
    return;
  }

  listNode.innerHTML = visibleInquiries
    .map((inquiry) => {
      const replyHref = `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(
        `Re: ${inquiry.projectType || 'Project inquiry'}`
      )}`;
      const statusButtons = inquiryStatuses.map((status) => `
        <button
          class="status-chip ${status === (inquiry.status || 'new') ? 'is-active' : ''}"
          type="button"
          data-inquiry-id="${escapeHtml(inquiry.id)}"
          data-inquiry-status="${status}"
        >
          ${escapeHtml(status)}
        </button>
      `).join('');
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
          <div class="inquiry-status-controls" aria-label="Inquiry status controls">
            ${statusButtons}
          </div>
          <form class="inquiry-note-form" data-note-form data-inquiry-id="${escapeHtml(inquiry.id)}">
            <label for="note-${escapeHtml(inquiry.id)}">Private note</label>
            <textarea
              id="note-${escapeHtml(inquiry.id)}"
              name="adminNote"
              rows="3"
              placeholder="Add private follow-up notes, next steps, or client context."
            >${escapeHtml(inquiry.adminNote || '')}</textarea>
            <button class="secondary-action" type="submit">Save Note</button>
          </form>
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

  currentInquiries = data.inquiries || [];
  renderInquiries(currentInquiries);
};

const updateInquiry = async (payload) => {
  const response = await fetch('/api/inquiries', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Inquiry could not be updated.');
  }
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

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.getAttribute('data-inquiry-filter') || 'all';
    filterButtons.forEach((filterButton) => {
      filterButton.classList.toggle('is-active', filterButton === button);
    });
    renderInquiries(currentInquiries);
  });
});

listNode.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-inquiry-id][data-inquiry-status]');
  if (!button) return;

  const id = button.getAttribute('data-inquiry-id');
  const nextStatus = button.getAttribute('data-inquiry-status');
  button.disabled = true;
  button.textContent = 'Saving';

  try {
    await updateInquiry({ id, status: nextStatus });
    await loadInquiries();
  } catch (error) {
    button.disabled = false;
    button.textContent = nextStatus;
    listNode.insertAdjacentHTML(
      'afterbegin',
      `<p class="empty-state">${escapeHtml(error.message || 'Could not update inquiry status.')}</p>`
    );
  }
});

listNode.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-note-form]');
  if (!form) return;
  event.preventDefault();

  const id = form.getAttribute('data-inquiry-id');
  const textarea = form.querySelector('textarea[name="adminNote"]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving';

  try {
    await updateInquiry({ id, adminNote: textarea.value });
    button.textContent = 'Saved';
  } catch (error) {
    button.textContent = 'Try Again';
    form.insertAdjacentHTML(
      'beforeend',
      `<p class="empty-state">${escapeHtml(error.message || 'Could not save note.')}</p>`
    );
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Save Note';
    }, 900);
  }
});

lockButton.addEventListener('click', () => {
  auth.clearAdminToken();
  lockDesk();
  loginForm.reset();
  setStatus('Locked. Enter the admin passcode to view inquiries.');
});

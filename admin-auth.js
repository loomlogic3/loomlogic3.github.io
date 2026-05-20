const ADMIN_TOKEN_KEY = 'loomlogic_admin_token';

const getSavedAdminToken = () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';

const saveAdminToken = (token) => {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
};

const clearAdminToken = () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

const verifyAdminToken = async (token) => {
  const response = await fetch('/api/admin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify({ check: true }),
  });

  if (!response.ok) {
    throw new Error('Admin passcode was not accepted.');
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error('Admin passcode was not accepted.');
  }
};

window.loomAdminAuth = {
  clearAdminToken,
  getSavedAdminToken,
  saveAdminToken,
  verifyAdminToken,
};

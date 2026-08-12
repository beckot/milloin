// Milloin Client Application Logic (with Live API + Local Fallback Support)

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8787/api'
  : 'https://milloin-api.ottobecker.workers.dev/api';

// Local storage key for offline/fallback mock database
const LOCAL_STORE_KEY = 'milloin_local_db';

// State management
const state = {
  currentView: 'create',
  currentPoll: null,
  currentOptions: [],
  currentVoters: [],
  adminTokens: JSON.parse(localStorage.getItem('milloin_admin_tokens') || '{}'),
  voterTokens: JSON.parse(localStorage.getItem('milloin_voter_tokens') || '{}'),
  activeVotes: {},
};

// Local Storage Mock DB Helper (ensures app works instantly even without Cloudflare worker)
function getLocalDb() {
  return JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || '{"polls":{}, "options":{}, "voters":{}, "votes":{}}');
}

function saveLocalDb(db) {
  localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(db));
}

// DOM ELEMENTS
const viewCreate = document.getElementById('view-create');
const viewPoll = document.getElementById('view-poll');
const viewNotFound = document.getElementById('view-not-found');

const pollCreateForm = document.getElementById('poll-create-form');
const optionsList = document.getElementById('options-list');
const btnAddOption = document.getElementById('btn-add-option');

const voteSubmitForm = document.getElementById('vote-submit-form');
const voteOptionsSelectors = document.getElementById('vote-options-selectors');
const votingGridContainer = document.getElementById('voting-grid-container');

const shareUrlInput = document.getElementById('share-url-input');
const btnCopyLink = document.getElementById('btn-copy-link');

const adminBanner = document.getElementById('admin-banner');
const btnToggleLock = document.getElementById('btn-toggle-lock');

// HELPER FUNCTIONS
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

function formatDateFinnish(dateObj) {
  const days = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
  const dayName = days[dateObj.getDay()];
  const dateStr = dateObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  return `${dayName} ${dateStr} klo ${timeStr}`;
}

function generateId(len = 10) {
  return Math.random().toString(36).substring(2, 2 + len);
}

// OPTION ROW MANAGEMENT IN CREATE FORM
function createOptionRowValue(initialValue = '') {
  const row = document.createElement('div');
  row.className = 'option-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input option-input';
  input.placeholder = 'esim. Pe 14.8. klo 14:00';
  input.value = initialValue;
  input.required = true;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-row';
  removeBtn.innerHTML = '✕';
  removeBtn.title = 'Poista rivi';
  removeBtn.addEventListener('click', () => {
    if (optionsList.children.length > 1) {
      row.remove();
    } else {
      showToast('Kyselyssä on oltava vähintään yksi aikaehdotus', 'error');
    }
  });

  row.appendChild(input);
  row.appendChild(removeBtn);
  optionsList.appendChild(row);
}

function initDefaultOptions() {
  if (!optionsList) return;
  optionsList.innerHTML = '';
  const now = new Date();

  const t10 = new Date(now); t10.setDate(t10.getDate() + 1); t10.setHours(10, 0, 0, 0);
  const t14 = new Date(now); t14.setDate(t14.getDate() + 1); t14.setHours(14, 0, 0, 0);

  createOptionRowValue(formatDateFinnish(t10));
  createOptionRowValue(formatDateFinnish(t14));
}

document.getElementById('btn-add-tomorrow-10')?.addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
  createOptionRowValue(formatDateFinnish(d));
});

document.getElementById('btn-add-tomorrow-14')?.addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0);
  createOptionRowValue(formatDateFinnish(d));
});

document.getElementById('btn-add-nextweek-10')?.addEventListener('click', () => {
  const d = new Date();
  const daysUntilNextMon = ((1 + 7 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + daysUntilNextMon);
  d.setHours(10, 0, 0, 0);
  createOptionRowValue(formatDateFinnish(d));
});

btnAddOption?.addEventListener('click', () => createOptionRowValue(''));

// ROUTER & VIEW SWITCHING
function navigate() {
  const hash = window.location.hash || '#/new';

  if (hash.startsWith('#/poll/')) {
    const pollId = hash.replace('#/poll/', '').split('?')[0];
    loadPollView(pollId);
  } else {
    showView('create');
  }
}

function showView(viewName) {
  state.currentView = viewName;
  viewCreate?.classList.remove('active');
  viewPoll?.classList.remove('active');
  viewNotFound?.classList.remove('active');

  if (viewName === 'create') {
    viewCreate?.classList.add('active');
    initDefaultOptions();
  } else if (viewName === 'poll') {
    viewPoll?.classList.add('active');
  } else {
    viewNotFound?.classList.add('active');
  }
}

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', navigate);

// CREATE POLL SUBMISSION (Try API -> Fallback to Local Storage)
pollCreateForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('poll-title').value.trim();
  const description = document.getElementById('poll-desc').value.trim();
  const optionInputs = Array.from(document.querySelectorAll('.option-input'));
  const options = optionInputs.map(input => input.value.trim()).filter(val => val.length > 0);

  if (options.length === 0) {
    showToast('Lisää vähintään yksi aikaehdotus', 'error');
    return;
  }

  let cfTurnstileToken = '';
  if (window.turnstile) {
    cfTurnstileToken = window.turnstile.getResponse('#create-turnstile') || '';
  }

  const btnSubmit = document.getElementById('btn-submit-create');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Luodaan kyselyä...';

  try {
    let pollId, adminToken;

    try {
      const res = await fetch(`${API_BASE_URL}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, options, cfTurnstileToken })
      });
      if (res.ok) {
        const data = await res.json();
        pollId = data.pollId;
        adminToken = data.adminToken;
      } else {
        throw new Error('API server returned error');
      }
    } catch (apiErr) {
      console.warn('Backend API unreachable, using local storage fallback:', apiErr);
      // Fallback local mode
      pollId = generateId(10);
      adminToken = generateId(20);

      const db = getLocalDb();
      db.polls[pollId] = {
        id: pollId,
        title,
        description,
        isClosed: false,
        adminToken,
        createdAt: new Date().toISOString()
      };

      db.options[pollId] = options.map((optText, index) => ({
        id: `opt_${index}_${generateId(6)}`,
        option_text: optText,
        sort_order: index
      }));

      db.voters[pollId] = [];
      db.votes[pollId] = {};
      saveLocalDb(db);
    }

    state.adminTokens[pollId] = adminToken;
    localStorage.setItem('milloin_admin_tokens', JSON.stringify(state.adminTokens));

    showToast('Kysely luotu!', 'success');
    window.location.hash = `#/poll/${pollId}`;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Luo kysely ja hae linkki</span> <span class="btn-arrow">→</span>';
  }
});

// LOAD AND RENDER POLL VIEW (Try API -> Fallback to Local Storage)
async function loadPollView(pollId) {
  showView('poll');

  try {
    let data;
    try {
      const res = await fetch(`${API_BASE_URL}/polls/${pollId}`);
      if (res.ok) {
        data = await res.json();
      } else {
        throw new Error('Not found on API');
      }
    } catch (apiErr) {
      // Local Storage Fallback
      const db = getLocalDb();
      const poll = db.polls[pollId];
      if (!poll) {
        showView('not-found');
        return;
      }
      const options = db.options[pollId] || [];
      const voters = db.voters[pollId] || [];

      data = {
        poll: {
          id: poll.id,
          title: poll.title,
          description: poll.description,
          isClosed: poll.isClosed,
          createdAt: poll.createdAt
        },
        options,
        voters
      };
    }

    state.currentPoll = data.poll;
    state.currentOptions = data.options;
    state.currentVoters = data.voters;

    renderPollDetails(pollId);
    renderVotingGrid();
    renderVoteForm();
  } catch (err) {
    showToast(err.message, 'error');
    showView('not-found');
  }
}

function renderPollDetails(pollId) {
  const poll = state.currentPoll;
  if (!poll) return;

  document.getElementById('poll-display-title').textContent = poll.title;
  document.getElementById('poll-display-desc').textContent = poll.description || '';

  const statusBadge = document.getElementById('poll-status-badge');
  if (poll.isClosed) {
    statusBadge.className = 'badge badge-neutral';
    statusBadge.textContent = 'Suljettu';
  } else {
    statusBadge.className = 'badge badge-success';
    statusBadge.textContent = 'Avoinna';
  }

  const dateObj = new Date(poll.createdAt);
  document.getElementById('poll-created-at').textContent = `Luotu ${dateObj.toLocaleDateString('fi-FI')}`;

  const fullShareUrl = `${window.location.origin}${window.location.pathname}#/poll/${pollId}`;
  if (shareUrlInput) shareUrlInput.value = fullShareUrl;

  const adminToken = state.adminTokens[pollId];
  if (adminToken) {
    adminBanner?.classList.remove('hidden');
    if (btnToggleLock) {
      btnToggleLock.textContent = poll.isClosed ? 'Avaa kysely' : 'Sulje kysely';
      btnToggleLock.onclick = () => togglePollLock(pollId, adminToken, !poll.isClosed);
    }
  } else {
    adminBanner?.classList.add('hidden');
  }
}

function renderVotingGrid() {
  const options = state.currentOptions || [];
  const voters = state.currentVoters || [];

  const countTag = document.getElementById('voter-count-tag');
  if (countTag) countTag.textContent = `${voters.length} vastausta`;

  const totals = {};
  options.forEach(opt => { totals[opt.id] = { yes: 0, maybe: 0, no: 0 }; });

  voters.forEach(voter => {
    Object.entries(voter.votes || {}).forEach(([optId, decision]) => {
      if (totals[optId] && totals[optId][decision] !== undefined) {
        totals[optId][decision]++;
      }
    });
  });

  let winningOptionId = null;
  let maxScore = -1;

  options.forEach(opt => {
    const t = totals[opt.id];
    const score = (t.yes * 2) + t.maybe;
    if (score > maxScore && t.yes > 0) {
      maxScore = score;
      winningOptionId = opt.id;
    }
  });

  const winnerBanner = document.getElementById('winner-banner');
  if (winningOptionId) {
    const winnerOpt = options.find(o => o.id === winningOptionId);
    const textEl = document.getElementById('winner-text');
    if (textEl) textEl.textContent = winnerOpt ? winnerOpt.option_text : '';
    winnerBanner?.classList.remove('hidden');
  } else {
    winnerBanner?.classList.add('hidden');
  }

  let tableHtml = `
    <table class="poll-table">
      <thead>
        <tr>
          <th>Osallistuja</th>
          ${options.map(opt => `
            <th class="th-option ${opt.id === winningOptionId ? 'is-winner' : ''}">
              ${escapeHtml(opt.option_text)}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${voters.length === 0 ? `
          <tr>
            <td colspan="${options.length + 1}" style="text-align:center; padding: 2rem; color: var(--text-dim);">
              Ei vielä vastauksia. Ole ensimmäinen ja ilmoita sopivuutesi alla!
            </td>
          </tr>
        ` : voters.map(v => `
          <tr>
            <td><strong>${escapeHtml(v.name)}</strong></td>
            ${options.map(opt => {
              const decision = (v.votes || {})[opt.id] || 'no';
              let badgeClass = 'vote-cell-no';
              let symbol = '✕';
              if (decision === 'yes') { badgeClass = 'vote-cell-yes'; symbol = '✓'; }
              if (decision === 'maybe') { badgeClass = 'vote-cell-maybe'; symbol = '(✓)'; }
              return `<td class="${badgeClass}">${symbol}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr class="summary-row">
          <td><strong>Yhteensä (Sopii)</strong></td>
          ${options.map(opt => `
            <td>
              <strong style="color: var(--yes-color);">${totals[opt.id]?.yes || 0}</strong>
              ${(totals[opt.id]?.maybe || 0) > 0 ? `<span style="color: var(--maybe-color); font-size: 0.85rem;"> (+${totals[opt.id].maybe})</span>` : ''}
            </td>
          `).join('')}
        </tr>
      </tfoot>
    </table>
  `;

  if (votingGridContainer) votingGridContainer.innerHTML = tableHtml;
}

function renderVoteForm() {
  const poll = state.currentPoll;
  const options = state.currentOptions || [];
  const formContainer = document.getElementById('vote-form-container');
  if (!formContainer || !poll) return;

  if (poll.isClosed) {
    formContainer.innerHTML = '<p class="text-center" style="color: var(--text-muted);">Äänestys on suljettu.</p>';
    return;
  }

  const savedToken = state.voterTokens[poll.id];
  const existingVoter = savedToken ? (state.currentVoters || []).find(v => v.token === savedToken) : null;

  const voterInput = document.getElementById('voter-name');
  if (voterInput) {
    if (existingVoter) {
      voterInput.value = existingVoter.name;
      state.activeVotes = { ...existingVoter.votes };
      const titleEl = document.getElementById('vote-form-title');
      if (titleEl) titleEl.textContent = 'Päivitä vastauksesi';
    } else {
      state.activeVotes = {};
      options.forEach(opt => { state.activeVotes[opt.id] = 'yes'; });
    }
  }

  if (voteOptionsSelectors) {
    voteOptionsSelectors.innerHTML = options.map(opt => {
      const currentVal = state.activeVotes[opt.id] || 'yes';
      return `
        <div class="vote-option-item">
          <span class="vote-option-title">${escapeHtml(opt.option_text)}</span>
          <div class="toggle-group" data-option-id="${opt.id}">
            <button type="button" class="toggle-btn ${currentVal === 'yes' ? 'active-yes' : ''}" data-val="yes">Sopii ✓</button>
            <button type="button" class="toggle-btn ${currentVal === 'maybe' ? 'active-maybe' : ''}" data-val="maybe">Ehkä (✓)</button>
            <button type="button" class="toggle-btn ${currentVal === 'no' ? 'active-no' : ''}" data-val="no">Ei sovi ✕</button>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.toggle-group').forEach(group => {
      const optionId = group.dataset.optionId;
      group.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.val;
          state.activeVotes[optionId] = val;
          group.querySelectorAll('.toggle-btn').forEach(b => { b.className = 'toggle-btn'; });
          btn.classList.add(`active-${val}`);
        });
      });
    });
  }
}

// VOTE SUBMISSION (Try API -> Fallback to Local Storage)
voteSubmitForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const voterName = document.getElementById('voter-name').value.trim();
  if (!voterName) {
    showToast('Syötä nimesi', 'error');
    return;
  }

  const pollId = state.currentPoll.id;
  const voterToken = state.voterTokens[pollId] || generateId(16);

  let cfTurnstileToken = '';
  if (window.turnstile) {
    cfTurnstileToken = window.turnstile.getResponse('#vote-turnstile') || '';
  }

  const btnSubmit = document.getElementById('btn-submit-vote');
  btnSubmit.disabled = true;

  try {
    try {
      const res = await fetch(`${API_BASE_URL}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterName, voterToken, votes: state.activeVotes, cfTurnstileToken })
      });
      if (!res.ok) throw new Error('API vote submission failed');
    } catch (apiErr) {
      console.warn('API unreachable, saving vote locally:', apiErr);
      const db = getLocalDb();
      if (!db.voters[pollId]) db.voters[pollId] = [];

      const existingIndex = db.voters[pollId].findIndex(v => v.token === voterToken || v.name === voterName);
      const voterRecord = { id: `vtr_${generateId(6)}`, name: voterName, token: voterToken, votes: state.activeVotes };

      if (existingIndex >= 0) {
        db.voters[pollId][existingIndex] = voterRecord;
      } else {
        db.voters[pollId].push(voterRecord);
      }
      saveLocalDb(db);
    }

    state.voterTokens[pollId] = voterToken;
    localStorage.setItem('milloin_voter_tokens', JSON.stringify(state.voterTokens));

    showToast('Vastauksesi on tallennettu!', 'success');
    loadPollView(pollId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSubmit.disabled = false;
  }
});

async function togglePollLock(pollId, adminToken, isClosed) {
  try {
    try {
      const res = await fetch(`${API_BASE_URL}/polls/${pollId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
        body: JSON.stringify({ isClosed })
      });
      if (!res.ok) throw new Error('Lock API failed');
    } catch (apiErr) {
      const db = getLocalDb();
      if (db.polls[pollId]) {
        db.polls[pollId].isClosed = isClosed;
        saveLocalDb(db);
      }
    }

    showToast(isClosed ? 'Kysely suljettu' : 'Kysely avattu uudelleen', 'success');
    loadPollView(pollId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

btnCopyLink?.addEventListener('click', () => {
  if (!shareUrlInput) return;
  shareUrlInput.select();
  navigator.clipboard.writeText(shareUrlInput.value);
  const copyBtnText = document.getElementById('copy-btn-text');
  if (copyBtnText) {
    copyBtnText.textContent = 'Kopioitu! ✓';
    setTimeout(() => { copyBtnText.textContent = 'Kopioi linkki'; }, 2000);
  }
});

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

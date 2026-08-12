// milloin — Plain, Rustic Meeting Date Scheduler Logic

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8787/api'
  : 'https://milloin-api.ottobecker.workers.dev/api';

const LOCAL_STORE_KEY = 'milloin_local_db';

// State Management
const state = {
  currentView: 'create',
  currentPoll: null,
  currentOptions: [],
  currentVoters: [],
  adminTokens: JSON.parse(localStorage.getItem('milloin_admin_tokens') || '{}'),
  voterTokens: JSON.parse(localStorage.getItem('milloin_voter_tokens') || '{}'),
  activeVotes: {},
};

// Visual Calendar State
const calendarState = {
  currentDate: new Date(),
  selectedDates: new Set(), // Set of YYYY-MM-DD strings
};

function getLocalDb() {
  return JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || '{"polls":{}, "options":{}, "voters":{}, "votes":{}}');
}

function saveLocalDb(db) {
  localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(db));
}

// DOM Elements
const viewCreate = document.getElementById('view-create');
const viewPoll = document.getElementById('view-poll');
const viewNotFound = document.getElementById('view-not-found');

const pollCreateForm = document.getElementById('poll-create-form');
const calendarDaysGrid = document.getElementById('calendar-days-grid');
const calMonthLabel = document.getElementById('cal-month-label');
const btnCalPrev = document.getElementById('cal-prev-month');
const btnCalNext = document.getElementById('cal-next-month');
const selectedDatesList = document.getElementById('selected-dates-list');
const selectedDatesCount = document.getElementById('selected-dates-count');

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

function formatFinnishDateString(dateObj) {
  const days = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
  const months = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta', 'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta'];
  const dayName = days[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const monthName = months[dateObj.getMonth()];
  return `${dayName} ${dayNum}. ${monthName}`;
}

function formatDateISO(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateId(len = 10) {
  return Math.random().toString(36).substring(2, 2 + len);
}

// VISUAL CALENDAR PICKER LOGIC
function renderCalendar() {
  if (!calendarDaysGrid || !calMonthLabel) return;

  const year = calendarState.currentDate.getFullYear();
  const month = calendarState.currentDate.getMonth();

  const monthNames = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];
  calMonthLabel.textContent = `${monthNames[month]} ${year}`;

  calendarDaysGrid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Finnish week starts on Monday (0 = Mon, 6 = Sun)
  let startingDayOfWeek = firstDay.getDay() - 1;
  if (startingDayOfWeek === -1) startingDayOfWeek = 6;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fill empty cells for days before the 1st
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell is-empty';
    calendarDaysGrid.appendChild(emptyCell);
  }

  // Render month days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const cellDate = new Date(year, month, day);
    const dateIso = formatDateISO(cellDate);

    const dayCell = document.createElement('div');
    dayCell.className = 'cal-day-cell';
    dayCell.textContent = day;

    if (cellDate < today) {
      dayCell.classList.add('is-past');
    } else {
      if (calendarState.selectedDates.has(dateIso)) {
        dayCell.classList.add('is-selected');
      }

      dayCell.addEventListener('click', () => {
        if (calendarState.selectedDates.has(dateIso)) {
          calendarState.selectedDates.delete(dateIso);
        } else {
          calendarState.selectedDates.add(dateIso);
        }
        renderCalendar();
        renderSelectedDateChips();
      });
    }

    calendarDaysGrid.appendChild(dayCell);
  }
}

function renderSelectedDateChips() {
  if (!selectedDatesList || !selectedDatesCount) return;

  const dates = Array.from(calendarState.selectedDates).sort();
  selectedDatesCount.textContent = `${dates.length} päivää valittu`;

  if (dates.length === 0) {
    selectedDatesList.innerHTML = '<span class="empty-dates-hint">Klikkaa päiviä yllä olevasta kalenterista ehdottaaksesi niitä.</span>';
    return;
  }

  selectedDatesList.innerHTML = dates.map(dateIso => {
    const [y, m, d] = dateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formatted = formatFinnishDateString(dateObj);
    return `
      <span class="date-chip">
        <span>${formatted}</span>
        <button type="button" class="btn-remove-chip" data-date="${dateIso}">✕</button>
      </span>
    `;
  }).join('');

  selectedDatesList.querySelectorAll('.btn-remove-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dateIso = btn.dataset.date;
      calendarState.selectedDates.delete(dateIso);
      renderCalendar();
      renderSelectedDateChips();
    });
  });
}

btnCalPrev?.addEventListener('click', () => {
  calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
  renderCalendar();
});

btnCalNext?.addEventListener('click', () => {
  calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
  renderCalendar();
});

// ROUTER & NAVIGATION
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
    calendarState.selectedDates.clear();
    renderCalendar();
    renderSelectedDateChips();
  } else if (viewName === 'poll') {
    viewPoll?.classList.add('active');
  } else {
    viewNotFound?.classList.add('active');
  }
}

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', navigate);

// POLL CREATION HANDLER
pollCreateForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('poll-title').value.trim();
  const description = document.getElementById('poll-desc').value.trim();
  const ownerEmail = document.getElementById('owner-email')?.value.trim();
  const creatorPasscode = document.getElementById('creator-passcode')?.value.trim();

  const selectedDates = Array.from(calendarState.selectedDates).sort();
  if (selectedDates.length === 0) {
    showToast('Valitse vähintään yksi päivämäärä kalenterista', 'error');
    return;
  }

  // Map dates to Finnish text options
  const options = selectedDates.map(dateIso => {
    const [y, m, d] = dateIso.split('-').map(Number);
    return formatFinnishDateString(new Date(y, m - 1, d));
  });

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
        body: JSON.stringify({ title, description, options, ownerEmail, creatorPasscode, cfTurnstileToken })
      });
      if (res.ok) {
        const data = await res.json();
        pollId = data.pollId;
        adminToken = data.adminToken;
      } else {
        throw new Error('API server returned error');
      }
    } catch (apiErr) {
      console.warn('API unreachable, using local storage fallback:', apiErr);
      pollId = generateId(10);
      adminToken = creatorPasscode || generateId(20);

      const db = getLocalDb();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      db.polls[pollId] = {
        id: pollId,
        title,
        description,
        ownerEmail,
        isClosed: false,
        adminToken,
        createdAt,
        expiresAt
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

// LOAD AND RENDER POLL VIEW
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
      const db = getLocalDb();
      const poll = db.polls[pollId];
      if (!poll) {
        showView('not-found');
        return;
      }
      data = {
        poll: {
          id: poll.id,
          title: poll.title,
          description: poll.description,
          isClosed: poll.isClosed,
          createdAt: poll.createdAt,
          expiresAt: poll.expiresAt
        },
        options: db.options[pollId] || [],
        voters: db.voters[pollId] || []
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

// VOTE SUBMISSION
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

const socket = io();

const screenContent = document.getElementById('screen-content');
const participantsCount = document.getElementById('participants-count');
const answeredCount = document.getElementById('answered-count');
const timeLeftEl = document.getElementById('time-left');
const phaseLabel = document.getElementById('phase-label');
const leaderboardList = document.getElementById('leaderboard-list');

const startGameBtn = document.getElementById('start-game-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');
const showResultsBtn = document.getElementById('show-results-btn');
const resetGameBtn = document.getElementById('reset-game-btn');

const state = {
  phase: 'waiting',
  currentQuestion: null,
  timeLeft: 0,
  totalTime: 20,
  leaderboard: [],
  playersCount: 0,
  answeredCount: 0,
  lastEvent: null
};

function renderWaitingState() {
  screenContent.innerHTML = `
    <div class="screen-ready">
      <div class="badge">מוכן למשחק</div>
      <h1>קליקרים</h1>
      <p class="subtitle">המערכת מוכנה. כשתהיה מוכן, לחץ על "התחל משחק" כדי לפתוח את השאלה הראשונה.</p>
      <button id="start-screen-btn" class="primary">התחל משחק</button>
    </div>
  `;

  const startScreenBtn = document.getElementById('start-screen-btn');
  if (startScreenBtn) {
    startScreenBtn.addEventListener('click', () => socket.emit('admin:start-game'));
  }
}

function renderQuestionState() {
  const question = state.currentQuestion;
  if (!question) {
    renderWaitingState();
    return;
  }

  const progress = (state.timeLeft / state.totalTime) * 360;
  const ringStyle = `background: conic-gradient(var(--accent) ${Math.max(0, progress)}deg, rgba(56, 189, 248, 0.15) 0deg);`;

  const options = Object.entries(question.options)
    .map(([letter, text]) => `
      <div class="option-card">
        <span class="letter">${letter}</span>
        <span>${text}</span>
      </div>
    `)
    .join('');

  screenContent.innerHTML = `
    <div class="screen-question">
      <div class="timer-ring" style="${ringStyle}">
        <div class="timer-ring-inner">${state.timeLeft}</div>
      </div>

      <div class="question-section">
        <h1>${question.text}</h1>
        <div class="options-grid">${options}</div>
      </div>

      <div class="answers-summary">
        <span class="badge-warning">התקשרו וקישו 1-4</span>
        <span class="badge-success">נענו: ${state.answeredCount}</span>
      </div>
    </div>
  `;
}

function renderResultsState() {
  const question = state.currentQuestion;
  if (!question) {
    renderWaitingState();
    return;
  }

  const correctAnswer = question.correctAnswer;
  const correctCount = state.leaderboard.filter((player) => {
    const answer = player.lastAnswer;
    return typeof answer === 'number' && ['A', 'B', 'C', 'D'][answer - 1] === correctAnswer;
  }).length;

  screenContent.innerHTML = `
    <div class="screen-results">
      <div class="badge">תוצאות</div>
      <h1>התשובה הנכונה: ${correctAnswer}</h1>
      <p class="subtitle">${question.options[correctAnswer]} </p>
      <div class="answers-summary">
        <span class="badge-success">ענו נכון: ${correctCount}</span>
        <span class="badge-warning">שחקנים: ${state.playersCount}</span>
      </div>
      <div class="leaderboard-box" style="width: min(760px, 100%);">
        <p class="label">מובילים</p>
        <ol>
          ${state.leaderboard
            .slice(0, 5)
            .map((player, index) => `
              <li>
                <span class="rank">#${index + 1}</span>
                <span class="row-name">${player.phone}</span>
                <span class="row-score">${player.score} נק'</span>
              </li>
            `)
            .join('') || '<li><span>אין עדיין תוצאות</span></li>'}
        </ol>
      </div>
    </div>
  `;
}

function renderLeaderboard() {
  leaderboardList.innerHTML = state.leaderboard
    .slice(0, 8)
    .map((player, index) => `
      <li>
        <span class="rank">#${index + 1}</span>
        <span class="row-name">${player.phone}</span>
        <span class="row-score">${player.score}</span>
      </li>
    `)
    .join('');
}

function render() {
  participantsCount.textContent = state.playersCount;
  answeredCount.textContent = state.answeredCount;
  timeLeftEl.textContent = state.timeLeft;

  if (state.phase === 'waiting') {
    phaseLabel.textContent = 'ממתין';
    renderWaitingState();
  } else if (state.phase === 'active') {
    phaseLabel.textContent = 'שאלה פעילה';
    renderQuestionState();
  } else if (state.phase === 'results') {
    phaseLabel.textContent = 'תוצאות';
    renderResultsState();
  }

  renderLeaderboard();
}

socket.on('state', (nextState) => {
  Object.assign(state, nextState);
  render();
});

startGameBtn.addEventListener('click', () => socket.emit('admin:start-game'));
nextQuestionBtn.addEventListener('click', () => socket.emit('admin:next-question'));
showResultsBtn.addEventListener('click', () => socket.emit('admin:show-results'));
resetGameBtn.addEventListener('click', () => socket.emit('admin:reset-game'));

renderWaitingState();
renderLeaderboard();

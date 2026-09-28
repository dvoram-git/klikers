const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const QUESTIONS = [
  {
    id: 1,
    text: 'איזה יוזמה מהווה דוגמה טובה לשיפור חוויית הלקוח במקום העבודה?',
    options: {
      A: 'הפחתת זמני המתנה באמצעות אוטומציה',
      B: 'הגדלת מספר המפגשים ללא תועלת',
      C: 'הפסקת קשר עם לקוחות',
      D: 'השארת תהליכים ידניים בכל שלב'
    },
    correctAnswer: 'A'
  },
  {
    id: 2,
    text: 'מהי הדרך היעילה ביותר לייצר מוטיבציה בקהל באירוע?',
    options: {
      A: 'לספק חוויית השתתפות דינמית ומשחקית',
      B: 'לשמור הכל בסוד',
      C: 'לצמצם את האינטראקציה',
      D: 'להעביר רק חומר תיאורטי'
    },
    correctAnswer: 'A'
  },
  {
    id: 3,
    text: 'איזה מאפיין חשוב ביותר למערכת קלאבר-אינטרקטיבית?',
    options: {
      A: 'תגובה מיידית וחדות בזמן אמת',
      B: 'עמידה רק בסוף האירוע',
      C: 'היעדר לוח תוצאות',
      D: 'אכיפה ידנית בלבד'
    },
    correctAnswer: 'A'
  },
  {
    id: 4,
    text: 'מה חשוב לעשות כאשר מסיימים שאלה ולפני מעבר לשאלה הבאה?',
    options: {
      A: 'להציג את התשובה הנכונה ולסכם את התוצאה',
      B: 'למחוק את כל השחקנים',
      C: 'להתחיל בשאלה חדשה בלי הודעה',
      D: 'לשנות את הניקוד ללא סימון'
    },
    correctAnswer: 'A'
  }
];

const gameState = {
  phase: 'waiting',
  currentQuestionIndex: -1,
  currentQuestion: null,
  timeLeft: 0,
  totalTime: 20,
  players: new Map(),
  timer: null,
  lastEvent: null
};

function getNormalizedPhone(value) {
  if (!value && value !== 0) return '';
  return String(value).replace(/\D/g, '');
}

function getAnswerLetterFromDigit(digit) {
  const normalized = Number(digit);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 4) return null;
  return ['A', 'B', 'C', 'D'][normalized - 1];
}

function getLeaderboard() {
  return [...gameState.players.values()]
    .sort((a, b) => b.score - a.score || b.correctAnswers - a.correctAnswers)
    .map((player) => ({
      phone: player.phone,
      score: player.score,
      correctAnswers: player.correctAnswers,
      totalAnswers: player.totalAnswers,
      lastAnswer: player.lastAnswer || null,
      answeredCurrentQuestion: player.answeredCurrentQuestion
    }));
}

function clearActiveQuestionFlags() {
  for (const player of gameState.players.values()) {
    player.answeredCurrentQuestion = false;
    player.lastAnswer = null;
  }
}

function serializeState() {
  return {
    phase: gameState.phase,
    currentQuestionIndex: gameState.currentQuestionIndex,
    currentQuestion: gameState.currentQuestion,
    timeLeft: gameState.timeLeft,
    totalTime: gameState.totalTime,
    leaderboard: getLeaderboard(),
    playersCount: gameState.players.size,
    answeredCount: [...gameState.players.values()].filter((p) => p.answeredCurrentQuestion).length,
    lastEvent: gameState.lastEvent
  };
}

function broadcastState() {
  io.emit('state', serializeState());
}

function getPlayer(phone) {
  const normalized = getNormalizedPhone(phone);
  if (!normalized) {
    return null;
  }

  if (!gameState.players.has(normalized)) {
    gameState.players.set(normalized, {
      phone: normalized,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      answeredCurrentQuestion: false,
      currentQuestionIndex: -1,
      lastAnswer: null,
      lastAnsweredAt: null,
      joinedAt: Date.now()
    });
  }

  return gameState.players.get(normalized);
}

function startQuestion(index) {
  if (index < 0 || index >= QUESTIONS.length) {
    gameState.phase = 'waiting';
    gameState.currentQuestionIndex = -1;
    gameState.currentQuestion = null;
    gameState.timeLeft = 0;
    clearInterval(gameState.timer);
    gameState.timer = null;
    gameState.lastEvent = 'No more questions';
    broadcastState();
    return;
  }

  const question = QUESTIONS[index];
  gameState.phase = 'active';
  gameState.currentQuestionIndex = index;
  gameState.currentQuestion = { ...question };
  gameState.timeLeft = gameState.totalTime;
  clearActiveQuestionFlags();

  clearInterval(gameState.timer);
  gameState.timer = setInterval(() => {
    if (gameState.phase !== 'active') {
      return;
    }

    gameState.timeLeft -= 1;
    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      gameState.timer = null;
      revealResults();
      return;
    }

    broadcastState();
  }, 1000);

  gameState.lastEvent = `Question ${index + 1} started`;
  io.emit('question:started', { question: gameState.currentQuestion, timeLeft: gameState.timeLeft });
  broadcastState();
}

function revealResults() {
  if (gameState.phase !== 'active' || !gameState.currentQuestion) {
    return;
  }

  const correctLetter = gameState.currentQuestion.correctAnswer;
  const correctCount = [...gameState.players.values()].filter((player) => {
    if (!player.answeredCurrentQuestion) return false;
    return getAnswerLetterFromDigit(player.lastAnswer) === correctLetter;
  }).length;

  gameState.phase = 'results';
  gameState.lastEvent = `Question ${gameState.currentQuestionIndex + 1} finished`;
  io.emit('question:results', {
    question: gameState.currentQuestion,
    correctAnswer: correctLetter,
    correctCount,
    totalAnswered: [...gameState.players.values()].filter((player) => player.answeredCurrentQuestion).length
  });
  broadcastState();
}

function startGame() {
  if (QUESTIONS.length === 0) {
    gameState.lastEvent = 'No questions configured';
    broadcastState();
    return;
  }

  startQuestion(0);
}

function nextQuestion() {
  if (gameState.phase === 'waiting' && gameState.currentQuestionIndex === -1) {
    startGame();
    return;
  }

  if (gameState.currentQuestionIndex < QUESTIONS.length - 1) {
    startQuestion(gameState.currentQuestionIndex + 1);
    return;
  }

  gameState.phase = 'waiting';
  gameState.currentQuestionIndex = -1;
  gameState.currentQuestion = null;
  gameState.timeLeft = 0;
  gameState.lastEvent = 'Game finished';
  clearInterval(gameState.timer);
  gameState.timer = null;
  broadcastState();
}

function resetGame() {
  clearInterval(gameState.timer);
  gameState.timer = null;
  gameState.phase = 'waiting';
  gameState.currentQuestionIndex = -1;
  gameState.currentQuestion = null;
  gameState.timeLeft = 0;
  gameState.lastEvent = 'Game reset';

  for (const player of gameState.players.values()) {
    player.score = 0;
    player.correctAnswers = 0;
    player.totalAnswers = 0;
    player.answeredCurrentQuestion = false;
    player.currentQuestionIndex = -1;
    player.lastAnswer = null;
  }

  broadcastState();
}

io.on('connection', (socket) => {
  socket.emit('state', serializeState());

  socket.on('admin:start-game', () => {
    startGame();
  });

  socket.on('admin:next-question', () => {
    nextQuestion();
  });

  socket.on('admin:reset-game', () => {
    resetGame();
  });

  socket.on('admin:show-results', () => {
    revealResults();
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'running',
    phase: gameState.phase,
    currentQuestionIndex: gameState.currentQuestionIndex,
    players: gameState.players.size
  });
});

app.post('/api/ivr/callback', (req, res) => {
  const { phone, callerId, phoneNumber, digit } = req.body || {};
  const normalizedPhone = getNormalizedPhone(phone || callerId || phoneNumber);
  const answerDigit = Number(digit);

  if (!normalizedPhone) {
    return res.status(400).json({ ok: false, error: 'Missing phone number' });
  }

  if (!Number.isInteger(answerDigit) || answerDigit < 1 || answerDigit > 4) {
    return res.status(400).json({ ok: false, error: 'Digit must be an integer between 1 and 4' });
  }

  if (gameState.phase !== 'active' || !gameState.currentQuestion) {
    return res.status(200).json({
      ok: false,
      message: 'No active question at the moment',
      phase: gameState.phase
    });
  }

  const player = getPlayer(normalizedPhone);
  if (!player) {
    return res.status(500).json({ ok: false, error: 'Unable to create player state' });
  }

  const currentIndex = gameState.currentQuestionIndex;
  if (player.answeredCurrentQuestion && player.currentQuestionIndex === currentIndex) {
    return res.status(200).json({
      ok: false,
      message: 'Caller already answered this question',
      phone: player.phone,
      score: player.score
    });
  }

  const selectedLetter = getAnswerLetterFromDigit(answerDigit);
  const isCorrect = selectedLetter === gameState.currentQuestion.correctAnswer;
  const speedBonus = Math.max(0, Math.ceil(gameState.timeLeft * 2));

  player.answeredCurrentQuestion = true;
  player.currentQuestionIndex = currentIndex;
  player.lastAnswer = answerDigit;
  player.lastAnsweredAt = Date.now();
  player.totalAnswers += 1;

  if (isCorrect) {
    player.score += 10 + speedBonus;
    player.correctAnswers += 1;
  }

  gameState.lastEvent = `Answer received from ${player.phone}`;

  io.emit('player:answer', {
    phone: player.phone,
    selectedLetter,
    selectedDigit: answerDigit,
    isCorrect,
    score: player.score,
    timeLeft: gameState.timeLeft,
    questionIndex: currentIndex
  });

  broadcastState();

  return res.status(200).json({
    ok: true,
    phone: player.phone,
    selectedLetter,
    isCorrect,
    score: player.score,
    timeLeft: gameState.timeLeft,
    message: isCorrect ? 'Correct answer' : 'Incorrect answer'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Quiz server running on http://localhost:${PORT}`);
});

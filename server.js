const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const ROOM = 'study-room';
const DEFAULT_DURATION_MS = 25 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 1000;

app.use(express.static(path.join(__dirname, 'public')));

// The server owns the timer state. While running, endAt is the authoritative
// deadline; clients derive remaining time from it instead of counting ticks.
const timer = {
  durationMs: DEFAULT_DURATION_MS,
  remainingMs: DEFAULT_DURATION_MS,
  running: false,
  endAt: null,
};

function getTimerSnapshot() {
  const remainingMs = timer.running
    ? Math.max(0, timer.endAt - Date.now())
    : timer.remainingMs;

  return {
    durationMs: timer.durationMs,
    remainingMs,
    running: timer.running,
    // A running client can calculate the exact current countdown from this.
    endAt: timer.running ? timer.endAt : null,
    serverNow: Date.now(),
  };
}

function broadcastTimer() {
  io.to(ROOM).emit('timer:update', getTimerSnapshot());
}

function stopTimerAtZero() {
  timer.remainingMs = 0;
  timer.running = false;
  timer.endAt = null;
  broadcastTimer();
}

// This interval only detects completion and publishes periodic synchronization
// snapshots. It does not decrement the timer, so event-loop delays do not drift.
const timerInterval = setInterval(() => {
  if (!timer.running) return;

  if (Date.now() >= timer.endAt) {
    stopTimerAtZero();
  } else {
    broadcastTimer();
  }
}, 1000);

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

io.on('connection', (socket) => {
  socket.data.username = 'Guest';
  socket.join(ROOM);
  socket.emit('timer:update', getTimerSnapshot());

  socket.on('user:join', (value) => {
    const username = cleanText(value, 24) || 'Guest';
    socket.data.username = username;
    socket.emit('user:joined', { username });
  });

  socket.on('timer:control', (action) => {
    if (action === 'start') {
      if (!timer.running && timer.remainingMs > 0) {
        timer.running = true;
        timer.endAt = Date.now() + timer.remainingMs;
      }
    } else if (action === 'pause') {
      if (timer.running) {
        timer.remainingMs = Math.max(0, timer.endAt - Date.now());
        timer.running = false;
        timer.endAt = null;
      }
    } else if (action === 'reset') {
      timer.running = false;
      timer.endAt = null;
      timer.remainingMs = timer.durationMs;
    } else {
      return;
    }

    // A start/pause/reset applies to the whole room and immediately syncs all.
    broadcastTimer();
  });

  socket.on('chat:message', (value) => {
    const text = cleanText(value, MAX_MESSAGE_LENGTH);
    if (!text) return;

    io.to(ROOM).emit('chat:message', {
      username: socket.data.username,
      text,
      timestamp: new Date().toISOString(),
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Study room is running at http://localhost:${PORT}`);
});

// Cleanly release the timer handle if this module is stopped programmatically.
function shutdown() {
  clearInterval(timerInterval);
  httpServer.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

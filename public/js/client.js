(() => {
  const socket = io();
  const timerElement = document.getElementById('timer');
  const timerCaption = document.getElementById('timer-caption');
  const startButton = document.getElementById('start-button');
  const pauseButton = document.getElementById('pause-button');
  const resetButton = document.getElementById('reset-button');
  const chatLog = document.getElementById('chat-log');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message-input');
  const nameDialog = document.getElementById('name-dialog');
  const nameForm = document.getElementById('name-form');
  const usernameInput = document.getElementById('username-input');
  const guestButton = document.getElementById('guest-button');
  const themeButton = document.getElementById('theme-button');

  let username = localStorage.getItem('studyRoomUsername') || '';
  let timerState = { remainingMs: 25 * 60 * 1000, running: false, endAt: null };
  let renderTimerId;

  function currentRemainingMs() {
    if (!timerState.running || !timerState.endAt) return timerState.remainingMs;
    return Math.max(0, timerState.endAt - Date.now());
  }

  function renderTimer() {
    const remainingMs = currentRemainingMs();
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timerCaption.textContent = timerState.running
      ? 'You’re in a focus session'
      : (remainingMs === 0 ? 'Session complete — nice work' : (remainingMs === 25 * 60 * 1000 ? 'Ready when you are' : 'Session paused'));

    // Keep the browser's tab title useful while the timer is active.
    document.title = `${timerElement.textContent} · Study Room`;
  }

  socket.on('timer:update', (state) => {
    timerState = {
      ...state,
      // The server sends an absolute deadline, so refreshes and missed ticks
      // immediately catch up without relying on a local decrementing counter.
      endAt: state.running ? state.endAt : null,
    };
    renderTimer();
  });

  startButton.addEventListener('click', () => socket.emit('timer:control', 'start'));
  pauseButton.addEventListener('click', () => socket.emit('timer:control', 'pause'));
  resetButton.addEventListener('click', () => socket.emit('timer:control', 'reset'));

  function formatTime(isoTimestamp) {
    const date = new Date(isoTimestamp);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function renderMessage(message) {
    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.remove();

    const wrapper = document.createElement('article');
    wrapper.className = `message${message.username === username ? ' own' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = message.username;
    const time = document.createElement('time');
    time.dateTime = message.timestamp;
    time.textContent = formatTime(message.timestamp);
    meta.append(author, time);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    // textContent keeps chat content inert and prevents injected markup.
    bubble.textContent = message.text;
    wrapper.append(meta, bubble);
    chatLog.append(wrapper);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  socket.on('chat:message', renderMessage);

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit('chat:message', text);
    messageInput.value = '';
    messageInput.focus();
  });

  function joinRoom(name) {
    username = name.trim().slice(0, 24) || 'Guest';
    localStorage.setItem('studyRoomUsername', username);
    socket.emit('user:join', username);
    if (nameDialog.open) nameDialog.close();
  }

  nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    joinRoom(usernameInput.value);
  });
  guestButton.addEventListener('click', () => joinRoom('Guest'));

  if (username) {
    socket.emit('user:join', username);
  } else if (typeof nameDialog.showModal === 'function') {
    nameDialog.showModal();
  } else {
    const enteredName = window.prompt('What should we call you?') || 'Guest';
    joinRoom(enteredName);
  }

  themeButton.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('studyRoomTheme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });
  if (localStorage.getItem('studyRoomTheme') === 'dark') document.body.classList.add('dark');

  renderTimer();
  renderTimerId = window.setInterval(renderTimer, 200);
  window.addEventListener('beforeunload', () => window.clearInterval(renderTimerId));
})();

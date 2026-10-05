class MafiaGame {
  constructor() {
    this.state = null; this.socket = null; this.user = null; this.room = null; this.mode = 'auth';
    this.sounds = new Map(); this.music = new Map(); this.timerId = null;
    this.render(); this.loadSettings(); this.checkAuth();
  }
  async checkAuth() {
    const r = await fetch('/api/me');
    const data = await r.json();
    if (data.user) { this.user = data.user; this.enterMenu(); this.connectSocket(); }
    else this.renderAuth();
  }
  connectSocket() {
    this.socket = io({ reconnection: true });
    this.socket.on('state', d => { this.state = d; this.render(); });
    this.socket.on('roleAssigned', () => this.play('role'));
    this.socket.on('playerDied', d => this.play('death'));
    this.socket.on('gameEnded', d => { this.play('win'); this.render(); });
    this.socket.on('phaseChanged', d => this.play('phase'));
    this.socket.on('chat', d => { if (!this.state.chat[d.ch]) this.state.chat[d.ch] = []; this.state.chat[d.ch].push(d); this.render(); });
    this.socket.on('kick', d => { alert(d.reason); this.enterMenu(); });
    this.socket.on('closed', () => { alert('Комната закрыта'); this.enterMenu(); });
    this.socket.on('toast', d => this.showToast(d.text));
    this.socket.on('rejoinAvailable', d => { this.room = d.code; this.socket.emit('reconnect', { code: d.code }); });
  }
  render() {
    const app = document.getElementById('app') || document.createElement('div');
    app.id = 'app';
    if (this.mode === 'auth') app.innerHTML = this.renderAuth();
    else if (this.mode === 'menu') app.innerHTML = this.renderMenu();
    else if (this.mode === 'lobby') app.innerHTML = this.renderLobby();
    else if (this.mode === 'game') app.innerHTML = this.renderGame();
    else if (this.mode === 'local') app.innerHTML = this.renderLocal();
    document.body.innerHTML = ''; document.body.appendChild(app);
    this.attachHandlers();
  }
  renderAuth() {
    const [tab, login, nick, pass, pass2, err] = ['login', '', '', '', '', ''];
    const loginTab = () => `<div class="form-group"><label>Логин</label><input type="text" id="username" placeholder="3-20 символов"></div><div class="form-group"><label>Пароль</label><input type="password" id="password" placeholder="8+ символов, буква и цифра"></div>${err ? `<div class="auth-error">${err}</div>` : ''}<button onclick="window.game.doLogin()" style="width:100%;margin-top:15px">ВОЙТИ</button><div class="auth-links"><span onclick="window.game.mode='auth';window.game.render()">Регистрация</span><a>Забыли пароль?</a></div>`;
    const registerTab = () => `<div class="form-group"><label>Логин</label><input type="text" id="username" placeholder="3-20 символов, только латиница и _"></div><div class="form-group"><label>Никнейм</label><input type="text" id="nickname" placeholder="2-16 символов"></div><div class="form-group"><label>Пароль</label><input type="password" id="password" placeholder="8+ символов, буква и цифра"></div><div class="form-group"><label>Повторить пароль</label><input type="password" id="password2"></div>${err ? `<div class="auth-error">${err}</div>` : ''}<button onclick="window.game.doRegister()" style="width:100%;margin-top:15px">СОЗДАТЬ АККАУНТ</button>`;
    return `<div class="auth-screen"><div class="auth-form"><h2>🎭 MAFIA ONLINE</h2><div class="auth-tabs"><button id="loginTab" class="active" onclick="window.game.switchAuthTab('login')">Вход</button><button id="registerTab" onclick="window.game.switchAuthTab('register')">Регистрация</button></div><div id="authForm">${loginTab()}</div></div></div>`;
  }
  switchAuthTab(tab) {
    this.mode = tab;
    const isLogin = tab === 'login';
    document.getElementById('loginTab').classList.toggle('active', isLogin);
    document.getElementById('registerTab').classList.toggle('active', !isLogin);
    const form = document.getElementById('authForm');
    if (isLogin) {
      form.innerHTML = `<div class="form-group"><label>Логин</label><input type="text" id="username" placeholder="3-20 символов"></div><div class="form-group"><label>Пароль</label><input type="password" id="password" placeholder="8+ символов"></div><button onclick="window.game.doLogin()" style="width:100%;margin-top:15px">ВОЙТИ</button>`;
    } else {
      form.innerHTML = `<div class="form-group"><label>Логин</label><input type="text" id="username" placeholder="3-20 символов"></div><div class="form-group"><label>Никнейм</label><input type="text" id="nickname" placeholder="2-16 символов"></div><div class="form-group"><label>Пароль</label><input type="password" id="password" placeholder="8+ символов"></div><div class="form-group"><label>Повторить пароль</label><input type="password" id="password2"></div><button onclick="window.game.doRegister()" style="width:100%;margin-top:15px">СОЗДАТЬ АККАУНТ</button>`;
    }
  }
  async doLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await r.json();
    if (data.error) return this.showToast(data.error);
    this.user = data.user; this.enterMenu(); this.connectSocket();
  }
  async doRegister() {
    const username = document.getElementById('username').value;
    const nickname = document.getElementById('nickname').value;
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, nickname, password, password2 }) });
    const data = await r.json();
    if (data.error) return this.showToast(data.error);
    this.user = data.user; this.enterMenu(); this.connectSocket();
  }
  enterMenu() { this.mode = 'menu'; this.render(); }
  renderMenu() {
    return `<div class="menu-screen"><div class="menu-bg"></div><div class="menu-content"><h1>🎭</h1><h1>MAFIA</h1><p class="subtitle">ONLINE</p><div class="menu-buttons">
      <button onclick="window.game.quickPlay()">⚡ БЫСТРАЯ ИГРА</button>
      <button onclick="window.game.createRoom()">🎮 СОЗДАТЬ КОМНАТУ</button>
      <button onclick="window.game.joinRoom()">🔑 ПРИСОЕДИНИТЬСЯ</button>
      <button onclick="window.game.localGame()">💻 ЛОКАЛЬНАЯ ИГРА</button>
      <button onclick="window.game.showProfile()">👤 ПРОФИЛЬ</button>
      <button onclick="window.game.logout()">🚪 ВЫХОД</button>
    </div></div></div>`;
  }
  async quickPlay() { this.socket.emit('quickPlay', {}, d => { if (d.ok) { this.room = d.code; this.mode = 'lobby'; this.render(); } else alert(d.error); }); }
  createRoom() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `<div class="modal-content">
      <h2>🎮 Создать комнату</h2>
      <div class="form-group"><label>Максимум игроков</label><select id="maxPlayers"><option value="4">4</option><option value="5">5</option><option value="6" selected>6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option></select></div>
      <div class="form-group"><label>Режим</label><select id="mode"><option value="classic">Классика</option><option value="fast">Быстрая</option><option value="chaos">Хаос</option><option value="friends">Только друзья</option></select></div>
      <div class="buttons"><button onclick="window.game.doCreateRoom()">Создать</button><button onclick="this.parentElement.parentElement.remove()">Отмена</button></div>
    </div>`;
    document.body.appendChild(modal);
  }
  doCreateRoom() {
    const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
    const mode = document.getElementById('mode').value;
    this.socket.emit('createRoom', { settings: { maxPlayers, mode } }, d => {
      if (d.ok) { this.room = d.code; this.mode = 'lobby'; this.render(); document.querySelector('.modal')?.remove(); }
      else alert(d.error);
    });
  }
  joinRoom() {
    const code = prompt('Введите код комнаты:');
    if (!code) return;
    this.socket.emit('joinRoom', { code }, d => {
      if (d.ok) { this.room = d.code; this.mode = 'lobby'; this.render(); }
      else alert(d.error);
    });
  }
  localGame() {
    this.mode = 'local';
    this.localPlayers = [];
    this.localSettings = { maxPlayers: 4, mode: 'classic', dayTime: 90, nightTime: 45 };
    this.render();
  }
  renderLocal() {
    if (!this.localPlayers.length) {
      return `<div class="lobby-screen"><h1>💻 Локальная игра</h1><p>Количество игроков: <select id="playerCount"><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option><option>10</option></select></p><button onclick="window.game.startLocalSetup()">Дальше</button><button onclick="window.game.enterMenu()">Назад</button></div>`;
    }
    const current = this.localPlayers.length;
    if (this.localShowRole !== undefined) {
      const p = this.localPlayers[this.localShowRole];
      return `<div class="lobby-screen" style="justify-content:center;align-items:center"><div style="text-align:center"><h1>👤 ${p.nick}</h1><div style="font-size:72px;margin:30px 0">${Engine.ROLES[p.role].icon}</div><h2>${Engine.ROLES[p.role].name}</h2><p>${Engine.TEAMS[Engine.ROLES[p.role].team]}</p><button onclick="window.game.nextLocalPlayer()" style="margin-top:20px;width:200px">Скрыть</button></div></div>`;
    }
    const p = this.localPlayers[current - 1];
    return `<div class="lobby-screen"><h1>💻 Локальная игра</h1><p>Игрок ${current}/${this.localSettings.maxPlayers}</p><p>Имя: <input type="text" id="playerName" value="${p?.nick || ''}"></p><button onclick="window.game.addLocalPlayer()">Добавить</button>${current > 1 ? '<button onclick="window.game.backLocalPlayer()">Назад</button>' : ''}</div>`;
  }
  startLocalSetup() {
    const count = parseInt(document.getElementById('playerCount').value);
    this.localSettings.maxPlayers = count;
    this.localPlayers = [];
    for (let i = 0; i < count; i++) this.localPlayers.push({ id: 'local_' + i, nick: '', role: null });
    this.render();
  }
  addLocalPlayer() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Введите имя'); return; }
    const idx = this.localPlayers.length - 1;
    this.localPlayers[idx].nick = name;
    if (idx + 1 < this.localSettings.maxPlayers) this.render();
    else this.startLocalGame();
  }
  nextLocalPlayer() {
    this.localShowRole = undefined;
    const idx = this.localShowRole === undefined ? -1 : this.localShowRole;
    if (idx + 1 < this.localPlayers.length) { this.localShowRole = idx + 1; this.render(); }
    else this.startLocalGame();
  }
  backLocalPlayer() { this.localPlayers.pop(); this.render(); }
  startLocalGame() {
    const roles = Engine.autoCounts(this.localPlayers.length, [], false);
    const roleList = Engine.expand(roles);
    Engine.shuffle(roleList).forEach((role, i) => this.localPlayers[i].role = role);
    this.localGameState = Engine.newState(this.localPlayers, { selfHeal: true, healRepeat: false });
    this.localPhase = 'START_NIGHT'; this.localDay = 1; this.localNight = 1; this.localLog = [];
    this.render();
  }
  showProfile() {
    alert(`Профиль: ${this.user.nickname}\nИгры: ${this.user.games_played}\nПобед: ${this.user.games_won}\nРейтинг: ${this.user.rating}`);
  }
  async logout() {
    await fetch('/api/logout', { method: 'POST' });
    this.user = null; this.socket?.disconnect(); this.checkAuth();
  }
  renderLobby() {
    if (!this.state) return '<div class="lobby-screen"><p>Загрузка...</p></div>';
    const isHost = this.state.players.find(p => p.host);
    return `<div class="lobby-screen">
      <div class="lobby-header"><h1>🎮 КОМНАТА</h1><button onclick="window.game.leaveRoom()">← Выход</button></div>
      <div class="room-info">
        <div class="room-code">
          <div class="label">КОД КОМНАТЫ</div>
          <div class="code">${this.state.code}</div>
          <button onclick="navigator.clipboard.writeText('${this.state.code}')">📋 Копировать</button>
        </div>
        <div class="settings-panel">
          <h3>⚙️ Параметры</h3>
          <div class="setting-group"><label>Макс игроков</label><span>${this.state.settings.maxPlayers}</span></div>
          <div class="setting-group"><label>Режим</label><span>${this.state.settings.mode}</span></div>
          <div class="setting-group"><label>Раскрыть роли</label><span>${this.state.settings.revealRoles ? '✓' : '✗'}</span></div>
          <div class="setting-group"><label>Время дня</label><span>${this.state.settings.dayTime}с</span></div>
        </div>
      </div>
      <div class="players-section">
        ${this.state.players.map(p => `<div class="player-card${p.ready ? ' ready' : ''}">
          <div class="avatar">${p.avatar}</div>
          <div class="nick">${p.nick}</div>
          <div class="status">${p.ready ? '✓ Готов' : '○ Не готов'}</div>
          ${p.host ? '<div class="host">👑 Хост</div>' : ''}
          ${isHost && p.id !== this.user.id ? `<button class="remove" onclick="window.game.kickPlayer('${p.id}')">Исключить</button>` : ''}
        </div>`).join('')}
      </div>
      <div class="lobby-footer">
        ${isHost ? `<button onclick="window.game.toggleReady()">✓ Готов</button><button onclick="window.game.startGameSocket()">▶ Начать игру</button>` : `<button onclick="window.game.toggleReady()">✓ Готов</button>`}
      </div>
    </div>`;
  }
  toggleReady() { this.socket.emit('playerReady', { ready: !this.state.me?.ready }, () => {}); }
  startGameSocket() { this.socket.emit('startGame', {}, d => { if (d.error) alert(d.error); }); }
  kickPlayer(id) { this.socket.emit('kick', { id }, () => {}); }
  leaveRoom() { this.socket.emit('leaveRoom', {}, () => { this.mode = 'menu'; this.render(); }); }
  renderGame() {
    if (!this.state) return '<div class="game-screen"><p>Загрузка...</p></div>';
    return `<div class="game-screen">
      <div class="game-left">
        ${this.state.me ? `<div class="player-info">
          <div class="avatar">${this.user.avatar}</div>
          <div class="nick">${this.state.me.role ? Engine.ROLES[this.state.me.role].icon : '👤'} ${this.user.nickname}</div>
          <div class="role">${this.state.me.role ? Engine.ROLES[this.state.me.role].name : 'Роль'}</div>
          <div class="status${this.state.me.alive ? '' : ' dead'}">${this.state.me.alive ? '🟢 Жив' : '💀 Мёртв'}</div>
        </div>` : '<p style="font-size:12px">Наблюдатель</p>'}
        <div class="chat-box">
          <div class="chat-messages" id="chatBox"></div>
          <div class="chat-input">
            <input type="text" id="chatInput" placeholder="Сообщение..." maxlength="300">
            <button onclick="window.game.sendChat()">📤</button>
          </div>
        </div>
      </div>
      <div class="game-center">
        <div class="phase-display">
          <div class="phase-title">${this.state.phase === 'NIGHT' ? '🌙 НОЧЬ' : this.state.phase === 'DAY' ? '☀️ ДЕНЬ' : this.state.phase === 'DISCUSSION' ? '💬 ОБСУЖДЕНИЕ' : this.state.phase === 'VOTING' ? '⚖️ ГОЛОСОВАНИЕ' : 'ИГРА'}</div>
          ${this.state.endsAt ? `<div class="timer">${this.formatTime(this.state.endsAt)}</div>` : ''}
        </div>
        ${this.state.morning ? `<div class="death-announcement" style="animation:none"><div class="nick">${this.state.morning.deaths.map(d => d.nick).join(', ')}</div><div class="role">${this.state.morning.deaths.map(d => d.role ? Engine.ROLES[d.role].name : 'неизвестно').join(', ')}</div></div>` : ''}
        ${this.state.phase === 'NIGHT' && this.state.me?.role ? `<div class="night-actions">${this.state.me.kinds.map(k => `<button class="action-btn${this.state.picks[k] ? ' selected' : ''}" onclick="window.game.showTargets('${k}')"><div class="emoji">${Engine.KIND[k]}</div>${Engine.KIND[k]}</button>`).join('')}</div>` : ''}
        ${this.state.phase === 'VOTING' ? `<div class="voting-screen">${this.state.players.filter(p => p.alive).map(p => `<div class="vote-card${this.state.myVote === p.id ? ' voted' : ''}" onclick="window.game.vote('${p.id}')"><div class="avatar">${p.avatar}</div><div class="nick">${p.nick}</div></div>`).join('')}<div class="vote-card" onclick="window.game.vote(null)"><div style="font-size:32px">⊘</div><div>Воздержаться</div></div></div>` : ''}
      </div>
      <div class="game-right">
        <div style="background:rgba(26,40,71,0.8);border:1px solid var(--border);padding:10px;border-radius:8px;font-size:12px">День ${this.state.day}</div>
        <div class="players-list">${this.state.players.map(p => `<div class="player-mini${p.alive ? ' alive' : ' dead'}" onclick="window.game.inspectPlayer('${p.id}')"><div class="avatar">${p.avatar}</div><div>${p.nick.slice(0,8)}</div></div>`).join('')}</div>
      </div>
    </div>`;
  }
  formatTime(ms) {
    const s = Math.max(0, Math.ceil((ms - Date.now()) / 1000));
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
  showTargets(kind) {
    const targets = this.state.players.filter(p => p.alive && p.id !== this.user.id);
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `<div class="modal-content"><h2>${Engine.KIND[kind]}</h2><div class="players-section">${targets.map(p => `<button class="player-mini" style="background:rgba(26,40,71,0.8);border:1px solid var(--border);cursor:pointer" onclick="window.game.selectTarget('${kind}', '${p.id}')">${p.avatar}<br>${p.nick}</button>`).join('')}</div><button onclick="this.parentElement.parentElement.remove()">Отмена</button></div>`;
    document.body.appendChild(modal);
  }
  selectTarget(kind, targetId) {
    this.socket.emit('nightAction', { kind, target: targetId }, d => {
      document.querySelector('.modal')?.remove();
      if (!d.ok) alert(d.error);
    });
  }
  vote(playerId) {
    this.socket.emit('vote', { target: playerId }, d => { if (!d.ok) alert(d.error); });
  }
  sendChat() {
    const text = document.getElementById('chatInput').value;
    if (!text) return;
    if (this.state.phase === 'NIGHT' && this.state.me?.role && Engine.TEAM(this.state.me.role) === 'mafia') {
      this.socket.emit('mafiaMessage', { text }, d => { if (d.ok) document.getElementById('chatInput').value = ''; else alert(d.error); });
    } else {
      this.socket.emit('chatMessage', { text }, d => { if (d.ok) document.getElementById('chatInput').value = ''; else alert(d.error); });
    }
  }
  showToast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }
  attachHandlers() {
    if (this.state && this.state.chat) {
      const box = document.getElementById('chatBox');
      if (box) {
        const msgs = (this.state.chat.mafia && this.state.me?.role && Engine.TEAM(this.state.me.role) === 'mafia') ? this.state.chat.mafia : this.state.phase === 'NIGHT' ? [] : this.state.chat.day;
        box.innerHTML = msgs.map(m => `<div class="chat-message"><div class="from">${m.from}</div><div class="text">${m.text}</div></div>`).join('');
        box.scrollTop = box.scrollHeight;
      }
    }
    clearInterval(this.timerId);
    if (this.state?.endsAt) this.timerId = setInterval(() => this.render(), 500);
  }
  loadSettings() { this.settings = JSON.parse(localStorage.getItem('mafiaSettings') || '{"sound":true,"music":false}'); }
  play(sound) { if (this.settings.sound) console.log('🔊 ' + sound); }
}
if (!window.game) window.game = new MafiaGame();

class MafiaGame {
  constructor() {
    this.state = null;
    this.socket = null;
    this.user = null;
    this.room = null;
    this.mode = 'auth';
    this.authMode = 'register';
    this.loading = false;
    this.shop = {
      skins: [
        { id: 'skin_dark', name: '🌑 Dark Mode', price: 100, avatar: '🌑' },
        { id: 'skin_gold', name: '⭐ Gold Mode', price: 250, avatar: '⭐' },
        { id: 'skin_fire', name: '🔥 Fire Mode', price: 300, avatar: '🔥' },
        { id: 'skin_ice', name: '❄️ Ice Mode', price: 300, avatar: '❄️' },
        { id: 'skin_ghost', name: '👻 Ghost Mode', price: 200, avatar: '👻' },
      ],
      emotes: [
        { id: 'emote_laugh', name: '😂 Смехотун', price: 50, emoji: '😂' },
        { id: 'emote_skull', name: '💀 Жертва', price: 100, emoji: '💀' },
        { id: 'emote_gun', name: '🔫 Убийца', price: 100, emoji: '🔫' },
        { id: 'emote_think', name: '🤔 Детектив', price: 100, emoji: '🤔' },
        { id: 'emote_crown', name: '👑 Король', price: 150, emoji: '👑' },
      ],
      frames: [
        { id: 'frame_gold', name: '🟡 Золотая рамка', price: 200 },
        { id: 'frame_purple', name: '🟣 Фиолетовая рамка', price: 200 },
        { id: 'frame_red', name: '🔴 Красная рамка', price: 200 },
      ]
    };
    this.render();
    this.checkAuth();
  }

  async checkAuth() {
    try {
      const r = await fetch('/api/me');
      const data = await r.json();
      if (data.user) {
        this.user = data.user;
        this.enterMenu();
        this.connectSocket();
      } else {
        this.renderAuth();
      }
    } catch (e) {
      console.error('Auth check failed:', e);
      this.renderAuth();
    }
  }

  connectSocket() {
    this.socket = io({ reconnection: true });
    this.socket.on('state', d => { this.state = d; this.render(); });
    this.socket.on('roleAssigned', () => this.play('role'));
    this.socket.on('playerDied', d => this.play('death'));
    this.socket.on('gameEnded', d => { this.play('win'); this.user.coins = d.coinsEarned; this.render(); });
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
    else if (this.mode === 'shop') app.innerHTML = this.renderShop();
    else if (this.mode === 'local') app.innerHTML = this.renderLocal();
    
    document.body.innerHTML = '';
    document.body.appendChild(app);
    this.attachHandlers();
  }

  renderAuth() {
    return `
      <main class="auth-screen">
        <div class="auth-bg"><span></span><span></span><span></span></div>
        <section class="auth-card">
          <div class="auth-brand">
            <div class="auth-logo">🎭</div>
            <div>
              <div class="auth-title">MAFIA</div>
              <div class="auth-subtitle">ONLINE</div>
            </div>
          </div>

          <div class="auth-tabs" role="tablist">
            <button type="button" class="auth-tab ${this.authMode === 'register' ? 'active' : ''}" data-auth-mode="register">Регистрация</button>
            <button type="button" class="auth-tab ${this.authMode === 'login' ? 'active' : ''}" data-auth-mode="login">Вход</button>
          </div>

          <div class="auth-heading">
            <h2>${this.authMode === 'register' ? 'Создать аккаунт' : 'С возвращением'}</h2>
            <p>${this.authMode === 'register' ? 'Зарегистрируйся и начни играть' : 'Войди в свой аккаунт Mafia Online'}</p>
          </div>

          <div id="authContent">${this.renderAuthContent()}</div>
        </section>
      </main>
    `;
  }

  switchAuthMode(mode) {
    if (mode !== 'register' && mode !== 'login') return;
    this.authMode = mode;
    this.loading = false;
    this.render();
    const first = document.querySelector('#authContent input');
    if (first) setTimeout(() => first.focus(), 0);
  }

  renderAuthContent() {
    if (this.authMode === 'login') {
      return `
        <form id="loginForm" class="auth-form" novalidate>
          <div class="form-group">
            <label for="loginUsername">Логин</label>
            <input id="loginUsername" name="username" type="text" autocomplete="username" maxlength="20" placeholder="Например: player123" required>
          </div>
          <div class="form-group">
            <label for="loginPassword">Пароль</label>
            <div class="password-wrap">
              <input id="loginPassword" name="password" type="password" autocomplete="current-password" maxlength="64" placeholder="Введите пароль" required>
              <button type="button" class="password-toggle" data-password-toggle="loginPassword">Показать</button>
            </div>
          </div>
          <div id="loginError" class="auth-message"></div>
          <button type="submit" class="auth-submit" id="loginBtn">${this.loading ? 'ВХОД...' : 'ВОЙТИ'}</button>
          <p class="auth-bottom">Нет аккаунта? <button type="button" class="auth-link" data-auth-mode="register">Зарегистрироваться</button></p>
        </form>
      `;
    }

    return `
      <form id="registerForm" class="auth-form" novalidate>
        <div class="form-group">
          <label for="regUsername">Логин</label>
          <input id="regUsername" name="username" type="text" autocomplete="username" maxlength="20" placeholder="player123" required>
          <small>3–20 символов: латиница, цифры и _</small>
        </div>
        <div class="form-group">
          <label for="regNickname">Никнейм</label>
          <input id="regNickname" name="nickname" type="text" autocomplete="nickname" maxlength="16" placeholder="Твой ник" required>
        </div>
        <div class="form-group">
          <label for="regPassword">Пароль</label>
          <div class="password-wrap">
            <input id="regPassword" name="password" type="password" autocomplete="new-password" maxlength="64" placeholder="Минимум 8 символов" required>
            <button type="button" class="password-toggle" data-password-toggle="regPassword">Показать</button>
          </div>
        </div>
        <div class="form-group">
          <label for="regPassword2">Повтор пароля</label>
          <div class="password-wrap">
            <input id="regPassword2" name="password2" type="password" autocomplete="new-password" maxlength="64" placeholder="Повтори пароль" required>
            <button type="button" class="password-toggle" data-password-toggle="regPassword2">Показать</button>
          </div>
        </div>
        <div id="regError" class="auth-message"></div>
        <button type="submit" class="auth-submit" id="regBtn">${this.loading ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ АККАУНТ'}</button>
        <p class="auth-bottom">Уже есть аккаунт? <button type="button" class="auth-link" data-auth-mode="login">Войти</button></p>
      </form>
    `;
  }

  async doLogin(e) {
    e.preventDefault();
    if (this.loading) return;
    const form = e.currentTarget;
    const username = form.username.value.trim();
    const password = form.password.value;
    const errorDiv = document.getElementById('loginError');
    if (!username || !password) {
      errorDiv.innerHTML = '<div class="auth-error">❌ Заполни логин и пароль</div>';
      return;
    }

    this.loading = true;
    const btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'ВХОД...'; }
    errorDiv.innerHTML = '';

    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || `Ошибка входа (${r.status})`);
      this.user = data.user;
      this.loading = false;
      this.enterMenu();
      this.connectSocket();
    } catch (error) {
      this.loading = false;
      if (btn) { btn.disabled = false; btn.textContent = 'ВОЙТИ'; }
      errorDiv.innerHTML = `<div class="auth-error">❌ ${this.escapeHtml(error.message || 'Не удалось войти')}</div>`;
    }
  }

  async doRegister(e) {
    e.preventDefault();
    if (this.loading) return;
    const form = e.currentTarget;
    const username = form.username.value.trim();
    const nickname = form.nickname.value.trim();
    const password = form.password.value;
    const password2 = form.password2.value;
    const errorDiv = document.getElementById('regError');

    if (!username || !nickname || !password || !password2) {
      errorDiv.innerHTML = '<div class="auth-error">❌ Заполни все поля</div>';
      return;
    }
    if (password !== password2) {
      errorDiv.innerHTML = '<div class="auth-error">❌ Пароли не совпадают</div>';
      return;
    }

    this.loading = true;
    const btn = document.getElementById('regBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'СОЗДАНИЕ...'; }
    errorDiv.innerHTML = '';

    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username, nickname, password, password2 })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || `Ошибка регистрации (${r.status})`);
      this.user = data.user;
      this.loading = false;
      this.enterMenu();
      this.connectSocket();
    } catch (error) {
      this.loading = false;
      if (btn) { btn.disabled = false; btn.textContent = 'СОЗДАТЬ АККАУНТ'; }
      errorDiv.innerHTML = `<div class="auth-error">❌ ${this.escapeHtml(error.message || 'Не удалось зарегистрироваться')}</div>`;
    }
  }

  escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  enterMenu() { 
    this.mode = 'menu';
    this.render();
  }

  renderMenu() {
    return `
      <div class="menu-screen">
        <div class="menu-bg"></div>
        <div class="menu-content">
          <h1>🎭</h1>
          <h1>MAFIA</h1>
          <p class="subtitle">ONLINE</p>
          <div style="margin-bottom:20px;color:rgba(255,255,255,0.6)">Добро пожаловать, <strong>${this.user.nickname}</strong>!</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:30px;font-size:18px;font-weight:700">
            <div style="background:rgba(255,193,7,0.2);border:2px solid var(--amber);padding:10px 20px;border-radius:8px">💰 ${this.user.coins || 0} монет</div>
            <div style="background:rgba(147,51,234,0.2);border:2px solid var(--purple);padding:10px 20px;border-radius:8px">⭐ ${this.user.rating || 1000} рейтинг</div>
          </div>
          <div class="menu-buttons">
            <button onclick="window.game.quickPlay()">⚡ БЫСТРАЯ ИГРА</button>
            <button onclick="window.game.createRoom()">🎮 СОЗДАТЬ КОМНАТУ</button>
            <button onclick="window.game.joinRoom()">🔑 ПРИСОЕДИНИТЬСЯ</button>
            <button onclick="window.game.localGame()">💻 ЛОКАЛЬНАЯ ИГРА</button>
            <button onclick="window.game.openShop()">🛍️ МАГАЗИН</button>
            <button onclick="window.game.showProfile()">👤 ПРОФИЛЬ</button>
            <button onclick="window.game.logout()" style="background:linear-gradient(135deg,#dc2626,#991b1b)">🚪 ВЫХОД</button>
          </div>
        </div>
      </div>
    `;
  }

  openShop() {
    this.mode = 'shop';
    this.render();
  }

  renderShop() {
    return `
      <div class="shop-screen">
        <div class="shop-header">
          <h1>🛍️ МАГАЗИН</h1>
          <div style="display:flex;gap:15px;align-items:center">
            <div style="background:rgba(255,193,7,0.2);border:2px solid var(--amber);padding:8px 16px;border-radius:8px;font-weight:700">💰 ${this.user.coins || 0}</div>
            <button onclick="window.game.enterMenu()" style="padding:10px 20px">← Назад</button>
          </div>
        </div>
        
        <div class="shop-content">
          <div class="shop-section">
            <h2>🌑 Скины аватара</h2>
            <div class="shop-grid">
              ${this.shop.skins.map(skin => `
                <div class="shop-item ${this.user.skins && this.user.skins.includes(skin.id) ? 'owned' : ''}">
                  <div class="shop-avatar">${skin.avatar}</div>
                  <div class="shop-name">${skin.name}</div>
                  <div class="shop-price">💰 ${skin.price}</div>
                  ${this.user.skins && this.user.skins.includes(skin.id) 
                    ? '<div class="shop-owned">✓ У вас</div>'
                    : `<button class="shop-buy" onclick="window.game.buyItem('skin', '${skin.id}', ${skin.price})">Купить</button>`
                  }
                </div>
              `).join('')}
            </div>
          </div>

          <div class="shop-section">
            <h2>😂 Эмоции</h2>
            <div class="shop-grid">
              ${this.shop.emotes.map(emote => `
                <div class="shop-item ${this.user.emotes && this.user.emotes.includes(emote.id) ? 'owned' : ''}">
                  <div class="shop-emoji">${emote.emoji}</div>
                  <div class="shop-name">${emote.name}</div>
                  <div class="shop-price">💰 ${emote.price}</div>
                  ${this.user.emotes && this.user.emotes.includes(emote.id)
                    ? '<div class="shop-owned">✓ У вас</div>'
                    : `<button class="shop-buy" onclick="window.game.buyItem('emote', '${emote.id}', ${emote.price})">Купить</button>`
                  }
                </div>
              `).join('')}
            </div>
          </div>

          <div class="shop-section">
            <h2>🟡 Рамки профиля</h2>
            <div class="shop-grid">
              ${this.shop.frames.map(frame => `
                <div class="shop-item ${this.user.frames && this.user.frames.includes(frame.id) ? 'owned' : ''}">
                  <div class="shop-frame">🖼️</div>
                  <div class="shop-name">${frame.name}</div>
                  <div class="shop-price">💰 ${frame.price}</div>
                  ${this.user.frames && this.user.frames.includes(frame.id)
                    ? '<div class="shop-owned">✓ У вас</div>'
                    : `<button class="shop-buy" onclick="window.game.buyItem('frame', '${frame.id}', ${frame.price})">Купить</button>`
                  }
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async buyItem(type, id, price) {
    if (this.user.coins < price) {
      this.showToast(`❌ Недостаточно монет! Нужно ${price}, есть ${this.user.coins}`);
      return;
    }

    try {
      const r = await fetch('/api/buy-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, price })
      });
      const data = await r.json();

      if (data.error) {
        this.showToast(`❌ ${data.error}`);
        return;
      }

      this.user.coins = data.coins;
      if (type === 'skin') this.user.skins = data.skins;
      else if (type === 'emote') this.user.emotes = data.emotes;
      else if (type === 'frame') this.user.frames = data.frames;

      this.showToast(`✅ Предмет куплен! 💰 ${this.user.coins} осталось`);
      this.render();
    } catch (error) {
      this.showToast('❌ Ошибка при покупке');
      console.error(error);
    }
  }

  async quickPlay() {
    this.socket.emit('quickPlay', {}, d => {
      if (d.ok) {
        this.room = d.code;
        this.mode = 'lobby';
        this.render();
      } else {
        alert(d.error);
      }
    });
  }

  createRoom() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>🎮 Создать комнату</h2>
        <div class="form-group">
          <label>Максимум игроков</label>
          <select id="maxPlayers">
            <option value="4">4</option><option value="5">5</option><option value="6" selected>6</option>
            <option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option>
          </select>
        </div>
        <div class="form-group">
          <label>Режим</label>
          <select id="mode">
            <option value="classic">Классика</option><option value="fast">Быстрая</option>
            <option value="chaos">Хаос</option><option value="friends">Только друзья</option>
          </select>
        </div>
        <div class="buttons" style="margin-top:20px">
          <button onclick="window.game.doCreateRoom()">✓ Создать</button>
          <button onclick="this.closest('.modal').remove()" style="background:linear-gradient(135deg,#6b7280,#4b5563)">✕ Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  doCreateRoom() {
    const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
    const mode = document.getElementById('mode').value;
    this.socket.emit('createRoom', { settings: { maxPlayers, mode } }, d => {
      if (d.ok) {
        this.room = d.code;
        this.mode = 'lobby';
        this.render();
        document.querySelector('.modal')?.remove();
      } else {
        alert(d.error);
      }
    });
  }

  joinRoom() {
    const code = prompt('Введите код комнаты (например: A7K92):');
    if (!code) return;
    this.socket.emit('joinRoom', { code: code.toUpperCase() }, d => {
      if (d.ok) {
        this.room = d.code;
        this.mode = 'lobby';
        this.render();
      } else {
        alert(d.error);
      }
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
      return `
        <div class="lobby-screen">
          <h1>💻 Локальная игра</h1>
          <div class="form-group" style="max-width:300px">
            <label>Количество игроков</label>
            <select id="playerCount">
              <option>4</option><option>5</option><option>6</option><option>7</option>
              <option>8</option><option>9</option><option>10</option>
            </select>
          </div>
          <div style="margin-top:20px">
            <button onclick="window.game.startLocalSetup()">Дальше →</button>
            <button onclick="window.game.enterMenu()" style="background:linear-gradient(135deg,#6b7280,#4b5563)">← Назад</button>
          </div>
        </div>
      `;
    }

    const current = this.localPlayers.length;
    if (this.localShowRole !== undefined) {
      const p = this.localPlayers[this.localShowRole];
      return `
        <div class="lobby-screen" style="justify-content:center;align-items:center">
          <div style="text-align:center">
            <h1>👤 ${p.nick}</h1>
            <div style="font-size:72px;margin:30px 0">${Engine.ROLES[p.role].icon}</div>
            <h2>${Engine.ROLES[p.role].name}</h2>
            <p>${Engine.TEAMS[Engine.ROLES[p.role].team]}</p>
            <p style="color:rgba(255,255,255,0.6);margin-top:20px">${Engine.ROLES[p.role].desc}</p>
            <button onclick="window.game.nextLocalPlayer()" style="margin-top:30px;width:200px">Скрыть ✓</button>
          </div>
        </div>
      `;
    }

    const p = this.localPlayers[current - 1];
    return `
      <div class="lobby-screen">
        <h1>💻 Локальная игра</h1>
        <div style="margin-bottom:20px;color:var(--amber)">Игрок ${current}/${this.localSettings.maxPlayers}</div>
        <div class="form-group" style="max-width:300px">
          <label>Имя игрока</label>
          <input type="text" id="playerName" value="${p?.nick || ''}" placeholder="Максим" autofocus>
        </div>
        <div style="margin-top:20px">
          <button onclick="window.game.addLocalPlayer()">Добавить ✓</button>
          ${current > 1 ? '<button onclick="window.game.backLocalPlayer()" style="background:linear-gradient(135deg,#6b7280,#4b5563)">← Назад</button>' : ''}
        </div>
      </div>
    `;
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
    if (idx + 1 < this.localSettings.maxPlayers) {
      this.render();
    } else {
      this.startLocalGame();
    }
  }

  nextLocalPlayer() {
    this.localShowRole = undefined;
    const idx = this.localShowRole === undefined ? -1 : this.localShowRole;
    if (idx + 1 < this.localPlayers.length) {
      this.localShowRole = idx + 1;
      this.render();
    } else {
      this.startLocalGame();
    }
  }

  backLocalPlayer() { 
    this.localPlayers.pop();
    this.render();
  }

  startLocalGame() {
    const roles = Engine.autoCounts(this.localPlayers.length, [], false);
    const roleList = Engine.expand(roles);
    Engine.shuffle(roleList).forEach((role, i) => this.localPlayers[i].role = role);
    this.localGameState = Engine.newState(this.localPlayers, { selfHeal: true, healRepeat: false });
    this.localPhase = 'START_NIGHT';
    this.localDay = 1;
    this.localNight = 1;
    this.localLog = [];
    this.render();
  }

  showProfile() {
    alert(`
👤 ПРОФИЛЬ
━━━━━━━━━━━━━━━━━━━━
Никнейм: ${this.user.nickname}
💰 Монет: ${this.user.coins || 0}
⭐ Рейтинг: ${this.user.rating}
🎮 Игры: ${this.user.games_played}
🏆 Побед: ${this.user.games_won}
💥 Поражений: ${this.user.games_lost}
🔫 Убийств: ${this.user.kills}
🔎 Проверок: ${this.user.checks}
💉 Спасений: ${this.user.saves}
    `);
  }

  async logout() {
    if (!confirm('Вы уверены что хотите выйти?')) return;
    await fetch('/api/logout', { method: 'POST' });
    this.user = null;
    this.socket?.disconnect();
    this.checkAuth();
  }

  renderLobby() {
    if (!this.state) return '<div class="lobby-screen"><p>Загрузка...</p></div>';
    const isHost = this.state.players.find(p => p.host);
    return `
      <div class="lobby-screen">
        <div class="lobby-header">
          <h1>🎮 КОМНАТА</h1>
          <button onclick="window.game.leaveRoom()">← Выход</button>
        </div>
        <div class="room-info">
          <div class="room-code">
            <div class="label">КОД КОМНАТЫ</div>
            <div class="code">${this.state.code}</div>
            <button onclick="navigator.clipboard.writeText('${this.state.code}');window.game.showToast('✅ Код скопирован!')">📋 Копировать</button>
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
          ${this.state.players.map(p => `
            <div class="player-card${p.ready ? ' ready' : ''}">
              <div class="avatar">${p.avatar}</div>
              <div class="nick">${p.nick}</div>
              <div class="status">${p.ready ? '✓ Готов' : '○ Не готов'}</div>
              ${p.host ? '<div class="host">👑 Хост</div>' : ''}
              ${isHost && p.id !== this.user.id ? `<button class="remove" onclick="window.game.kickPlayer('${p.id}')">✕ Исключить</button>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="lobby-footer">
          ${isHost ? `
            <button onclick="window.game.toggleReady()">✓ Я готов</button>
            <button onclick="window.game.startGameSocket()">▶ Начать игру</button>
          ` : `
            <button onclick="window.game.toggleReady()">✓ Я готов</button>
          `}
        </div>
      </div>
    `;
  }

  toggleReady() { this.socket.emit('playerReady', { ready: !this.state.me?.ready }, () => {}); }
  startGameSocket() { this.socket.emit('startGame', {}, d => { if (d.error) alert(d.error); }); }
  kickPlayer(id) { this.socket.emit('kick', { id }, () => {}); }
  leaveRoom() { this.socket.emit('leaveRoom', {}, () => { this.mode = 'menu'; this.render(); }); }

  renderGame() {
    if (!this.state) return '<div class="game-screen"><p>Загрузка...</p></div>';
    
    let votingUI = '';
    if (this.state.phase === 'VOTING') {
      const votes = {};
      for (const pid in this.state.votes) {
        const target = this.state.votes[pid];
        if (target) votes[target] = (votes[target] || 0) + 1;
      }
      const alivePlayers = this.state.players.filter(p => p.alive);
      votingUI = `
        <div class="voting-panel">
          <div class="voting-title">⚖️ ГОЛОСОВАНИЕ</div>
          <div class="voting-stats">Голосов: ${this.state.votedCount || 0}/${this.state.voters || alivePlayers.length}</div>
          <div class="voting-results">
            ${alivePlayers.map(p => {
              const count = votes[p.id] || 0;
              return `
                <div class="vote-result ${count > 0 ? 'has-votes' : ''}">
                  <div class="vote-player">${p.avatar} ${p.nick}</div>
                  <div class="vote-count">${'🔴'.repeat(count)}</div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="voting-screen">
            ${alivePlayers.map(p => `
              <div class="vote-card${this.state.myVote === p.id ? ' voted' : ''}" onclick="window.game.vote('${p.id}')">
                <div class="avatar">${p.avatar}</div>
                <div class="nick">${p.nick}</div>
                <div class="vote-badge">${votes[p.id] || 0}</div>
              </div>
            `).join('')}
            <div class="vote-card${this.state.myVote === null ? ' voted' : ''}" onclick="window.game.vote(null)">
              <div style="font-size:32px">⊘</div>
              <div>Воздержаться</div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="game-screen">
        <div class="game-left">
          ${this.state.me ? `
            <div class="player-info">
              <div class="avatar">${this.user.avatar}</div>
              <div class="nick">${this.state.me.role ? Engine.ROLES[this.state.me.role].icon : '👤'} ${this.user.nickname}</div>
              <div class="role">${this.state.me.role ? Engine.ROLES[this.state.me.role].name : 'Роль'}</div>
              <div class="status${this.state.me.alive ? '' : ' dead'}">${this.state.me.alive ? '🟢 Жив' : '💀 Мёртв'}</div>
            </div>
          ` : '<p style="font-size:12px">Наблюдатель</p>'}
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
          ${this.state.morning ? `
            <div class="death-announcement" style="animation:none">
              <div class="nick">${this.state.morning.deaths.map(d => d.nick).join(', ')}</div>
              <div class="role">${this.state.morning.deaths.map(d => d.role ? Engine.ROLES[d.role].name : 'неизвестно').join(', ')}</div>
            </div>
          ` : ''}
          ${this.state.phase === 'NIGHT' && this.state.me?.role ? `
            <div class="night-actions">
              ${this.state.me.kinds.map(k => `
                <button class="action-btn${this.state.picks[k] ? ' selected' : ''}" onclick="window.game.showTargets('${k}')">
                  <div class="emoji">${Engine.KIND[k]}</div>
                  ${Engine.KIND[k]}
                </button>
              `).join('')}
            </div>
          ` : ''}
          ${votingUI}
        </div>
        <div class="game-right">
          <div style="background:rgba(26,40,71,0.8);border:1px solid var(--border);padding:10px;border-radius:8px;font-size:12px">День ${this.state.day}</div>
          <div class="players-list">
            ${this.state.players.map(p => `
              <div class="player-mini${p.alive ? ' alive' : ' dead'}" onclick="window.game.inspectPlayer('${p.id}')">
                <div class="avatar">${p.avatar}</div>
                <div>${p.nick.slice(0,8)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
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
    modal.innerHTML = `
      <div class="modal-content">
        <h2>${Engine.KIND[kind]}</h2>
        <div class="players-section">
          ${targets.map(p => `
            <button class="player-mini" style="background:rgba(26,40,71,0.8);border:1px solid var(--border);cursor:pointer;padding:10px" onclick="window.game.selectTarget('${kind}', '${p.id}')">
              ${p.avatar}<br>${p.nick}
            </button>
          `).join('')}
        </div>
        <button onclick="this.closest('.modal').remove()" style="width:100%;margin-top:15px">Отмена</button>
      </div>
    `;
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
    document.querySelectorAll('[data-auth-mode]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.preventDefault();
        this.switchAuthMode(btn.dataset.authMode);
      };
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.onsubmit = (ev) => this.doLogin(ev);
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.onsubmit = (ev) => this.doRegister(ev);

    document.querySelectorAll('[data-password-toggle]').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById(btn.dataset.passwordToggle);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Скрыть' : 'Показать';
      };
    });

    if (this.state && this.state.chat) {
      const box = document.getElementById('chatBox');
      if (box) {
        const msgs = (this.state.chat.mafia && this.state.me?.role && Engine.TEAM(this.state.me.role) === 'mafia') ? this.state.chat.mafia : this.state.phase === 'NIGHT' ? [] : this.state.chat.day;
        box.innerHTML = msgs.map(m => `
          <div class="chat-message">
            <div class="from">${m.from}</div>
            <div class="text">${m.text}</div>
          </div>
        `).join('');
        box.scrollTop = box.scrollHeight;
      }
    }

    clearInterval(this.timerId);
    if (this.state?.endsAt) this.timerId = setInterval(() => this.render(), 500);
  }

  play(sound) { console.log('🔊 ' + sound); }
}

if (!window.game) window.game = new MafiaGame();

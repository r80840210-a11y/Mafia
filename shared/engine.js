// Общий движок правил: используется и сервером (онлайн), и браузером (локальный режим).
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.Engine = f(); })(this, function () {
  const ROLES = {
    civilian: { icon: '👤', name: 'Мирный житель', team: 'town', kinds: [], desc: 'Ночью спит. Днём обсуждает, анализирует игроков и голосует.', goal: 'Найти и устранить всю мафию.' },
    commissar: { icon: '🔎', name: 'Комиссар', team: 'town', kinds: ['check'], desc: 'Каждую ночь проверяет игрока: мафия он или нет. Дон выглядит мирным.', goal: 'Помочь мирным найти мафию.' },
    doctor: { icon: '❤️', name: 'Доктор', team: 'town', kinds: ['heal'], desc: 'Каждую ночь лечит одного игрока. Вылеченный не погибнет от нападения.', goal: 'Спасать мирных и вычислить мафию.' },
    investigator: { icon: '🕵️', name: 'Следователь', team: 'town', kinds: ['check'], desc: 'Проверяет игрока: связан ли он с преступниками (мафия, маньяк).', goal: 'Найти преступников.' },
    bodyguard: { icon: '🛡️', name: 'Телохранитель', team: 'town', kinds: ['protect'], desc: 'Защищает игрока. Если на него нападут, телохранитель погибнет вместо него.', goal: 'Беречь город.' },
    witch: { icon: '🧪', name: 'Ведьма', team: 'town', kinds: ['save', 'poison'], desc: 'Одно зелье спасения и одно зелье устранения на всю игру.', goal: 'Помочь мирным мудро распорядиться зельями.' },
    sheriff: { icon: '🔫', name: 'Шериф', team: 'town', kinds: ['check', 'shoot'], desc: 'Проверяет игрока ночью. Один выстрел за игру: попадёшь в мафию или маньяка — он погибнет, в мирного — погибнешь ты.', goal: 'Уничтожить мафию.' },
    mafia: { icon: '🔪', name: 'Мафия', team: 'mafia', kinds: ['kill'], desc: 'Ночью вместе с командой выбирает жертву (решает большинство).', goal: 'Мафии должно стать не меньше остальных.' },
    don: { icon: '🎯', name: 'Дон', team: 'mafia', kinds: ['kill', 'dcheck'], desc: 'Глава мафии. Участвует в выборе жертвы и ищет Комиссара. Для Комиссара выглядит мирным.', goal: 'Вырезать город.' },
    lawyer: { icon: '💰', name: 'Адвокат', team: 'mafia', kinds: ['kill', 'cover'], desc: 'Защищает игрока от проверки: Комиссар получит ложный результат.', goal: 'Скрыть мафию от проверок.' },
    maniac: { icon: '🕶️', name: 'Маньяк', team: 'neutral', kinds: ['mkill'], desc: 'Каждую ночь убивает одного игрока. Играет сам за себя.', goal: 'Остаться последним выжившим.' },
    jester: { icon: '🤡', name: 'Шут', team: 'neutral', kinds: [], desc: 'Хочет, чтобы город казнил его голосованием.', goal: 'Быть казнённым днём — это личная победа.' }
  };
  const TEAMS = { town: 'МИРНЫЕ', mafia: 'МАФИЯ', neutral: 'НЕЙТРАЛЬНЫЕ' };
  const KIND = { kill: 'Устранить', mkill: 'Устранить', check: 'Проверить', dcheck: 'Найти Комиссара', heal: 'Лечить', protect: 'Защитить', cover: 'Прикрыть от проверки', save: 'Зелье спасения', poison: 'Зелье устранения', shoot: 'Выстрелить' };
  const EXTRA = ['witch', 'sheriff', 'lawyer', 'jester', 'bodyguard', 'investigator'];
  const TABLE = {
    4: { mafia: 1, civilian: 3 }, 5: { mafia: 1, commissar: 1, civilian: 3 }, 6: { mafia: 2, commissar: 1, civilian: 3 },
    7: { mafia: 2, commissar: 1, doctor: 1, civilian: 3 }, 8: { mafia: 2, don: 1, commissar: 1, doctor: 1, civilian: 3 },
    9: { mafia: 3, commissar: 1, doctor: 1, maniac: 1, civilian: 3 }, 10: { mafia: 3, don: 1, commissar: 1, doctor: 1, maniac: 1, civilian: 3 }
  };
  const TEAM = r => ROLES[r].team;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function autoCounts(n, extras, chaos) {
    const c = { ...TABLE[Math.max(4, Math.min(10, n))] };
    const ex = shuffle((extras || []).filter(x => EXTRA.includes(x)));
    const lim = chaos ? Math.floor(n / 2) : ex.length;
    for (let i = 0; i < ex.length && i < lim && c.civilian > 1; i++) { c.civilian--; c[ex[i]] = (c[ex[i]] || 0) + 1; }
    return c;
  }
  function expand(counts) { const a = []; for (const k in counts) for (let i = 0; i < counts[k]; i++) a.push(k); return a; }
  function newState(players, settings) {
    const st = { players, settings: { selfHeal: true, healRepeat: false, ...settings }, lastHeal: {}, witch: {}, shot: {} };
    players.forEach(p => { p.alive = true; if (p.role === 'witch') st.witch[p.id] = { save: true, poison: true }; });
    return st;
  }
  const find = (st, id) => st.players.find(p => p.id === id);
  function validate(st, actor, kind, target) {
    const me = find(st, actor), t = find(st, target);
    if (!me || !me.alive) return 'Вы не можете действовать';
    if (!ROLES[me.role].kinds.includes(kind)) return 'Это действие вам недоступно';
    if (!t || !t.alive) return 'Неверная цель';
    if (['kill', 'mkill', 'check', 'dcheck', 'poison', 'shoot'].includes(kind) && target === actor) return 'Нельзя выбрать себя';
    if (kind === 'heal') {
      if (target === actor && !st.settings.selfHeal) return 'Нельзя лечить себя';
      if (!st.settings.healRepeat && st.lastHeal[actor] === target) return 'Нельзя лечить одного игрока две ночи подряд';
    }
    if ((kind === 'save' || kind === 'poison') && !(st.witch[actor] && st.witch[actor][kind])) return 'Зелье уже использовано';
    if (kind === 'shoot' && st.shot[actor]) return 'Выстрел уже использован';
    return null;
  }
  // acts: [{actor,kind,target}] -> {deaths:[{id,cause}], priv:{id:[msg]}, stats:{id:{kills,checks,saves}}}
  function resolveNight(st, acts) {
    const by = k => acts.filter(a => a.kind === k), P = id => find(st, id);
    const priv = {}, stats = {}, say = (id, m) => (priv[id] = priv[id] || []).push(m), S = id => (stats[id] = stats[id] || { kills: 0, checks: 0, saves: 0 });
    const covered = new Set(by('cover').map(a => a.target));
    const attacks = [], mv = by('kill');
    if (mv.length) {
      const c = {}; mv.forEach(a => c[a.target] = (c[a.target] || 0) + 1);
      const mx = Math.max(...Object.values(c)), top = Object.keys(c).filter(k => c[k] === mx), t = top[Math.floor(Math.random() * top.length)];
      attacks.push({ t, by: mv.filter(a => a.target === t).map(a => a.actor) });
    }
    by('mkill').forEach(a => attacks.push({ t: a.target, by: [a.actor] }));
    const heal = by('heal')[0], prot = by('protect'), save = by('save')[0], dead = new Map(), kill = (id, c) => { if (!dead.has(id)) dead.set(id, c); };
    attacks.forEach(at => {
      if (save && save.target === at.t) { S(save.actor).saves++; return; }
      if (heal && heal.target === at.t) { S(heal.actor).saves++; return; }
      const g = prot.find(a => a.target === at.t && a.actor !== at.t);
      if (g) { kill(g.actor, 'bodyguard'); S(g.actor).saves++; return; }
      kill(at.t, 'attack'); at.by.forEach(b => S(b).kills++);
    });
    if (save) st.witch[save.actor].save = false;
    by('poison').forEach(a => { st.witch[a.actor].poison = false; kill(a.target, 'poison'); S(a.actor).kills++; });
    by('shoot').forEach(a => {
      st.shot[a.actor] = true; const t = P(a.target);
      if (TEAM(t.role) === 'mafia' || t.role === 'maniac') { kill(a.target, 'shot'); S(a.actor).kills++; } else kill(a.actor, 'misfire');
    });
    by('check').forEach(a => {
      const me = P(a.actor), t = P(a.target); S(a.actor).checks++;
      let res = me.role === 'investigator' ? (TEAM(t.role) === 'mafia' || t.role === 'maniac') : (TEAM(t.role) === 'mafia' && t.role !== 'don');
      if (covered.has(a.target)) res = !res;
      say(a.actor, me.role === 'investigator' ? `${t.nick}: ${res ? 'связан с преступниками' : 'не связан с преступниками'}` : `${t.nick}: ${res ? 'МАФИЯ' : 'не мафия'}`);
    });
    by('dcheck').forEach(a => { const t = P(a.target); S(a.actor).checks++; say(a.actor, `${t.nick}: ${t.role === 'commissar' ? 'это КОМИССАР' : 'не Комиссар'}`); });
    st.players.filter(p => p.role === 'doctor').forEach(d => st.lastHeal[d.id] = null);
    if (heal) st.lastHeal[heal.actor] = heal.target;
    const deaths = [];
    dead.forEach((cause, id) => { P(id).alive = false; deaths.push({ id, cause }); });
    return { deaths, priv, stats };
  }
  function tally(votes, tieMode) {
    const counts = {}; Object.values(votes).forEach(t => { if (t) counts[t] = (counts[t] || 0) + 1; });
    const mx = Math.max(0, ...Object.values(counts)), top = Object.keys(counts).filter(k => counts[k] === mx);
    if (!top.length) return { counts, top, executed: null, tie: false };
    if (top.length === 1) return { counts, top, executed: top[0], tie: false };
    return { counts, top, executed: tieMode === 'random' ? top[Math.floor(Math.random() * top.length)] : null, tie: true };
  }
  function checkWin(st) {
    const a = st.players.filter(p => p.alive), M = a.filter(p => TEAM(p.role) === 'mafia').length, N = a.filter(p => p.role === 'maniac').length, O = a.length - M - N;
    if (!M && !N) return 'town';
    if (M) return M >= O + N ? 'mafia' : null;
    return a.length <= 2 ? 'maniac' : null;
  }
  const didWin = (p, winner, jester) => p.role === 'jester' ? !!jester[p.id] : (winner === 'town' && TEAM(p.role) === 'town') || (winner === 'mafia' && TEAM(p.role) === 'mafia') || (winner === 'maniac' && p.role === 'maniac');
  return { ROLES, TEAMS, KIND, EXTRA, TABLE, TEAM, shuffle, autoCounts, expand, newState, validate, resolveNight, tally, checkWin, didWin };
});

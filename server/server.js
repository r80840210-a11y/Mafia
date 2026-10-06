'use strict';
const path = require('path'), http = require('http'), express = require('express'), helmet = require('helmet'), { Server } = require('socket.io');
const db = require('./db'), auth = require('./auth'), game = require('./game');
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use('/api', auth.router);
app.use('/shared', express.static(path.join(__dirname, '../shared')));
app.use(express.static(path.join(__dirname, '../client')));
app.get('/healthz', (q, r) => r.send('ok'));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
io.use(async (socket, next) => {
  try {
    const u = await auth.userByToken(auth.parseCookies(socket.handshake.headers.cookie).sid);
    if (!u) return next(new Error('unauthorized'));
    socket.data.user = { id: String(u.id), nick: u.nickname, avatar: u.avatar };
    next();
  } catch (e) { next(new Error('server')); }
});
game.attach(io);
const PORT = process.env.PORT || 3000;
db.init().then(() => server.listen(PORT, () => console.log('🎭 Mafia Online: http://localhost:' + PORT)))
  .catch(e => { console.error('Ошибка БД:', e.message); process.exit(1); });

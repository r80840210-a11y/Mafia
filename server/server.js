const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Database(path.join(__dirname, "mafia.sqlite"));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "change-this-secret-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000*60*60*24*7 }
});
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "..", "client")));

function validName(v) { return typeof v === "string" && /^[a-zA-Z0-9_А-Яа-яЁёІіЇїЄє-]{3,20}$/.test(v); }
function validPassword(v) { return typeof v === "string" && v.length >= 6 && v.length <= 72; }
function publicUser(u) {
  return {id:u.id, username:u.username, nickname:u.nickname, games:u.games, wins:u.wins, losses:u.losses, rating:u.rating};
}

app.post("/api/register", async (req,res)=>{
  const {username,nickname,password} = req.body || {};
  if(!validName(username) || !validName(nickname)) return res.status(400).json({error:"Логин и ник: 3–20 символов, только буквы, цифры, _ и -."});
  if(!validPassword(password)) return res.status(400).json({error:"Пароль должен содержать минимум 6 символов."});
  if(db.prepare("SELECT id FROM users WHERE username=? OR nickname=?").get(username,nickname))
    return res.status(409).json({error:"Такой логин или ник уже занят."});
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare("INSERT INTO users(username,nickname,password_hash) VALUES(?,?,?)").run(username,nickname,hash);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  req.session.userId = user.id;
  res.json({user:publicUser(user)});
});

app.post("/api/login", async (req,res)=>{
  const {username,password} = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username || "");
  if(!user || !(await bcrypt.compare(password || "", user.password_hash))) return res.status(401).json({error:"Неверный логин или пароль."});
  req.session.userId=user.id;
  res.json({user:publicUser(user)});
});

app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>{
  if(!req.session.userId) return res.json({user:null});
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  res.json({user:u?publicUser(u):null});
});
app.get("/api/leaderboard",(req,res)=>{
  res.json({players:db.prepare("SELECT nickname,games,wins,losses,rating FROM users ORDER BY rating DESC, wins DESC LIMIT 50").all()});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"..","client","index.html")));

const rooms = new Map();
const socketUser = new Map();

const ROLE_INFO = {
  citizen:{name:"Мирный житель",team:"Мирные",emoji:"👤",desc:"Ночью не действует. Днём ищи мафию и голосуй."},
  mafia:{name:"Мафия",team:"Мафия",emoji:"🔪",desc:"Ночью вместе с мафией выбирай жертву."},
  don:{name:"Дон",team:"Мафия",emoji:"🎩",desc:"Участвует в выборе жертвы и ночью ищет Комиссара."},
  detective:{name:"Комиссар",team:"Мирные",emoji:"🔎",desc:"Каждую ночь проверяет одного игрока на принадлежность к мафии."},
  doctor:{name:"Доктор",team:"Мирные",emoji:"❤️",desc:"Ночью лечит одного игрока и может предотвратить убийство."},
  maniac:{name:"Маньяк",team:"Нейтральные",emoji:"☠️",desc:"Ночью выбирает игрока. Цель — остаться последним."}
};

function roleSet(n) {
  if(n<=4) return ["mafia", "citizen","citizen","citizen"];
  if(n===5) return ["mafia","detective","citizen","citizen","citizen"];
  if(n===6) return ["mafia","mafia","detective","doctor","citizen","citizen"];
  if(n===7) return ["mafia","mafia","detective","doctor","citizen","citizen","citizen"];
  if(n===8) return ["don","mafia","detective","doctor","citizen","citizen","citizen","citizen"];
  if(n===9) return ["don","mafia","mafia","detective","doctor","maniac","citizen","citizen","citizen"];
  return ["don","mafia","mafia","detective","doctor","maniac","citizen","citizen","citizen","citizen"];
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function roomView(room, forSocket) {
  return {
    code:room.code, phase:room.phase, endsAt:room.endsAt, hostId:room.hostId,
    players:[...room.players.values()].map(p=>({
      id:p.id,nickname:p.nickname,alive:p.alive,ready:p.ready,
      role: forSocket && p.id===forSocket ? p.role : undefined
    })),
    settings:room.settings,
    winner:room.winner || null,
    messages:room.messages.slice(-80)
  };
}
function emitRoom(room) {
  for(const p of room.players.values()) {
    io.to(p.socketId).emit("state", roomView(room,p.id));
  }
}
function publicBroadcast(room,event,data){ io.to(`room:${room.code}`).emit(event,data); }

function finishGame(room,winner) {
  if(room.phase==="GAME_OVER") return;
  room.phase="GAME_OVER"; room.winner=winner; room.endsAt=null;
  const winningTeam = winner==="Мирные" ? "Мирные" : winner==="Мафия" ? "Мафия" : "Нейтральные";
  for(const p of room.players.values()){
    const won = p.role=== "maniac" ? winningTeam==="Нейтральные" : ROLE_INFO[p.role].team===winningTeam;
    db.prepare("UPDATE users SET games=games+1, wins=wins+?, losses=losses+?, rating=MAX(0,rating+?) WHERE id=?")
      .run(won?1:0,won?0:1,won?50:-25,p.userId);
  }
  emitRoom(room);
}
function checkWin(room) {
  const alive=[...room.players.values()].filter(p=>p.alive);
  const mafia=alive.filter(p=>["mafia","don"].includes(p.role)).length;
  const citizens=alive.filter(p=>["citizen","detective","doctor"].includes(p.role)).length;
  const maniac=alive.filter(p=>p.role==="maniac").length;
  if(maniac===1 && alive.length===1) return finishGame(room,"Нейтральные");
  if(mafia===0) return finishGame(room,"Мирные");
  if(mafia>=citizens+maniac) return finishGame(room,"Мафия");
}
function beginNight(room) {
  room.phase="NIGHT"; room.night={}; room.endsAt=Date.now()+room.settings.night*1000;
  publicBroadcast(room,"phase","🌙 Наступила ночь");
  emitRoom(room);
}
function beginDay(room) {
  resolveNight(room);
  if(room.phase==="GAME_OVER") return;
  room.phase="DAY"; room.endsAt=Date.now()+room.settings.day*1000;
  publicBroadcast(room,"phase","☀️ Наступил день");
  emitRoom(room);
}
function resolveNight(room) {
  const alive=[...room.players.values()].filter(p=>p.alive);
  const killVotes={};
  for(const p of alive.filter(p=>["mafia","don"].includes(p.role))){
    const target=room.night[`mafia:${p.id}`];
    if(target) killVotes[target]=(killVotes[target]||0)+1;
  }
  let victim=null, max=0;
  for(const [id,v] of Object.entries(killVotes)) if(v>max){victim=id;max=v;}
  const doctor=alive.find(p=>p.role==="doctor");
  const saved=doctor && room.night[`doctor:${doctor.id}`];
  if(victim && victim!==saved){
    const p=room.players.get(victim); if(p) {p.alive=false; publicBroadcast(room,"notice",`☠️ Этой ночью погиб ${p.nickname}.`);}
  } else if(victim) publicBroadcast(room,"notice","❤️ Ночью доктор спас жертву.");
  const maniac=alive.find(p=>p.role==="maniac");
  const mt=maniac && room.night[`maniac:${maniac.id}`];
  if(maniac && mt && mt!==saved){
    const p=room.players.get(mt); if(p && p.alive){p.alive=false; publicBroadcast(room,"notice",`☠️ Этой ночью погиб ${p.nickname}.`);}
  }
  const det=alive.find(p=>p.role==="detective");
  if(det){
    const target=room.night[`detective:${det.id}`];
    const t=room.players.get(target);
    if(t) io.to(det.socketId).emit("privateNotice",`${t.nickname}: ${["mafia","don"].includes(t.role)?"МАФИЯ":"не мафия"}.`);
  }
  checkWin(room);
}

function startRoom(room) {
  if(room.players.size<4 || room.players.size>10) return;
  const roles=shuffle(roleSet(room.players.size));
  [...room.players.values()].forEach((p,i)=>{p.role=roles[i];p.alive=true;});
  room.phase="START"; room.winner=null;
  for(const p of room.players.values()) io.to(p.socketId).emit("role",ROLE_INFO[p.role]);
  setTimeout(()=>beginNight(room),3500);
  emitRoom(room);
}

io.use((socket,next)=>sessionMiddleware(socket.request,{},next));

io.on("connection",socket=>{
  socket.on("identify",({userId})=>{
    const u=db.prepare("SELECT * FROM users WHERE id=?").get(userId);
    if(u) socketUser.set(socket.id,u);
  });

  socket.on("createRoom",({settings}={})=>{
    const u=socketUser.get(socket.id); if(!u) return socket.emit("errorMsg","Сначала войдите в аккаунт.");
    let code; do{code=Math.random().toString(36).slice(2,7).toUpperCase();}while(rooms.has(code));
    const room={code,hostId:u.id,phase:"LOBBY",endsAt:null,winner:null,players:new Map(),messages:[],night:{},
      settings:{day:Math.max(30,Math.min(180,Number(settings?.day)||60)),night:Math.max(20,Math.min(120,Number(settings?.night)||30))}};
    room.players.set(String(u.id),{id:String(u.id),userId:u.id,nickname:u.nickname,socketId:socket.id,ready:true,alive:true,role:null});
    rooms.set(code,room); socket.join(`room:${code}`); socket.emit("roomCreated",code); emitRoom(room);
  });

  socket.on("joinRoom",({code}={})=>{
    const u=socketUser.get(socket.id); const room=rooms.get(String(code||"").toUpperCase());
    if(!u) return socket.emit("errorMsg","Сначала войдите в аккаунт.");
    if(!room) return socket.emit("errorMsg","Комната не найдена.");
    if(room.phase!=="LOBBY") return socket.emit("errorMsg","Игра уже началась.");
    if(room.players.size>=10) return socket.emit("errorMsg","Комната заполнена.");
    const id=String(u.id);
    room.players.set(id,{id,userId:u.id,nickname:u.nickname,socketId:socket.id,ready:false,alive:true,role:null});
    socket.join(`room:${room.code}`); emitRoom(room);
  });

  socket.on("ready",()=>{
    const u=socketUser.get(socket.id); if(!u) return;
    for(const room of rooms.values()){const p=room.players.get(String(u.id)); if(p){p.ready=!p.ready; emitRoom(room);}}
  });

  socket.on("startGame",()=>{
    const u=socketUser.get(socket.id); if(!u) return;
    for(const room of rooms.values()){
      if(room.hostId===u.id && room.phase==="LOBBY" && room.players.size>=4){
        if([...room.players.values()].every(p=>p.ready)) startRoom(room);
        else socket.emit("errorMsg","Все игроки должны быть готовы.");
      }
    }
  });

  socket.on("nightAction",({action,target}={})=>{
    const u=socketUser.get(socket.id); if(!u) return;
    for(const room of rooms.values()){
      const p=room.players.get(String(u.id));
      if(!p || room.phase!=="NIGHT" || !p.alive) continue;
      if(!room.players.has(String(target)) || !room.players.get(String(target)).alive) return;
      if(["mafia","don"].includes(p.role)) room.night[`mafia:${p.id}`]=String(target);
      if(p.role==="doctor") room.night[`doctor:${p.id}`]=String(target);
      if(p.role==="detective") room.night[`detective:${p.id}`]=String(target);
      if(p.role==="maniac") room.night[`maniac:${p.id}`]=String(target);
      socket.emit("privateNotice","Действие принято.");
    }
  });

  socket.on("vote",({target}={})=>{
    const u=socketUser.get(socket.id); if(!u) return;
    for(const room of rooms.values()){
      const p=room.players.get(String(u.id));
      if(!p || room.phase!=="DAY" || !p.alive) continue;
      room.votes=room.votes||{}; room.votes[p.id]=String(target);
      const alive=[...room.players.values()].filter(x=>x.alive);
      if(alive.every(x=>room.votes[x.id])){
        const counts={}; Object.values(room.votes).forEach(t=>counts[t]=(counts[t]||0)+1);
        let best=null,max=0,tie=false;
        for(const [id,n] of Object.entries(counts)){if(n>max){best=id;max=n;tie=false}else if(n===max)tie=true;}
        if(best && !tie){const dead=room.players.get(best);dead.alive=false;publicBroadcast(room,"notice",`⚖️ Город изгнал ${dead.nickname}.`);}
        else publicBroadcast(room,"notice","⚖️ Ничья: никто не изгнан.");
        room.votes={}; checkWin(room);
        if(room.phase!=="GAME_OVER") setTimeout(()=>beginNight(room),2500);
      }
    }
  });

  socket.on("chat",({text}={})=>{
    const u=socketUser.get(socket.id); if(!u || !text || text.length>300) return;
    for(const room of rooms.values()){
      const p=room.players.get(String(u.id)); if(!p) continue;
      if(!p.alive && room.phase!=="GAME_OVER") return;
      const msg={nickname:u.nickname,text:String(text).trim(),time:Date.now()};
      room.messages.push(msg); publicBroadcast(room,"chat",msg);
    }
  });

  socket.on("disconnect",()=>{
    const u=socketUser.get(socket.id); if(!u) return;
    for(const room of rooms.values()){
      const p=room.players.get(String(u.id));
      if(p && room.phase==="LOBBY"){room.players.delete(String(u.id)); if(room.hostId===u.id){const next=room.players.values().next().value; room.hostId=next?.userId||null;} if(room.players.size===0) rooms.delete(room.code); else emitRoom(room);}
      else if(p){p.socketId=socket.id;}
    }
    socketUser.delete(socket.id);
  });
});

setInterval(()=>{
  for(const room of rooms.values()){
    if(!room.endsAt || Date.now()<room.endsAt) continue;
    if(room.phase==="NIGHT") beginDay(room);
    else if(room.phase==="DAY"){
      publicBroadcast(room,"notice","⏱️ Время обсуждения закончилось. Голосование продолжается.");
      room.endsAt=Date.now()+30*1000; room.phase="DAY"; emitRoom(room);
    }
  }
},500);

const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log(`Mafia Online: http://0.0.0.0:${PORT}`));

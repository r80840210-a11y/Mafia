const $=s=>document.querySelector(s);
let me=null, socket=null, currentRoom=null, timer=null, localMode=false;

function show(id){document.querySelectorAll(".screen").forEach(x=>x.hidden=true);$(id).hidden=false}
function msg(t){$("#authMsg").textContent=t}
async function api(url,opts={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Ошибка");return d}

async function boot(){
  const d=await api("/api/me"); if(d.user){me=d.user;enterMenu();} else show("#auth");
}
function enterMenu(){show("#menu");$("#meNick").textContent=me.nickname;$("#rating").textContent=me.rating;$("#games").textContent=me.games;$("#wins").textContent=me.wins;connect()}
function connect(){
  if(socket) socket.disconnect();
  socket=io();
  socket.on("connect",()=>socket.emit("identify",{userId:me.id}));
  socket.on("roomCreated",code=>{currentRoom=code;show("#room");});
  socket.on("state",renderRoom);
  socket.on("errorMsg",x=>alert(x));
  socket.on("privateNotice",x=>addNotice(x));
  socket.on("notice",x=>addNotice(x));
  socket.on("phase",x=>addNotice(x));
  socket.on("chat",m=>addChat(m));
  socket.on("role",r=>{renderRole(r);});
}
function renderRoom(r){
 currentRoom=r; $("#roomCode").textContent=r.code; $("#phase").textContent=r.phase;
 $("#startBtn").hidden=!(r.hostId===me.id && r.phase==="LOBBY");
 $("#readyBtn").hidden=r.phase!=="LOBBY";
 $("#players").innerHTML=r.players.map(p=>`<div class="player ${p.alive?'':'dead'}"><span>${p.nickname}${p.id==r.hostId?' 👑':''}</span><span>${p.ready?'🟢':'⚪'}</span></div>`).join("");
 if(r.endsAt){clearInterval(timer);timer=setInterval(()=>{$("#timer").textContent=Math.max(0,Math.ceil((r.endsAt-Date.now())/1000))+"с"},200); } else $("#timer").textContent="—";
 if(r.phase==="NIGHT") renderActions();
 if(r.phase==="DAY") renderVotes();
 if(r.phase==="GAME_OVER"){addNotice("🏆 Победитель: "+r.winner); $("#actions").innerHTML="";}
}
function renderRole(r){$("#roleBox").hidden=false;$("#roleBox").innerHTML=`<div style="font-size:50px">${r.emoji}</div><h2>${r.name}</h2><b>${r.team}</b><p>${r.desc}</p>`}
function renderActions(){
 const mep=currentRoom?.players.find(p=>p.id==me.id); if(!mep?.alive)return;
 const targets=currentRoom.players.filter(p=>p.alive&&p.id!=me.id);
 let role=mep.role; // role is only sent to this player in the state
 if(!role){$("#actions").innerHTML="";return}
 if(["mafia","don","doctor","detective","maniac"].includes(role)){
   $("#actions").innerHTML=`<div class="actions">${targets.map(p=>`<button data-target="${p.id}">${p.nickname}</button>`).join("")}</div>`;
   $("#actions").querySelectorAll("button").forEach(b=>b.onclick=()=>{socket.emit("nightAction",{action:role,target:b.dataset.target});b.disabled=true;b.textContent="✓ "+b.textContent});
 } else $("#actions").innerHTML="<p>У тебя нет ночного действия.</p>";
}
function renderVotes(){
 const mep=currentRoom?.players.find(p=>p.id==me.id); if(!mep?.alive)return;
 $("#actions").innerHTML=`<h3>Голосование</h3><div class="actions">${currentRoom.players.filter(p=>p.alive&&p.id!=me.id).map(p=>`<button data-target="${p.id}">⚖️ ${p.nickname}</button>`).join("")}</div>`;
 $("#actions").querySelectorAll("button").forEach(b=>b.onclick=()=>{socket.emit("vote",{target:b.dataset.target});b.disabled=true;b.textContent="✓ Голос принят"});
}
function addNotice(t){$("#notices").innerHTML=`<div>${t}</div>`+$("#notices").innerHTML}
function addChat(m){$("#chatMessages").insertAdjacentHTML("beforeend",`<div class="chat-row"><b>${esc(m.nickname)}</b>: ${esc(m.text)}</div>`);$("#chatMessages").scrollTop=99999}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#loginForm").hidden=b.dataset.tab!=="login";$("#registerForm").hidden=b.dataset.tab!=="register";msg("")});
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#loginUser").value,password:$("#loginPass").value})});me=d.user;enterMenu()}catch(x){msg(x.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();if($("#regPass").value!==$("#regPass2").value)return msg("Пароли не совпадают.");try{const d=await api("/api/register",{method:"POST",body:JSON.stringify({username:$("#regUser").value,nickname:$("#regNick").value,password:$("#regPass").value})});me=d.user;enterMenu()}catch(x){msg(x.message)}};
$("#logout").onclick=async()=>{await api("/api/logout",{method:"POST"});me=null;show("#auth")};
$("#createBtn").onclick=()=>{const day=Number(prompt("Длительность дня в секундах","60"))||60;const night=Number(prompt("Длительность ночи в секундах","30"))||30;socket.emit("createRoom",{settings:{day,night}})};
$("#joinBtn").onclick=()=>{const code=prompt("Код комнаты:");if(code)socket.emit("joinRoom",{code})};
$("#readyBtn").onclick=()=>socket.emit("ready");
$("#startBtn").onclick=()=>socket.emit("startGame");
$("#backMenu").onclick=()=>{if(confirm("Выйти из комнаты?"))show("#menu")};
$("#chatForm").onsubmit=e=>{e.preventDefault();const t=$("#chatInput").value.trim();if(t){socket.emit("chat",{text:t});$("#chatInput").value=""}};
$("#localBtn").onclick=()=>alert("Локальный режим подготовлен как следующий модуль. Онлайн-режим уже полностью подключён.");
$("#ratingBtn").onclick=async()=>{const d=await api("/api/leaderboard");$("#modalTitle").textContent="🏆 Рейтинг";$("#modalBody").innerHTML=d.players.map((p,i)=>`<p>${i+1}. <b>${esc(p.nickname)}</b> — ${p.rating} ⭐ (${p.wins} побед)</p>`).join("");$("#modal").hidden=false};
$("#modalClose").onclick=()=>$("#modal").hidden=true;
boot();

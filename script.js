/* ============================================================
   Kawaii Diary — Stage 1 (restructured)
   Room + Bookshelf + one fully working monthly Book
   Storage: localStorage (single device, per browser)
   ============================================================ */

/* ---------- STORAGE ---------- */
const STORAGE_PREFIX = 'diary:';
async function getKey(key, fallback){
  try{
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw !== null ? JSON.parse(raw) : fallback;
  }catch(e){ console.error('storage read error', e); return fallback; }
}
async function setKey(key, val){
  try{ localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)); }
  catch(e){ console.error('storage write error', e); }
}
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(){ return Math.random().toString(36).slice(2,10); }

/* ---------- DATE HELPERS ---------- */
function fmtDate(d){ return d.toISOString().slice(0,10); }
function startOfWeek(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function monthKeyOf(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }
function currentMonthKey(){ const d=new Date(); return monthKeyOf(d.getFullYear(), d.getMonth()); }
function monthLabel(mk){ const [y,m]=mk.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'long', year:'numeric'}); }
function daysInMonthOf(mk){ const [y,m]=mk.split('-').map(Number); return new Date(y,m,0).getDate(); }
const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MOODS=['😊','😐','😔','😤','🥰','😴'];
const QUOTES=[
 "Small steps, kept daily, become a life.",
 "This page is a fresh start.",
 "Discipline is choosing what you want most.",
 "Write it down. Then go do it.",
 "Progress, not perfection.",
 "One page at a time.",
 "Every month is its own small story.",
 "You showed up today — that counts.",
 "Soft days are still good days.",
 "Be proud of the tiny wins too."
];

/* ---------- STATE ---------- */
let openBookMonth = null;
let dailyDate = new Date();
let weeklyRefDate = new Date();
let currentSection = null;
let settings = { theme:'mint', stickers:[], night:false, username:'' };

const THEMES = {
  mint:  { accent:'#5FB3A3', brass:'#E7C9A9', brassLight:'#F5E3CC' },
  sky:   { accent:'#4FA0C9', brass:'#EAD9C4', brassLight:'#F6EBDB' },
  blush: { accent:'#E38B9E', brass:'#F0D9C4', brassLight:'#F9EBDD' },
  lilac: { accent:'#9C8BC9', brass:'#E3D6EA', brassLight:'#F2EBF7' },
};
function applyTheme(name){
  const t = THEMES[name] || THEMES.mint;
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent);
  r.setProperty('--mint-deep', t.accent);
  r.setProperty('--brass', t.brass);
  r.setProperty('--brass-light', t.brassLight);
}

/* ---------- NIGHT MODE ---------- */
function applyNightClass(isNight){
  document.getElementById('room').classList.toggle('night', isNight);
  document.body.classList.toggle('night', isNight);
}

/* ---------- NIGHT STARS (each one sparkles independently) ---------- */
function renderNightStars(){
  const el = document.getElementById('stars');
  if(!el || el.dataset.built) return;
  el.dataset.built = '1';
  const n = 16;
  let html = '';
  for(let i=0; i<n; i++){
    const top = (Math.random()*82).toFixed(1);
    const left = (Math.random()*94).toFixed(1);
    const size = (6 + Math.random()*9).toFixed(1);
    const delay = (Math.random()*3).toFixed(2);
    const dur = (1.8 + Math.random()*1.8).toFixed(2);
    html += `<span class="night-star" style="top:${top}%; left:${left}%; font-size:${size}px; animation-delay:${delay}s; animation-duration:${dur}s;">✦</span>`;
  }
  el.innerHTML = html;
}

/* ---------- NICKNAME BADGE ---------- */
function updateNicknameBadge(){
  const el = document.getElementById('nicknameText');
  if(el) el.textContent = settings.username || 'Friend';
}

/* ---------- SETTINGS MODAL (theme + stickers, opened via gear icon) ---------- */
function renderSettingsModal(){
  const themeRow = document.getElementById('settingsThemeRow');
  const stickerRow = document.getElementById('settingsStickerRow');
  if(themeRow){
    themeRow.innerHTML = Object.keys(THEMES).map(name=>`
      <div class="theme-swatch ${settings.theme===name?'active':''}" data-action="theme:set" data-theme="${name}"
        style="background:${THEMES[name].accent}"></div>`).join('');
  }
  if(stickerRow){
    stickerRow.innerHTML = ['⭐','🌿','☕','🍡','🌙','📌','💛','🎀','🎯','🌸'].map(e=>`<button class="sticker-btn" data-action="sticker:add" data-emoji="${e}">${e}</button>`).join('');
  }
}

/* ---------- MONTH STATS (for spine look) ---------- */
async function monthStats(mk){
  const days = daysInMonthOf(mk);
  let written = 0;
  for(let d=1; d<=days; d++){
    const ds = mk+'-'+String(d).padStart(2,'0');
    const data = await getKey('daily:'+ds, null);
    if(data && (
      (data.entries && data.entries.length) ||
      (data.journal && data.journal.trim()) ||
      data.mood
    )) written++;
  }
  return { written, days, fullness: Math.min(1, written/days) };
}
function lerpColor(hexA, hexB, t){
  const a=[1,3,5].map(i=>parseInt(hexA.substr(i,2),16));
  const b=[1,3,5].map(i=>parseInt(hexB.substr(i,2),16));
  const c=a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function spineColor(fullness){ return lerpColor('#F5D6A3', '#5FB3A3', fullness); }

/* ---------- ROOM / SHELF ---------- */
async function ensureCurrentMonth(){
  const months = await getKey('months', []);
  if(!months.includes(currentMonthKey())){
    months.push(currentMonthKey());
    months.sort();
    await setKey('months', months);
  }
}
async function renderRoom(){
  const months = (await getKey('months', [])).slice().sort();
  const byYear = {};
  months.forEach(mk=>{ const y=mk.split('-')[0]; (byYear[y]=byYear[y]||[]).push(mk); });
  const years = Object.keys(byYear).sort();

  const countEl = document.getElementById('shelfCount');
  countEl.textContent = months.length===0
    ? "Your shelf is waiting for its first book."
    : `${months.length} book${months.length>1?'s':''} on your shelf`;

  let html='';
  for(const y of years){
    html += `<div class="year-row"><div class="year-label">${y}</div><div class="shelf">`;
    for(const mk of byYear[y]){
      const stats = await monthStats(mk);
      const isCurrent = mk === currentMonthKey();
      const width = Math.round(34 + stats.fullness*46);
      const color = spineColor(stats.fullness);
      const short = monthLabel(mk).split(' ')[0];
      html += `<div class="spine ${isCurrent?'current':''}" style="width:${width}px; background:${color};" data-action="book:open" data-month="${mk}" title="${monthLabel(mk)} — ${stats.written}/${stats.days} days">${short}</div>`;
    }
    html += `</div></div>`;
  }
  document.getElementById('shelvesContainer').innerHTML = html;

  // Room footer: book count + today's date
  const rfBooks = document.getElementById('rfBooks');
  const rfDate = document.getElementById('rfDate');
  if(rfBooks) rfBooks.textContent = months.length;
  if(rfDate) rfDate.textContent = '📅 ' + new Date().toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});
}

/* ---------- SECTIONS (order: Daily, Todos, Weekly, Monthly, Habits, Goals, Savings, Heart Jar) ---------- */
const SECTIONS = [
  {id:'daily', label:'Daily', render: renderDaily},
  {id:'todos', label:'To-Dos', render: renderTodos},
  {id:'weekly', label:'Weekly', render: renderWeekly},
  {id:'monthly', label:'Monthly', render: renderMonthly},
  {id:'habits', label:'Habits', render: renderHabits},
  {id:'goals', label:'Goals', render: renderGoals},
  {id:'savings', label:'Savings', render: renderSavings},
  {id:'jar', label:'Heart Jar', render: renderJar},
];

/* ---------- RENDERERS ---------- */
async function renderDaily(){
  const key = 'daily:'+fmtDate(dailyDate);
  const data = await getKey(key, {entries:[], journal:'', mood:''});
  return `
    <div class="sheet-head">
      <button class="navbtn" data-action="daily:prev">‹</button>
      <h2>${dailyDate.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'})}</h2>
      <button class="navbtn" data-action="daily:next">›</button>
    </div>
    <div class="mood-sky">
      <span class="mood-cloud mc-1">☁️</span>
      <span class="mood-cloud mc-2">☁️</span>
      <div class="mood-row">
        ${MOODS.map(m=>`<button class="mood-btn ${data.mood===m?'active':''}" data-action="daily:mood" data-mood="${m}">${m}</button>`).join('')}
      </div>
    </div>
    <div class="label-sm">Today I...</div>
    <div class="row-add">
      <input id="dailyEntryInput" placeholder="e.g. Studied for 1 hour, went for a walk">
      <button class="btn" data-action="daily:entry-add">Add</button>
    </div>
    <div style="margin-bottom:10px;">
      ${data.entries.map(item=>`
        <div class="check-item ${item.done?'done':''}">
          <span class="check-box ${item.done?'on':''}" data-action="daily:entry-toggle" data-id="${item.id}">${item.done?'✓':''}</span>
          <span class="entry-label" style="flex:1;">${esc(item.text)}</span>
          <button class="del-x" data-action="daily:entry-delete" data-id="${item.id}">✕</button>
        </div>`).join('')}
    </div>
    <div class="label-sm">Journal</div>
    <textarea class="journal-box" data-field="daily-journal" placeholder="Write freely about your day...">${esc(data.journal)}</textarea>`;
}

async function renderWeekly(){
  const start = startOfWeek(weeklyRefDate);
  const end = new Date(start); end.setDate(end.getDate()+6);
  const key = 'weekly:'+fmtDate(start);
  const data = await getKey(key, {});
  const todayStr = fmtDate(new Date());
  const days = [];
  for(let i=0;i<7;i++){ const d=new Date(start); d.setDate(d.getDate()+i); days.push(d); }
  return `
    <div class="sheet-head">
      <button class="navbtn" data-action="weekly:prev">‹</button>
      <h2>${start.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${end.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</h2>
      <button class="navbtn" data-action="weekly:next">›</button>
    </div>
    <div class="week-stack">
      ${days.map((d,i)=>{
        const list = data[i] || [];
        const doneCount = list.filter(x=>x.done).length;
        const isToday = fmtDate(d) === todayStr;
        return `
        <div class="week-day-card ${isToday?'today':''}">
          <div class="week-day-head">
            <span class="week-day-name">${DOW[i]}</span>
            <span class="week-day-date">${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
            ${list.length ? `<span class="week-day-count">${doneCount}/${list.length}</span>` : ''}
          </div>
          <div class="week-day-list">
            ${list.length===0 ? `<div class="week-day-empty">Nothing planned yet.</div>` : list.map(item=>`
              <div class="check-item ${item.done?'done':''}">
                <span class="check-box ${item.done?'on':''}" data-action="weekly:toggle" data-day="${i}" data-id="${item.id}">${item.done?'✓':''}</span>
                <span style="flex:1;">${esc(item.text)}</span>
                <button class="del-x" data-action="weekly:delete" data-day="${i}" data-id="${item.id}">✕</button>
              </div>`).join('')}
          </div>
          <div class="row-add" style="margin-bottom:0;">
            <input id="wkAdd_${i}" placeholder="+ add a task for ${DOW[i]}">
            <button class="btn small" data-action="weekly:add" data-day="${i}">Add</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function renderMonthly(){
  const mk = openBookMonth;
  const data = await getKey('monthly:'+mk, {});
  const [y,m] = mk.split('-').map(Number);
  const first = new Date(y, m-1, 1);
  const startOffset = (first.getDay()+6)%7;
  const numDays = daysInMonthOf(mk);
  let cells='';
  for(let i=0;i<startOffset;i++) cells += `<div class="month-cell empty"></div>`;
  for(let d=1; d<=numDays; d++){
    const entry = data[d] || {note:'', done:false};
    cells += `
      <div class="month-cell">
        <div class="month-num-row">
          <span class="month-num">${d}</span>
          <span class="check-box ${entry.done?'on':''}" style="width:15px;height:15px;border-radius:5px;" data-action="monthly:toggle" data-day="${d}">${entry.done?'✓':''}</span>
        </div>
        <input class="month-note" data-field="monthly-note" data-day="${d}" value="${esc(entry.note)}" placeholder="">
      </div>`;
  }
  return `
    <h2 class="section-title">${monthLabel(mk)}</h2>
    <div class="month-grid">
      ${DOW.map(d=>`<div class="month-dow">${d}</div>`).join('')}
      ${cells}
    </div>`;
}

async function renderHabits(){
  const mk = openBookMonth;
  const list = await getKey('habitsList', []);
  const checks = await getKey('habitChecks:'+mk, {});
  const numDays = daysInMonthOf(mk);
  const dayNums = Array.from({length:numDays}, (_,i)=>i+1);
  return `
    <h2 class="section-title">Habit Tracker — ${monthLabel(mk)}</h2>
    <div class="row-add">
      <input id="newHabitInput" placeholder="New habit, e.g. Drink water">
      <button class="btn" data-action="habit:add">Add</button>
    </div>
    ${list.length===0 ? `<div class="empty-note">No habits yet — add your first one above.</div>` : `
    <table class="habit-table">
      <tr><th style="text-align:left">Habit</th>${dayNums.map(d=>`<th>${d}</th>`).join('')}</tr>
      ${list.map(h=>`
        <tr>
          <td class="habit-name-cell">${esc(h.name)}<button class="del-x" data-action="habit:delete" data-id="${h.id}">✕</button></td>
          ${dayNums.map(d=>{ const on = !!checks[h.id+'|'+d];
            return `<td><span class="h-dot ${on?'on':''}" data-action="habit:toggle" data-id="${h.id}" data-day="${d}">${on?'✓':''}</span></td>`;
          }).join('')}
        </tr>`).join('')}
    </table>`}`;
}

async function renderGoals(){
  const mk = openBookMonth;
  const list = await getKey('goalsList', []);
  const progress = await getKey('goalProgress:'+mk, {});
  return `
    <h2 class="section-title">Goals — ${monthLabel(mk)}</h2>
    <div class="row-add">
      <input id="newGoalInput" placeholder="New goal, e.g. Run a 10K">
      <button class="btn" data-action="goal:add">Add</button>
    </div>
    ${list.length===0 ? `<div class="empty-note">No goals yet — what are you working toward?</div>` : list.map(g=>{
      const prog = progress[g.id] || 0;
      const steps = g.steps || [];
      return `
      <div class="goal-item">
        <div class="goal-top">
          <strong>${esc(g.name)}</strong>
          <button class="del-x" data-action="goal:delete" data-id="${g.id}">✕</button>
        </div>
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${prog}%"></div></div>
        <div class="goal-controls">
          <button class="btn small ghost" data-action="goal:dec" data-id="${g.id}">−10%</button>
          <button class="btn small ghost" data-action="goal:inc" data-id="${g.id}">+10%</button>
          <span style="font-family:'Nunito',sans-serif;font-size:12px;color:var(--ink-soft)">${prog}% this month</span>
        </div>
        <div class="goal-steps">
          ${steps.map(s=>`
            <div class="check-item ${s.done?'done':''}">
              <span class="check-box ${s.done?'on':''}" data-action="goal:step-toggle" data-gid="${g.id}" data-sid="${s.id}">${s.done?'✓':''}</span>
              <span style="flex:1;font-size:13px;">${esc(s.text)}</span>
              <button class="del-x" data-action="goal:step-delete" data-gid="${g.id}" data-sid="${s.id}">✕</button>
            </div>`).join('')}
          <div class="week-col-add" style="border:none;">
            <input id="stepAdd_${g.id}" placeholder="+ add a step">
            <button data-action="goal:step-add" data-gid="${g.id}">Add</button>
          </div>
        </div>
      </div>`;
    }).join('')}`;
}

async function renderSavings(){
  const mk = openBookMonth;
  const data = await getKey('savings:'+mk, {target:0, entries:[]});
  const total = data.entries.reduce((s,e)=>s+Number(e.amount||0),0);
  const pct = data.target>0 ? Math.min(100, Math.round(total/data.target*100)) : 0;
  return `
    <h2 class="section-title">Savings — ${monthLabel(mk)}</h2>
    <div class="savings-target-row">
      Target: <input type="number" data-field="savings-target" value="${data.target}">
    </div>
    <div class="savings-total">${total.toLocaleString()} ${data.target>0?`/ ${Number(data.target).toLocaleString()}`:''}</div>
    <div class="goal-bar-track" style="margin-bottom:16px;"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
    <div class="row-add">
      <input id="newEntryLabel" placeholder="Amount label (e.g. Paycheck)" style="flex:1.2">
      <input id="newEntryAmount" type="number" placeholder="Amount" style="flex:.6">
    </div>
    <div class="row-add">
      <input id="newEntryReason" placeholder="What's it for? (optional)">
      <button class="btn" data-action="savings:add">Add</button>
    </div>
    ${data.entries.length===0 ? `<div class="empty-note">No contributions logged yet.</div>` : data.entries.slice().reverse().map(e=>`
      <div class="entry-item">
        <div class="entry-top">
          <span>${esc(e.label)} — <strong>${Number(e.amount).toLocaleString()}</strong></span>
          <button class="del-x" data-action="savings:delete" data-id="${e.id}">✕</button>
        </div>
        ${e.reason ? `<div class="entry-reason">${esc(e.reason)}</div>` : ''}
      </div>`).join('')}`;
}

async function renderTodos(){
  const mk = openBookMonth;
  const data = await getKey('todos:'+mk, []);
  return `
    <h2 class="section-title">To-Dos — ${monthLabel(mk)}</h2>
    <div class="row-add">
      <input id="newTodoInput" placeholder="Task name" style="flex:1.4">
      <input id="newTodoDue" type="date" style="flex:.8">
    </div>
    <div class="row-add">
      <select id="newTodoPriority">
        <option value="med">Priority: Medium</option>
        <option value="high">Priority: High</option>
        <option value="low">Priority: Low</option>
      </select>
      <input id="newTodoCategory" placeholder="Category (e.g. Work)">
      <button class="btn" data-action="todo:add">Add</button>
    </div>
    ${data.length===0 ? `<div class="empty-note">Nothing on the list — nice and clear.</div>` : data.map(t=>{
      const subtasks = t.subtasks || [];
      return `
      <div class="todo-card p-${t.priority||'med'}">
        <div class="todo-top">
          <div class="check-item ${t.done?'done':''}" style="padding:0;">
            <span class="check-box ${t.done?'on':''}" data-action="todo:toggle" data-id="${t.id}">${t.done?'✓':''}</span>
            <span class="entry-label" style="flex:1;font-weight:700;">${esc(t.text)}</span>
          </div>
          <button class="del-x" data-action="todo:delete" data-id="${t.id}">✕</button>
        </div>
        <div class="todo-meta">
          ${t.due ? `<span class="todo-pill">📅 ${esc(t.due)}</span>` : ''}
          <span class="todo-pill">⚑ ${t.priority==='high'?'High':t.priority==='low'?'Low':'Medium'}</span>
          ${t.category ? `<span class="todo-pill">🏷 ${esc(t.category)}</span>` : ''}
        </div>
        <div class="todo-subtasks">
          ${subtasks.map(s=>`
            <div class="check-item ${s.done?'done':''}">
              <span class="check-box ${s.done?'on':''}" data-action="todo:sub-toggle" data-tid="${t.id}" data-sid="${s.id}">${s.done?'✓':''}</span>
              <span style="flex:1;">${esc(s.text)}</span>
              <button class="del-x" data-action="todo:sub-delete" data-tid="${t.id}" data-sid="${s.id}">✕</button>
            </div>`).join('')}
          <div class="week-col-add" style="border:none;">
            <input id="subAdd_${t.id}" placeholder="+ add a subtask">
            <button data-action="todo:sub-add" data-tid="${t.id}">Add</button>
          </div>
        </div>
      </div>`;
    }).join('')}`;
}

/* ---------- HEART JAR (mood log + structured month recap) ---------- */
async function renderJar(){
  const mk = openBookMonth;
  const key = 'moodjar:'+mk;
  const data = await getKey(key, {entries:[]});
  const happy = data.entries.filter(e=>e.mood==='happy').length;
  const sad = data.entries.filter(e=>e.mood==='sad').length;
  const total = happy+sad;
  const happyPct = total ? Math.round(happy/total*100) : 0;

  // jar fill: most recent 60 drops stack from the bottom — stars for happy, crescent moons for sad
  const dots = data.entries.slice(-60).map(e=>
    e.mood==='happy'
      ? `<span class="jar-dot happy">✦</span>`
      : `<span class="jar-dot sad">☾</span>`
  ).join('');

  // ---- pull stats from other sections for the recap ----
  const numDays = daysInMonthOf(mk);

  const habitsList = await getKey('habitsList', []);
  const habitChecks = await getKey('habitChecks:'+mk, {});
  let habitDone = 0;
  const habitTotal = habitsList.length * numDays;
  habitsList.forEach(h=>{ for(let d=1; d<=numDays; d++){ if(habitChecks[h.id+'|'+d]) habitDone++; } });

  const goalsList = await getKey('goalsList', []);
  const goalProgress = await getKey('goalProgress:'+mk, {});
  const goalsCompleted = goalsList.filter(g=>(goalProgress[g.id]||0) >= 100).length;
  const avgGoalProgress = goalsList.length ? Math.round(goalsList.reduce((s,g)=>s+(goalProgress[g.id]||0),0)/goalsList.length) : 0;

  const savings = await getKey('savings:'+mk, {target:0, entries:[]});
  const savingsTotal = savings.entries.reduce((s,e)=>s+Number(e.amount||0),0);
  const savingsPct = savings.target>0 ? Math.min(100, Math.round(savingsTotal/savings.target*100)) : 0;

  const todos = await getKey('todos:'+mk, []);
  const todosDone = todos.filter(t=>t.done).length;

  let daysWritten = 0;
  for(let d=1; d<=numDays; d++){
    const ds = mk+'-'+String(d).padStart(2,'0');
    const dd = await getKey('daily:'+ds, null);
    if(dd && ((dd.entries && dd.entries.length) || (dd.journal && dd.journal.trim()) || dd.mood)) daysWritten++;
  }

  return `
    <h2 class="section-title">🫙 Heart Jar</h2>
    <div class="jar-wrap">
      <svg class="jar-svg" viewBox="0 0 140 170" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="jarGalaxy" cx="50%" cy="25%" r="85%">
            <stop offset="0%" stop-color="#3B3878" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="#14132C" stop-opacity="0.4"></stop>
          </radialGradient>
        </defs>
        <rect class="jar-lid" x="30" y="0" width="80" height="10" rx="4"></rect>
        <path class="jar-glass" fill="url(#jarGalaxy)" d="M35 20 L35 10 Q35 4 41 4 L99 4 Q105 4 105 10 L105 20
             Q125 30 125 55 L125 150 Q125 166 109 166 L31 166 Q15 166 15 150 L15 55 Q15 30 35 20 Z"></path>
        <circle class="jar-fleck" cx="46" cy="40" r="1.4" style="animation-delay:.2s"></circle>
        <circle class="jar-fleck" cx="88" cy="55" r="1.1" style="animation-delay:1.1s"></circle>
        <circle class="jar-fleck" cx="65" cy="35" r="1.6" style="animation-delay:.6s"></circle>
        <circle class="jar-fleck" cx="100" cy="90" r="1.2" style="animation-delay:1.6s"></circle>
        <circle class="jar-fleck" cx="30" cy="100" r="1.3" style="animation-delay:.9s"></circle>
        <circle class="jar-fleck" cx="55" cy="130" r="1.1" style="animation-delay:1.9s"></circle>
      </svg>
      <div class="jar-dots-layer">${dots}</div>
    </div>
    <div class="jar-stats-row">
      <div class="jar-stat"><span class="jar-stat-num">${happy}</span><span class="jar-stat-lbl">😊 Happy</span></div>
      <div class="jar-stat"><span class="jar-stat-num">${sad}</span><span class="jar-stat-lbl">😔 Sad</span></div>
    </div>
    <div class="jar-add-row">
      <button class="btn jar-add-btn happy" data-action="jar:add" data-mood="happy">😊 Feeling happy</button>
      <button class="btn jar-add-btn sad" data-action="jar:add" data-mood="sad">😔 Feeling down</button>
    </div>
    ${data.entries.length ? `<button class="btn ghost small" data-action="jar:undo" style="margin:8px auto 0;display:block;">Undo last drop</button>` : ''}

    <div class="recap-card">
      <h3 class="recap-title">${esc(settings.username || 'Friend')}'s ${monthLabel(mk)} Recap</h3>

      <div class="recap-section">
        <h4>🫙 Mood</h4>
        <ul>
          <li>Happy moments: <strong>${happy}</strong></li>
          <li>Sad moments: <strong>${sad}</strong></li>
          <li>Happy ratio: <strong>${total ? happyPct+'%' : '—'}</strong></li>
        </ul>
      </div>

      <div class="recap-section">
        <h4>✅ Habits</h4>
        <ul>
          ${habitsList.length
            ? `<li>Checked off: <strong>${habitDone}/${habitTotal}</strong> habit-days</li>`
            : `<li>No habits tracked this month</li>`}
        </ul>
      </div>

      <div class="recap-section">
        <h4>🎯 Goals</h4>
        <ul>
          ${goalsList.length ? `
          <li>Goals completed: <strong>${goalsCompleted}/${goalsList.length}</strong></li>
          <li>Average progress: <strong>${avgGoalProgress}%</strong></li>`
            : `<li>No goals set this month</li>`}
        </ul>
      </div>

      <div class="recap-section">
        <h4>💰 Savings</h4>
        <ul>
          ${savings.target>0
            ? `<li>Saved: <strong>${savingsTotal.toLocaleString()} / ${Number(savings.target).toLocaleString()}</strong> (${savingsPct}%)</li>`
            : `<li>Saved: <strong>${savingsTotal.toLocaleString()}</strong> (no target set)</li>`}
        </ul>
      </div>

      <div class="recap-section">
        <h4>📝 To-Dos</h4>
        <ul>
          <li>Completed: <strong>${todosDone}/${todos.length}</strong></li>
        </ul>
      </div>

      <div class="recap-section">
        <h4>📔 Journal</h4>
        <ul>
          <li>Days written: <strong>${daysWritten}/${numDays}</strong></li>
        </ul>
      </div>
    </div>`;
}

/* ---------- LEFT PAGE (bookplate) ---------- */
async function renderLeftPage(){
  const mk = openBookMonth;
  const stats = await monthStats(mk);
  const isCurrent = mk === currentMonthKey();
  const quoteIdx = mk.split('-').reduce((a,c)=>a+Number(c),0);
  const quote = QUOTES[quoteIdx % QUOTES.length];

  let habitsHtml;
  const list = await getKey('habitsList', []);
  if(list.length===0){
    habitsHtml = `<div style="font-size:12px;color:var(--ink-soft);font-family:'Nunito',sans-serif;">Add habits from the Habits tab.</div>`;
  } else {
    const checks = await getKey('habitChecks:'+mk, {});
    const dayNum = isCurrent ? new Date().getDate() : 1;
    habitsHtml = list.slice(0,6).map(h=>{
      const on = !!checks[h.id+'|'+dayNum];
      return `<div class="bp-habit-row"><span class="bp-dot ${on?'on':''}" data-action="habit:toggle" data-id="${h.id}" data-day="${dayNum}">${on?'✓':''}</span>${esc(h.name)}</div>`;
    }).join('');
  }

  document.getElementById('pageLeft').innerHTML = `
    <div class="bookplate">
      <div class="bp-month">${monthLabel(mk)}</div>
      <div class="bp-title">${isCurrent ? "This Month" : "Archived Book"}</div>
      <div class="bp-rule"></div>
      <div class="bp-quote">"${esc(quote)}"</div>
      <div class="bp-stat">${stats.written} of ${stats.days} days written</div>
      <div class="bp-habits">
        <h4>${isCurrent ? "Today's Habits" : "Habits (day 1)"}</h4>
        ${habitsHtml}
      </div>
      <div class="sticker-layer" id="stickerLayer" style="position:absolute; inset:0; pointer-events:none;"></div>
    </div>`;
  renderStickers();
}

function renderStickers(){
  const layer = document.getElementById('stickerLayer');
  if(!layer) return;
  layer.innerHTML = settings.stickers.map((s,i)=>
    `<div class="sticker" data-sticker-idx="${i}" style="position:absolute;left:${s.x}%; top:${s.y}%; font-size:26px; cursor:grab; user-select:none; touch-action:none; pointer-events:auto;">${s.emoji}</div>`
  ).join('');
  layer.querySelectorAll('.sticker').forEach(el=>{
    el.addEventListener('pointerdown', (e)=>{
      e.preventDefault();
      const idx = Number(el.dataset.stickerIdx);
      const bp = el.closest('.bookplate').getBoundingClientRect();
      function move(ev){
        let x = (ev.clientX - bp.left) / bp.width * 100;
        let y = (ev.clientY - bp.top) / bp.height * 100;
        x = Math.max(0, Math.min(94, x));
        y = Math.max(0, Math.min(94, y));
        el.style.left = x+'%'; el.style.top = y+'%';
        settings.stickers[idx].x = x; settings.stickers[idx].y = y;
      }
      function up(){
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        setKey('settings', settings);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  });
}

/* ---------- TABS ---------- */
function renderTabs(){
  document.getElementById('tabs').innerHTML = SECTIONS.map(s=>
    `<button class="tab ${currentSection===s.id?'active':''}" data-action="tab:${s.id}">${s.label}</button>`
  ).join('');
}

/* ---------- SHOW SECTION / FLIP (used for tabs AND prev/next navigation) ----------
   variant controls flip direction:
     'flip-y-fwd' = horizontal, right-to-left  (next day/week)
     'flip-y-bwd' = horizontal, left-to-right  (previous day/week)
     'flip-x-fwd' = vertical,   bottom-to-top  (moving to a later tab)
     'flip-x-bwd' = vertical,   top-to-bottom  (moving to an earlier tab)
   When no variant is passed (tab clicks), it's inferred automatically from
   each section's position in SECTIONS so it always matches tab order. */
async function showSection(id, animate=true, variant=null){
  const def = SECTIONS.find(s=>s.id===id);
  const html = await def.render();
  const pageRight = document.getElementById('pageRight');
  if(animate && pageRight.innerHTML.trim() !== ''){
    if(!variant){
      const curIdx = SECTIONS.findIndex(s=>s.id===currentSection);
      const newIdx = SECTIONS.findIndex(s=>s.id===id);
      variant = (newIdx >= curIdx) ? 'flip-x-fwd' : 'flip-x-bwd';
    }
    doFlip(html, ()=>{ pageRight.innerHTML = html; currentSection=id; renderTabs(); }, variant);
  } else {
    pageRight.innerHTML = html; currentSection=id; renderTabs();
  }
}
/* Element's transform is controlled purely by CSS classes (flip-y-fwd /
   flip-y-bwd / flip-x-fwd / flip-x-bwd, each defined in style.css) — JS only
   ever toggles classes, never sets inline transform, so nothing can silently
   block the animation. */
function doFlip(newHtml, onComplete, variant='flip-y-fwd'){
  const flip = document.getElementById('flip');
  const front = document.getElementById('flipFront');
  const back = document.getElementById('flipBack');
  const pageRight = document.getElementById('pageRight');
  front.innerHTML = pageRight.innerHTML;
  back.innerHTML = newHtml;

  flip.classList.remove('flipping','flip-y-fwd','flip-y-bwd','flip-x-fwd','flip-x-bwd');
  flip.classList.add(variant);
  flip.hidden = false;
  void flip.offsetWidth; // force reflow so the removed classes register

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{ flip.classList.add('flipping'); });
  });

  let done = false;
  function handler(){
    if(done) return;
    done = true;
    flip.removeEventListener('transitionend', handler);
    onComplete();
    flip.classList.remove('flipping', variant);
    flip.hidden = true;
    front.innerHTML=''; back.innerHTML='';
  }
  flip.addEventListener('transitionend', handler);
  setTimeout(handler, 900);
}
/* Re-render the current section WITH a flip (used for prev/next date navigation) */
async function flipToCurrentSection(variant){
  await showSection(currentSection, true, variant);
}
/* Re-render the current section WITHOUT a flip (used after quick edits like adding a todo) */
async function refreshCurrent(){
  const def = SECTIONS.find(s=>s.id===currentSection);
  if(!def) return;
  document.getElementById('pageRight').innerHTML = await def.render();
}

/* ---------- BOOK OPEN / CLOSE ---------- */
async function openBook(mk){
  openBookMonth = mk;
  const [y,m] = mk.split('-').map(Number);
  const isCurrent = mk === currentMonthKey();
  dailyDate = isCurrent ? new Date() : new Date(y, m-1, 1);
  weeklyRefDate = new Date(dailyDate);
  document.getElementById('bookView').hidden = false;
  document.getElementById('nicknameBadge').hidden = true;
  await renderLeftPage();
  await showSection('daily', false);
}
function closeBook(){
  document.getElementById('bookView').hidden = true;
  document.getElementById('nicknameBadge').hidden = false;
  openBookMonth = null;
  currentSection = null;
  document.getElementById('pageRight').innerHTML = '';
  renderRoom();
}

/* ---------- SUN/MOON + LAMP TOGGLE ANIMATION ---------- */
function playLampToggleAnimation(goingNight){
  const sunMoon = document.getElementById('sunMoon');
  sunMoon.classList.add('transitioning');
  sunMoon.classList.remove('setting','rising');
  void sunMoon.offsetWidth;
  sunMoon.classList.add('setting');
  setTimeout(()=>{
    applyNightClass(goingNight);
    sunMoon.classList.remove('setting');
    sunMoon.classList.add('rising');
    setTimeout(()=>{ sunMoon.classList.remove('transitioning','rising'); }, 750);
  }, 550);
}

/* ---------- WELCOME FLOW ---------- */
async function runEntryFlow(){
  if(!settings.username){
    document.getElementById('welcomeModal').hidden = false;
    return; // room renders after welcome:save
  }
  await ensureCurrentMonth();
  await renderRoom();
}

/* ---------- ACTIONS ---------- */
async function handleAction(action, el){
  if(action === 'welcome:save'){
    const name = document.getElementById('nicknameInput').value.trim();
    settings.username = name || 'Friend';
    await setKey('settings', settings);
    updateNicknameBadge();
    document.getElementById('welcomeModal').hidden = true;
    await runEntryFlow();
    return;
  }
  if(action === 'nickname:edit'){
    document.getElementById('editNicknameInput').value = settings.username || '';
    document.getElementById('editNickModal').hidden = false;
    return;
  }
  if(action === 'nickname:cancel'){
    document.getElementById('editNickModal').hidden = true;
    return;
  }
  if(action === 'nickname:save'){
    const name = document.getElementById('editNicknameInput').value.trim();
    settings.username = name || settings.username || 'Friend';
    await setKey('settings', settings);
    updateNicknameBadge();
    document.getElementById('editNickModal').hidden = true;
    return;
  }

  // SETTINGS (gear icon) — theme + stickers live here now
  if(action === 'settings:open'){
    renderSettingsModal();
    document.getElementById('settingsModal').hidden = false;
    return;
  }
  if(action === 'settings:close'){
    document.getElementById('settingsModal').hidden = true;
    return;
  }

  if(action === 'lamp:toggle'){
    const goingNight = !settings.night;
    settings.night = goingNight;
    playLampToggleAnimation(goingNight);
    await setKey('settings', settings);
    return;
  }
  if(action === 'book:open'){ await openBook(el.dataset.month); return; }
  if(action === 'book:close'){ closeBook(); return; }
  if(action === 'quick:today'){ await openBook(currentMonthKey()); return; }

  if(action.startsWith('tab:')){
    const id = action.split(':')[1];
    if(id !== currentSection) await showSection(id, true);
    return;
  }

  // DAILY
  if(action === 'daily:prev'){ dailyDate.setDate(dailyDate.getDate()-1); await flipToCurrentSection('flip-y-bwd'); return; }
  if(action === 'daily:next'){ dailyDate.setDate(dailyDate.getDate()+1); await flipToCurrentSection('flip-y-fwd'); return; }
  if(action === 'daily:mood'){
    const key='daily:'+fmtDate(dailyDate);
    const data = await getKey(key, {entries:[], journal:'', mood:''});
    data.mood = data.mood === el.dataset.mood ? '' : el.dataset.mood;
    await setKey(key, data); await refreshCurrent();
    return;
  }
  if(action === 'daily:entry-add'){
    const input = document.getElementById('dailyEntryInput');
    const text = input.value.trim();
    if(!text) return;
    const key='daily:'+fmtDate(dailyDate);
    const data = await getKey(key, {entries:[], journal:'', mood:''});
    data.entries.push({id:uid(), text, done:false});
    await setKey(key, data); await refreshCurrent();
    return;
  }
  if(action === 'daily:entry-toggle'){
    const key='daily:'+fmtDate(dailyDate);
    const data = await getKey(key, {entries:[], journal:'', mood:''});
    const item = data.entries.find(i=>i.id===el.dataset.id);
    if(item) item.done = !item.done;
    await setKey(key, data); await refreshCurrent();
    return;
  }
  if(action === 'daily:entry-delete'){
    const key='daily:'+fmtDate(dailyDate);
    const data = await getKey(key, {entries:[], journal:'', mood:''});
    data.entries = data.entries.filter(i=>i.id!==el.dataset.id);
    await setKey(key, data); await refreshCurrent();
    return;
  }

  // WEEKLY
  if(action === 'weekly:prev'){ weeklyRefDate.setDate(weeklyRefDate.getDate()-7); await flipToCurrentSection('flip-y-bwd'); return; }
  if(action === 'weekly:next'){ weeklyRefDate.setDate(weeklyRefDate.getDate()+7); await flipToCurrentSection('flip-y-fwd'); return; }
  if(action === 'weekly:add'){
    const day = el.dataset.day;
    const input = document.getElementById('wkAdd_'+day);
    const text = input.value.trim();
    if(!text) return;
    const start = startOfWeek(weeklyRefDate);
    const key = 'weekly:'+fmtDate(start);
    const data = await getKey(key, {});
    data[day] = data[day] || [];
    data[day].push({id:uid(), text, done:false});
    await setKey(key, data); await refreshCurrent();
    return;
  }
  if(action === 'weekly:toggle'){
    const start = startOfWeek(weeklyRefDate);
    const key = 'weekly:'+fmtDate(start);
    const data = await getKey(key, {});
    const item = (data[el.dataset.day]||[]).find(i=>i.id===el.dataset.id);
    if(item) item.done = !item.done;
    await setKey(key, data); await refreshCurrent();
    return;
  }
  if(action === 'weekly:delete'){
    const start = startOfWeek(weeklyRefDate);
    const key = 'weekly:'+fmtDate(start);
    const data = await getKey(key, {});
    data[el.dataset.day] = (data[el.dataset.day]||[]).filter(i=>i.id!==el.dataset.id);
    await setKey(key, data); await refreshCurrent();
    return;
  }

  // MONTHLY
  if(action === 'monthly:toggle'){
    const key = 'monthly:'+openBookMonth;
    const data = await getKey(key, {});
    const d = el.dataset.day;
    data[d] = data[d] || {note:'', done:false};
    data[d].done = !data[d].done;
    await setKey(key, data); await refreshCurrent();
    return;
  }

  // HABITS
  if(action === 'habit:add'){
    const input = document.getElementById('newHabitInput');
    const name = input.value.trim();
    if(!name) return;
    const list = await getKey('habitsList', []);
    list.push({id:uid(), name});
    await setKey('habitsList', list);
    await refreshCurrent(); await renderLeftPage();
    return;
  }
  if(action === 'habit:delete'){
    let list = await getKey('habitsList', []);
    list = list.filter(h=>h.id!==el.dataset.id);
    await setKey('habitsList', list);
    await refreshCurrent(); await renderLeftPage();
    return;
  }
  if(action === 'habit:toggle'){
    const key = 'habitChecks:'+openBookMonth;
    const checks = await getKey(key, {});
    const k = el.dataset.id+'|'+el.dataset.day;
    checks[k] = !checks[k];
    await setKey(key, checks);
    await refreshCurrent(); await renderLeftPage();
    return;
  }

  // GOALS
  if(action === 'goal:add'){
    const input = document.getElementById('newGoalInput');
    const name = input.value.trim();
    if(!name) return;
    const list = await getKey('goalsList', []);
    list.push({id:uid(), name, steps:[]});
    await setKey('goalsList', list);
    await refreshCurrent();
    return;
  }
  if(action === 'goal:delete'){
    let list = await getKey('goalsList', []);
    list = list.filter(g=>g.id!==el.dataset.id);
    await setKey('goalsList', list);
    await refreshCurrent();
    return;
  }
  if(action === 'goal:inc' || action === 'goal:dec'){
    const key = 'goalProgress:'+openBookMonth;
    const progress = await getKey(key, {});
    const cur = progress[el.dataset.id] || 0;
    progress[el.dataset.id] = Math.max(0, Math.min(100, cur + (action==='goal:inc'?10:-10)));
    await setKey(key, progress);
    await refreshCurrent();
    return;
  }
  if(action === 'goal:step-add'){
    const gid = el.dataset.gid;
    const input = document.getElementById('stepAdd_'+gid);
    const text = input.value.trim();
    if(!text) return;
    const list = await getKey('goalsList', []);
    const g = list.find(g=>g.id===gid);
    if(g){ g.steps = g.steps || []; g.steps.push({id:uid(), text, done:false}); }
    await setKey('goalsList', list);
    await refreshCurrent();
    return;
  }
  if(action === 'goal:step-toggle'){
    const list = await getKey('goalsList', []);
    const g = list.find(g=>g.id===el.dataset.gid);
    if(g){ const s = (g.steps||[]).find(s=>s.id===el.dataset.sid); if(s) s.done = !s.done; }
    await setKey('goalsList', list);
    await refreshCurrent();
    return;
  }
  if(action === 'goal:step-delete'){
    const list = await getKey('goalsList', []);
    const g = list.find(g=>g.id===el.dataset.gid);
    if(g){ g.steps = (g.steps||[]).filter(s=>s.id!==el.dataset.sid); }
    await setKey('goalsList', list);
    await refreshCurrent();
    return;
  }

  // SAVINGS
  if(action === 'savings:add'){
    const label = document.getElementById('newEntryLabel').value.trim();
    const amount = Number(document.getElementById('newEntryAmount').value);
    const reason = document.getElementById('newEntryReason').value.trim();
    if(!label || !amount) return;
    const key = 'savings:'+openBookMonth;
    const data = await getKey(key, {target:0, entries:[]});
    data.entries.push({id:uid(), label, amount, reason, date:fmtDate(new Date())});
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'savings:delete'){
    const key = 'savings:'+openBookMonth;
    const data = await getKey(key, {target:0, entries:[]});
    data.entries = data.entries.filter(e=>e.id!==el.dataset.id);
    await setKey(key, data);
    await refreshCurrent();
    return;
  }

  // TODOS
  if(action === 'todo:add'){
    const textInput = document.getElementById('newTodoInput');
    const text = textInput.value.trim();
    if(!text) return;
    const due = document.getElementById('newTodoDue').value;
    const priority = document.getElementById('newTodoPriority').value;
    const category = document.getElementById('newTodoCategory').value.trim();
    const key = 'todos:'+openBookMonth;
    const data = await getKey(key, []);
    data.push({id:uid(), text, done:false, due, priority, category, subtasks:[]});
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'todo:toggle'){
    const key = 'todos:'+openBookMonth;
    const data = await getKey(key, []);
    const t = data.find(t=>t.id===el.dataset.id);
    if(t) t.done = !t.done;
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'todo:delete'){
    const key = 'todos:'+openBookMonth;
    let data = await getKey(key, []);
    data = data.filter(t=>t.id!==el.dataset.id);
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'todo:sub-add'){
    const tid = el.dataset.tid;
    const input = document.getElementById('subAdd_'+tid);
    const text = input.value.trim();
    if(!text) return;
    const key = 'todos:'+openBookMonth;
    const data = await getKey(key, []);
    const t = data.find(t=>t.id===tid);
    if(t){ t.subtasks = t.subtasks || []; t.subtasks.push({id:uid(), text, done:false}); }
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'todo:sub-toggle'){
    const key = 'todos:'+openBookMonth;
    const data = await getKey(key, []);
    const t = data.find(t=>t.id===el.dataset.tid);
    if(t){ const s = (t.subtasks||[]).find(s=>s.id===el.dataset.sid); if(s) s.done = !s.done; }
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'todo:sub-delete'){
    const key = 'todos:'+openBookMonth;
    const data = await getKey(key, []);
    const t = data.find(t=>t.id===el.dataset.tid);
    if(t){ t.subtasks = (t.subtasks||[]).filter(s=>s.id!==el.dataset.sid); }
    await setKey(key, data);
    await refreshCurrent();
    return;
  }

  // HEART JAR
  if(action === 'jar:add'){
    const mood = el.dataset.mood;
    const key = 'moodjar:'+openBookMonth;
    const data = await getKey(key, {entries:[]});
    data.entries.push({id:uid(), mood, ts:Date.now()});
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
  if(action === 'jar:undo'){
    const key = 'moodjar:'+openBookMonth;
    const data = await getKey(key, {entries:[]});
    data.entries.pop();
    await setKey(key, data);
    await refreshCurrent();
    return;
  }

  // STYLE (theme + stickers — now triggered from the settings modal)
  if(action === 'theme:set'){
    settings.theme = el.dataset.theme;
    applyTheme(settings.theme);
    await setKey('settings', settings);
    renderSettingsModal();
    if(openBookMonth) await refreshCurrent();
    return;
  }
  if(action === 'sticker:add'){
    settings.stickers.push({emoji:el.dataset.emoji, x:20+Math.random()*50, y:20+Math.random()*50});
    await setKey('settings', settings);
    renderStickers();
    return;
  }
}

async function handleFieldChange(el){
  if(el.dataset.field === 'daily-journal'){
    const key = 'daily:'+fmtDate(dailyDate);
    const data = await getKey(key, {entries:[], journal:'', mood:''});
    data.journal = el.value;
    await setKey(key, data);
    return;
  }
  if(el.dataset.field === 'monthly-note'){
    const key = 'monthly:'+openBookMonth;
    const data = await getKey(key, {});
    const d = el.dataset.day;
    data[d] = data[d] || {note:'', done:false};
    data[d].note = el.value;
    await setKey(key, data);
    return;
  }
  if(el.dataset.field === 'savings-target'){
    const key = 'savings:'+openBookMonth;
    const data = await getKey(key, {target:0, entries:[]});
    data.target = Number(el.value) || 0;
    await setKey(key, data);
    await refreshCurrent();
    return;
  }
}

/* ---------- EVENT DELEGATION ---------- */
document.addEventListener('click', (e)=>{
  const t = e.target.closest('[data-action]');
  if(!t) return;
  handleAction(t.dataset.action, t);
});
document.addEventListener('change', (e)=>{
  const t = e.target.closest('[data-field]');
  if(!t) return;
  handleFieldChange(t);
});

/* ---------- INIT ---------- */
(async function init(){
  settings = await getKey('settings', {theme:'mint', stickers:[], night:false, username:''});
  applyTheme(settings.theme);
  applyNightClass(!!settings.night);
  renderNightStars();
  updateNicknameBadge();
  await runEntryFlow();
})();
'use client';

import { useEffect, useRef } from 'react';
import { kvGet, kvSet, kvSubscribe, uploadPhoto, compressImage } from '@/lib/store';

export default function Page() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    initApp();
  }, []);

  return <div id="app" />;
}

function initApp() {
  const ROUNDS = [
    { id:'fri', label:'Friday', course:'Mountain View Country Club', par:71, yards:6015, trackBirdies:false,
      holes:[
        {n:1,par:4,yds:392},{n:2,par:3,yds:102},{n:3,par:5,yds:546},{n:4,par:4,yds:343},{n:5,par:4,yds:258},
        {n:6,par:3,yds:180},{n:7,par:5,yds:457},{n:8,par:4,yds:300},{n:9,par:3,yds:131},
        {n:10,par:3,yds:167},{n:11,par:4,yds:300},{n:12,par:4,yds:383},{n:13,par:5,yds:582},{n:14,par:4,yds:356},
        {n:15,par:5,yds:532},{n:16,par:3,yds:151},{n:17,par:4,yds:449},{n:18,par:4,yds:386}
      ],
      si:[4,18,2,8,16,10,6,12,14,17,11,5,1,13,7,15,9,3],
      tee:'White', teeTimes:['1:18 PM','1:27 PM']
    },
    { id:'satam', label:'Saturday AM', course:'PSU White Course', par:72, yards:6130, trackBirdies:true,
      holes:[
        {n:1,par:4,yds:383},{n:2,par:4,yds:355},{n:3,par:5,yds:532},{n:4,par:4,yds:330},{n:5,par:3,yds:153},
        {n:6,par:5,yds:498},{n:7,par:3,yds:167},{n:8,par:4,yds:350},{n:9,par:4,yds:353},
        {n:10,par:5,yds:464},{n:11,par:4,yds:353},{n:12,par:3,yds:166},{n:13,par:5,yds:577},{n:14,par:3,yds:181},
        {n:15,par:4,yds:315},{n:16,par:3,yds:165},{n:17,par:4,yds:307},{n:18,par:5,yds:481}
      ],
      si:[9,5,1,13,17,3,15,11,7,8,4,16,2,18,10,14,12,6],
      tee:'White', teeTimes:['8:20 AM','8:30 AM','8:40 AM']
    },
    { id:'satpm', label:'Saturday PM', course:'PSU Blue Course', par:72, yards:6329, trackBirdies:true,
      holes:[
        {n:1,par:4,yds:360},{n:2,par:4,yds:364},{n:3,par:4,yds:387},{n:4,par:3,yds:182},{n:5,par:5,yds:499},
        {n:6,par:4,yds:383},{n:7,par:4,yds:400},{n:8,par:3,yds:161},{n:9,par:5,yds:507},
        {n:10,par:4,yds:383},{n:11,par:4,yds:310},{n:12,par:5,yds:570},{n:13,par:4,yds:358},{n:14,par:3,yds:142},
        {n:15,par:4,yds:325},{n:16,par:4,yds:385},{n:17,par:3,yds:167},{n:18,par:5,yds:446}
      ],
      si:[9,7,1,15,13,5,3,17,11,6,16,2,8,14,12,4,18,10],
      tee:'White', teeTimes:['1:35 PM','1:45 PM','1:55 PM']
    }
  ];

  function autoRoundId(){
    const now = new Date();
    const satStart = new Date(2026,6,25,0,0);
    const satNoon = new Date(2026,6,25,12,0);
    if(now < satStart) return 'fri';
    if(now < satNoon) return 'satam';
    return 'satpm';
  }

  function strokesForHole(handicap:number, si:number){
    handicap = handicap||0;
    let s = 0;
    if(handicap>=si) s=1;
    if(handicap>=18+si) s=2;
    return s;
  }

  const DEFAULT_CONFIG = {
    groups: [
      { id:'g1', name:'Group 1', players:[
        {name:'Erik Moyer', email:'efm5035@gmail.com', handicap:0, team:'A'},
        {name:'Alex Moyer', email:'adm5087@gmail.com', handicap:0, team:'A'},
        {name:'Dan Kurtz', email:'dsk313@gmail.com', handicap:0, team:'B'},
        {name:'Greg Poli', email:'gpoli111@gmail.com', handicap:0, team:'B'}
      ]},
      { id:'g2', name:'Group 2', players:[
        {name:'Jeff Schmuckler', email:'jeff.schmuckler@gmail.com', handicap:0, team:'A'},
        {name:'Chris Chilla', email:'cac5153@gmail.com', handicap:0, team:'A'},
        {name:'Chris Stein', email:'cwstein21@gmail.com', handicap:0, team:'B'},
        {name:'Ken Marone', email:'kenmarone1187@gmail.com', handicap:0, team:'B'}
      ]},
      { id:'g3', name:'Group 3', players:[
        {name:'Corey Robinson', email:'csrobinson@herbein.com', handicap:0, team:'A'},
        {name:'Ryan Krall', email:'rakrall@herbein.com', handicap:0, team:'A'},
        {name:'Shaun Spence', email:'spence24527@gmail.com', handicap:0, team:'B'},
        {name:'Ben Ellert', email:'bme5021@gmail.com', handicap:0, team:'B'}
      ]}
    ]
  };

  let state: any = {
    tab:'home',
    session: null,
    config: DEFAULT_CONFIG,
    scores: {},
    mulligans: {},
    beaver: {},
    expenses: [],
    payments: [],
    chat: [],
    loaded:false,
    activeRoundId: autoRoundId(),
    activeGroupId: null,
    activeHole: 1,
    scoreView:'entry',
    beaverPanelOpen:false,
    mulliganPanelOpen:false,
    scorecardModalOpen:false,
    pickerModalOpen:false,
    boardExpanded:{},
    boardRoundId: null
  };

  async function load(){
    const cfg = await kvGet('trip-config'); if(cfg) state.config = cfg;
    const sc = await kvGet('scores'); if(sc) state.scores = sc;
    const mu = await kvGet('mulligans'); if(mu) state.mulligans = mu;
    const bv = await kvGet('beaver'); if(bv) state.beaver = bv;
    const ex = await kvGet('expenses'); if(ex) state.expenses = ex;
    const pay = await kvGet('payments'); if(pay) state.payments = pay;
    const ch = await kvGet('chat'); if(ch) state.chat = ch;
    try{ const s = localStorage.getItem('golf-session'); if(s) state.session = JSON.parse(s); }catch(e){}

    state.loaded = true;
    state.activeGroupId = state.session ? state.session.groupId : state.config.groups[0].id;
    render();
    subscribeAll();
  }

  function subscribeAll(){
    kvSubscribe('scores', (v)=>{ state.scores = v; render(); });
    kvSubscribe('mulligans', (v)=>{ state.mulligans = v; render(); });
    kvSubscribe('beaver', (v)=>{ state.beaver = v; render(); });
    kvSubscribe('expenses', (v)=>{ state.expenses = v; render(); });
    kvSubscribe('payments', (v)=>{ state.payments = v; render(); });
    kvSubscribe('chat', (v)=>{ state.chat = v; render(); });
    kvSubscribe('trip-config', (v)=>{ state.config = v; render(); });
  }

  function saveConfig(){ kvSet('trip-config', state.config); }
  function saveScores(){ kvSet('scores', state.scores); }
  function saveMulligans(){ kvSet('mulligans', state.mulligans); }
  function saveBeaver(){ kvSet('beaver', state.beaver); }
  function saveExpenses(){ kvSet('expenses', state.expenses); }
  function savePayments(){ kvSet('payments', state.payments); }
  function saveChat(){ kvSet('chat', state.chat); }
  function saveSession(){ try{ localStorage.setItem('golf-session', JSON.stringify(state.session)); }catch(e){} }

  function allPlayers(){
    let out: string[] = [];
    state.config.groups.forEach((g:any)=>g.players.forEach((p:any)=>out.push(p.name)));
    return out;
  }
  function findPlayerObj(name:string){
    for(const g of state.config.groups){
      const p = g.players.find((x:any)=>x.name===name);
      if(p) return p;
    }
    return null;
  }
  function groupOf(id:string){ return state.config.groups.find((g:any)=>g.id===id); }
  function roundOf(id:string){ return ROUNDS.find(r=>r.id===id)!; }

  function scoreKey(roundId:string, hole:number){ return roundId+'-h'+hole; }
  function getHoleScores(roundId:string, hole:number){
    return state.scores[scoreKey(roundId,hole)] || {};
  }
  function setScore(roundId:string, hole:number, player:string, val:number){
    const k = scoreKey(roundId,hole);
    if(!state.scores[k]) state.scores[k] = {};
    state.scores[k][player] = val;
    saveScores();
  }
  function toParFor(roundId:string, player:string){
    const round = roundOf(roundId);
    let diff = 0, played=0;
    round.holes.forEach(h=>{
      const sc = getHoleScores(roundId,h.n);
      if(sc[player]!=null){ diff += (sc[player]-h.par); played++; }
    });
    return {diff, played};
  }
  function netToParFor(roundId:string, player:string){
    const round = roundOf(roundId);
    const pObj = findPlayerObj(player);
    const hcp = pObj ? (pObj.handicap||0) : 0;
    let diff = 0, played=0;
    round.holes.forEach((h,idx)=>{
      const sc = getHoleScores(roundId,h.n);
      if(sc[player]!=null){
        const strokes = strokesForHole(hcp, round.si[idx]);
        diff += (sc[player]-strokes-h.par);
        played++;
      }
    });
    return {diff, played};
  }
  function birdieEagleCount(player:string){
    let birdies=0, eagles=0;
    ROUNDS.filter(r=>r.trackBirdies).forEach(r=>{
      r.holes.forEach(h=>{
        const sc = getHoleScores(r.id,h.n);
        const s = sc[player];
        if(s==null) return;
        const d = s - h.par;
        if(d===-1) birdies++;
        else if(d<=-2) eagles++;
      });
    });
    return {birdies, eagles};
  }
  function getMulligans(roundId:string, player:string){
    const k = roundId;
    return (state.mulligans[k] && state.mulligans[k][player]) || 0;
  }
  function changeMulligan(roundId:string, player:string, delta:number){
    const k = roundId;
    if(!state.mulligans[k]) state.mulligans[k] = {};
    let v = (state.mulligans[k][player]||0) + delta;
    if(v<0) v=0;
    state.mulligans[k][player] = v;
    saveMulligans();
    render();
  }
  function beaverKey(roundId:string, groupId:string, hole:number){ return roundId+'-'+groupId+'-h'+hole; }
  function getBeaver(roundId:string, groupId:string, hole:number){
    return state.beaver[beaverKey(roundId,groupId,hole)] || null;
  }
  function setBeaver(roundId:string, groupId:string, hole:number, holder:string, lost:boolean){
    state.beaver[beaverKey(roundId,groupId,hole)] = {holder, lost: !!lost};
    saveBeaver();
  }
  function currentBeaverHolder(roundId:string, groupId:string, upToHole:number){
    const g = groupOf(groupId);
    if(!g || !g.players.length) return null;
    let holder = g.players[0].name;
    for(let h=1; h<upToHole; h++){
      const rec = getBeaver(roundId, groupId, h);
      if(rec && rec.holder) holder = rec.holder;
    }
    return holder;
  }
  function teamsForGroup(group:any){
    const a = group.players.filter((p:any)=>p.team!=='B').map((p:any)=>p.name);
    const b = group.players.filter((p:any)=>p.team==='B').map((p:any)=>p.name);
    return {a,b};
  }
  function twoVTwoResults(roundId:string, group:any){
    const {a,b} = teamsForGroup(group);
    if(a.length!==2 || b.length!==2) return null;
    const round = roundOf(roundId);
    let ptsA=0, ptsB=0, holesPlayed=0;
    round.holes.forEach((h,idx)=>{
      const sc = getHoleScores(roundId,h.n);
      const players=[...a,...b];
      if(players.some((p:string)=>sc[p]==null)) return;
      holesPlayed++;
      const net: any = {};
      players.forEach((p:string)=>{
        const pl = findPlayerObj(p);
        const strokes = strokesForHole(pl?pl.handicap:0, round.si[idx]);
        net[p] = sc[p]-strokes;
      });
      const aMin = Math.min(net[a[0]], net[a[1]]);
      const bMin = Math.min(net[b[0]], net[b[1]]);
      if(aMin<bMin) ptsA+=1; else if(bMin<aMin) ptsB+=1; else { ptsA+=0.5; ptsB+=0.5; }
      const aSum = net[a[0]]+net[a[1]];
      const bSum = net[b[0]]+net[b[1]];
      if(aSum<bSum) ptsA+=1; else if(bSum<aSum) ptsB+=1; else { ptsA+=0.5; ptsB+=0.5; }
    });
    return {a,b,ptsA,ptsB,holesPlayed};
  }
  function canEditGroup(groupId:string){
    return state.session && state.session.groupId === groupId;
  }
  function esc(s:any){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]); }
  function fmtMoney(n:number){ return '$' + (Math.round(n*100)/100).toFixed(2); }

  // Balances: sum of expense shares, offset by any recorded payments.
  function computeBalances(){
    const players = allPlayers();
    const balances: any = {};
    players.forEach(p=>balances[p]=0);
    state.expenses.forEach((e:any)=>{
      const share = e.amount / e.splitAmong.length;
      e.splitAmong.forEach((p:string)=> balances[p] = (balances[p]||0) - share);
      balances[e.paidBy] = (balances[e.paidBy]||0) + e.amount;
    });
    state.payments.forEach((pmt:any)=>{
      balances[pmt.from] = (balances[pmt.from]||0) + pmt.amount;
      balances[pmt.to] = (balances[pmt.to]||0) - pmt.amount;
    });
    return balances;
  }
  // Greedy debt simplification: turns everyone's balance into the minimum
  // number of "who pays whom" transactions instead of everyone paying everyone.
  function computeSettlements(){
    const balances = computeBalances();
    let creditors = Object.entries(balances).filter(([,v]:any)=>v>0.01).map(([p,v]:any)=>({p,amt:v}));
    let debtors = Object.entries(balances).filter(([,v]:any)=>v<-0.01).map(([p,v]:any)=>({p,amt:-v}));
    creditors.sort((a,b)=>b.amt-a.amt); debtors.sort((a,b)=>b.amt-a.amt);
    const txns: {from:string,to:string,amount:number}[] = [];
    let i=0,j=0;
    while(i<debtors.length && j<creditors.length){
      const pay = Math.min(debtors[i].amt, creditors[j].amt);
      txns.push({from:debtors[i].p, to:creditors[j].p, amount:Math.round(pay*100)/100});
      debtors[i].amt -= pay; creditors[j].amt -= pay;
      if(debtors[i].amt<0.01) i++;
      if(creditors[j].amt<0.01) j++;
    }
    return txns;
  }

  function icon(name:string){
    const icons: any = {
      home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
      score:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
      board:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
      cost:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1 1-1.8 3-1.8s3 .9 3 2-1 1.7-3 2-3 1-3 2 1.3 1.8 3 1.8 3-.8 3-1.8"/></svg>',
      feed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 01-13 7.2L3 20l1.3-5A8.5 8.5 0 1121 11.5z"/></svg>',
      user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>'
    };
    return icons[name]||'';
  }

  function render(){
    const app = document.getElementById('app');
    if(!app) return;
    if(!state.loaded){ app.innerHTML = '<div class="wrap"><div class="empty" style="color:#fff;">Loading trip data…</div></div>'; return; }

    if(state.tab==='score' && state.scoreView==='entry'){
      app.className = 'fullscreen-score';
      app.innerHTML = renderScoreEntryFullScreen() + tabbarHtml();
      bindEvents();
      return;
    }
    app.className = '';

    let body = '';
    if(state.tab==='home') body = renderHome();
    else if(state.tab==='score') body = renderScore();
    else if(state.tab==='board') body = renderBoard();
    else if(state.tab==='cost') body = renderCost();
    else if(state.tab==='feed') body = renderFeed();
    else if(state.tab==='profile') body = renderProfile();

    app.innerHTML = `
      <div class="wrap">
        <div class="header">
          <img src="/logo.png" alt="Trip logo"/>
          <div class="title">9th Annual PSU Golf Trip</div>
          <div class="subtitle">${state.session ? esc(state.session.name)+' · '+esc(groupOf(state.session.groupId)?.name||'') : 'Not signed in'}</div>
        </div>
        ${body}
      </div>
      ${tabbarHtml()}
    `;
    bindEvents();
  }
  function tabbarHtml(){
    return `
      <div class="tabbar no-print">
        ${tabBtn('home','Home')}
        ${tabBtn('score','Score')}
        ${tabBtn('board','Leaders')}
        ${tabBtn('cost','Costs')}
        ${tabBtn('feed','Feed')}
        ${tabBtn('profile','You')}
      </div>
    `;
  }
  function tabBtn(id:string,label:string){
    return `<button class="tabbtn ${state.tab===id?'active':''}" data-tab="${id}">${icon(id==='profile'?'user':id)}<span>${label}</span></button>`;
  }

  function renderHome(){
    let roundsHtml = ROUNDS.map(r=>{
      return `
      <div class="card">
        <div class="row"><h3 style="margin:0">${r.label} — ${esc(r.course)}</h3><span class="pill">Par ${r.par}</span></div>
        <div style="font-size:12px;color:var(--text-secondary);margin:4px 0 8px;">${r.yards.toLocaleString()} yds · ${esc(r.tee)} tee</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Tee times: ${r.teeTimes.join(' · ')}</div>
        <div class="divider"></div>
        ${state.config.groups.map((g:any,i:number)=>`
          <div class="row" style="margin-bottom:4px;">
            <span style="font-size:13px;">${esc(g.name)} <span style="color:var(--text-muted)">(${r.teeTimes[i]||'—'})</span></span>
            <span style="font-size:12px;color:var(--text-secondary);">${g.players.map((p:any)=>p.name).join(', ')}</span>
          </div>
        `).join('')}
      </div>`;
    }).join('');

    return `
      ${state.session ? '' : `
      <div class="card" style="border-color:var(--navy);">
        <h3>Sign in</h3>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">Pick your name so you can enter scores for your own group.</div>
        <button class="btn primary block" data-action="go-signin">Choose your name</button>
      </div>`}
      <div class="card">
        <h3>Manage roster</h3>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Edit group names, players, handicaps, and 2v2 teams.</div>
        <button class="btn block" data-action="edit-roster">Edit groups &amp; players</button>
      </div>
      ${roundsHtml}
    `;
  }

  function renderSignIn(){
    return `
      <div class="card">
        <h3>Who are you?</h3>
        <div style="display:flex;flex-wrap:wrap;">
          ${state.config.groups.map((g:any)=>`
            <div style="width:100%;margin-bottom:8px;">
              <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:4px;">${esc(g.name)}</div>
              ${g.players.map((p:any)=>`<span class="chip" data-action="pick-player" data-group="${g.id}" data-player="${esc(p.name)}">${esc(p.name)}</span>`).join('')}
            </div>
          `).join('')}
        </div>
        <button class="btn ghost block" data-action="cancel-signin" style="margin-top:6px;">Cancel</button>
      </div>
    `;
  }

  function renderRosterEditor(){
    return `
      <div class="card">
        <h3>Groups &amp; players</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Set each player's handicap (course strokes) for net scoring, and Team A / Team B for the 2v2 game within each foursome.</div>
        ${state.config.groups.map((g:any,gi:number)=>`
          <div style="margin-bottom:14px;">
            <input type="text" data-action="rename-group" data-gi="${gi}" value="${esc(g.name)}" style="font-weight:600;margin-bottom:6px;"/>
            <div style="display:grid;grid-template-columns:1fr 60px 60px 30px;gap:6px;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
              <span>Name</span><span>Hcp</span><span>Team</span><span></span>
            </div>
            ${g.players.map((p:any,pi:number)=>`
              <div style="display:grid;grid-template-columns:1fr 60px 60px 30px;gap:6px;margin-bottom:4px;">
                <input type="text" data-action="rename-player" data-gi="${gi}" data-pi="${pi}" value="${esc(p.name)}"/>
                <input type="number" data-action="set-handicap" data-gi="${gi}" data-pi="${pi}" value="${p.handicap||0}"/>
                <select data-action="set-team" data-gi="${gi}" data-pi="${pi}">
                  <option value="A" ${p.team!=='B'?'selected':''}>A</option>
                  <option value="B" ${p.team==='B'?'selected':''}>B</option>
                </select>
                <button class="btn small" data-action="remove-player" data-gi="${gi}" data-pi="${pi}">✕</button>
              </div>
            `).join('')}
            <button class="btn small" data-action="add-player" data-gi="${gi}">+ Add player</button>
          </div>
        `).join('')}
        <button class="btn primary block" data-action="done-roster">Done</button>
      </div>
    `;
  }

  function renderScore(){
    if(state.scoreView==='signin') return renderSignIn();
    if(state.scoreView==='roster') return renderRosterEditor();
    return '';
  }

  function renderScoreEntryFullScreen(){
    const round = roundOf(state.activeRoundId);
    const group = groupOf(state.activeGroupId) || state.config.groups[0];
    const hole = round.holes.find(h=>h.n===state.activeHole) || round.holes[0];
    const editable = canEditGroup(group.id);
    const beaverHolder = currentBeaverHolder(round.id, group.id, hole.n);
    const scores = getHoleScores(round.id, hole.n);
    const holeIdx = hole.n-1;

    let scoresInit: any = {...scores};
    group.players.forEach((p:any)=>{ if(scoresInit[p.name]==null) scoresInit[p.name]=hole.par; });

    const low = Math.max(1, hole.par-3);
    const high = Math.min(10, hole.par+4);
    let opts:number[] = [];
    for(let i=low;i<=high;i++) opts.push(i);
    if(!opts.includes(1)) opts.unshift(1);

    const totalMulligans = group.players.reduce((a:number,p:any)=>a+getMulligans(round.id,p.name),0);

    return `
      <div class="scoreholder">
        <div style="flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:6px 2px;">
          <img src="/logo.png" style="width:22px;height:22px;border-radius:50%;object-fit:contain;background:#fff;"/>
          <span class="chip" data-action="open-picker-modal" style="font-size:11px;">${esc(round.label)} · ${esc(group.name)} ▾</span>
          <span></span>
        </div>
        ${!editable ? `<div style="font-size:11px;color:var(--navy);background:var(--navy-light);border-radius:8px;padding:4px 8px;margin-bottom:6px;text-align:center;flex:0 0 auto;">Viewing ${esc(group.name)} — sign in to edit</div>` : ''}
        <div class="scoretopbar">
          <button class="navbtn" data-action="prev-hole" ${hole.n<=1?'disabled':''}>‹</button>
          <div class="holeinfo"><b>⛳ Hole ${hole.n}</b><br/>Par ${hole.par} · ${hole.yds} yds</div>
          <button class="navbtn" data-action="next-hole" ${hole.n>=18?'disabled':''}>›</button>
        </div>

        <div class="playersarea">
          ${group.players.map((p:any)=>{
            const val = scoresInit[p.name];
            const diff = val - hole.par;
            const strokes = strokesForHole(p.handicap||0, round.si[holeIdx]);
            const isHolder = beaverHolder===p.name;
            const dotColor = diff<=-2? 'var(--success-text)' : diff===-1? '#2E9E5B' : 'transparent';
            return `
            <div class="playerrow-compact">
              <div class="pname">
                <span class="nm">${esc(p.name)}</span>
                <span class="meta">Tm ${p.team!=='B'?'A':'B'}${strokes>0?' · +'+strokes:''}</span>
              </div>
              <div class="scorestrip">
                ${opts.map(n=>`<button class="scorebtn-sm ${n===val?'selected':''}" ${editable?`data-action="set-score" data-player="${esc(p.name)}" data-val="${n}"`:'disabled'}>${n}</button>`).join('')}
              </div>
              <div class="tagdot" style="background:${dotColor};"></div>
              <div class="beaverslot" data-action="toggle-beaver-panel">${isHolder?`<img src="/beaver.png"/>`:''}</div>
            </div>`;
          }).join('')}
        </div>

        <div class="bottomtoolbar">
          <button data-action="toggle-mulligan-panel">🍺 Mullies${totalMulligans>0?`<span class="badge-count">${totalMulligans}</span>`:''}</button>
          <button data-action="open-scorecard-modal">Scorecard</button>
          <button style="background:var(--navy);color:#fff;border-color:var(--navy);font-weight:600;" data-action="submit-hole" ${editable?'':'disabled'}>${hole.n<18?'Submit → Hole '+(hole.n+1):'Submit'}</button>
        </div>
      </div>
      ${state.beaverPanelOpen ? renderBeaverModal(round, group, hole, editable) : ''}
      ${state.mulliganPanelOpen ? renderMulliganModal(round, group, editable) : ''}
      ${state.scorecardModalOpen ? renderScorecardModal(round, group) : ''}
      ${state.pickerModalOpen ? renderPickerModal(round, group) : ''}
    `;
  }

  function renderBeaverModal(round:any, group:any, hole:any, editable:boolean){
    const beaverRec = getBeaver(round.id, group.id, hole.n);
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">🦫 Beaver ball — hole ${hole.n}</h3>
          <button class="link-btn" data-action="toggle-beaver-panel">Close</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;">
          ${group.players.map((p:any)=>`<span class="chip ${beaverRec && beaverRec.holder===p.name ? '' : 'off'}" ${editable?`data-action="set-beaver-holder" data-player="${esc(p.name)}"`:''}>${esc(p.name)}</span>`).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;">
          <input type="checkbox" ${beaverRec && beaverRec.lost ? 'checked':''} ${editable?`data-action="toggle-beaver-lost"`:'disabled'}/>
          Ball was lost this hole (shotgun a beer) 🍺
        </label>
      </div>
    </div>`;
  }
  function renderMulliganModal(round:any, group:any, editable:boolean){
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">🍺 Shotgun Mullies</h3>
          <button class="link-btn" data-action="toggle-mulligan-panel">Close</button>
        </div>
        ${group.players.map((p:any)=>`
          <div class="row" style="margin:8px 0;">
            <span style="font-size:13px;">${esc(p.name)}</span>
            <span style="display:flex;align-items:center;gap:10px;">
              <button class="btn small" ${editable?`data-action="mulligan" data-player="${esc(p.name)}" data-delta="-1"`:'disabled'}>−</button>
              <span style="min-width:16px;text-align:center;font-weight:600;">${getMulligans(round.id,p.name)}</span>
              <button class="btn small" ${editable?`data-action="mulligan" data-player="${esc(p.name)}" data-delta="1"`:'disabled'}>+</button>
            </span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }
  function renderScorecardModal(round:any, group:any){
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <span></span>
          <button class="link-btn" data-action="close-modals">Close</button>
        </div>
        ${renderFullScorecard(round, group)}
      </div>
    </div>`;
  }
  function renderPickerModal(round:any, group:any){
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">Round &amp; group</h3>
          <button class="link-btn" data-action="close-modals">Close</button>
        </div>
        <label class="field">Round</label>
        <select data-action="pick-round">
          ${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===round.id?'selected':''}>${r.label} — ${r.course}</option>`).join('')}
        </select>
        <label class="field">Group</label>
        <select data-action="pick-group">
          ${state.config.groups.map((g:any)=>`<option value="${g.id}" ${g.id===group.id?'selected':''}>${g.name}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }

  function renderFullScorecard(round:any, group:any){
    const holesOut = round.holes.filter((h:any)=>h.n<=9);
    const holesIn = round.holes.filter((h:any)=>h.n>9);
    function rowFor(p:any){
      let out=0,inn=0;
      const outCells = holesOut.map((h:any)=>{ const s=getHoleScores(round.id,h.n)[p.name]; if(s!=null) out+=s; return `<td>${s??''}</td>`; }).join('');
      const inCells = holesIn.map((h:any)=>{ const s=getHoleScores(round.id,h.n)[p.name]; if(s!=null) inn+=s; return `<td>${s??''}</td>`; }).join('');
      const tot = out+inn;
      return `<tr><td class="name">${esc(p.name)}</td>${outCells}<td><b>${out||''}</b></td>${inCells}<td><b>${inn||''}</b></td><td><b>${tot||''}</b></td></tr>`;
    }
    return `
      <div style="overflow-x:auto;">
      <div class="row"><h3 style="margin:0;">${esc(round.course)} — ${esc(group.name)}</h3></div>
      <table class="sc">
        <tr><th class="name">Hole</th>${holesOut.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>OUT</th>${holesIn.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>IN</th><th>TOT</th></tr>
        <tr><td class="name">Par</td>${holesOut.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesOut.reduce((a:number,h:any)=>a+h.par,0)}</td>${holesIn.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesIn.reduce((a:number,h:any)=>a+h.par,0)}</td><td>${round.par}</td></tr>
        ${group.players.map(rowFor).join('')}
      </table>
      </div>
    `;
  }

  function renderBoard(){
    const current = autoRoundId();
    const round = roundOf(state.boardRoundId || current);

    let grossList = allPlayers().map(p=>{
      const {diff,played} = toParFor(round.id,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let netList = allPlayers().map(p=>{
      const {diff,played} = netToParFor(round.id,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let mulliganList = allPlayers().map(p=>({p, n:getMulligans(round.id,p)}))
      .filter(x=>x.n>0).sort((a,b)=>b.n-a.n);

    const bePlayers = allPlayers().map(p=>{
      const be = birdieEagleCount(p);
      return {p, ...be, score: be.eagles*2+be.birdies};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

    const teamGames = state.config.groups.map((g:any)=>({g, result: twoVTwoResults(round.id, g)})).filter((x:any)=>x.result);

    function miniList(key:string, title:string, items:any[], renderRow:any, emptyMsg:string){
      const expanded = !!state.boardExpanded[key];
      const shown = expanded ? items : items.slice(0,4);
      return `
      <div class="card" style="padding:12px 14px;">
        <h3 style="font-size:13px;margin:0 0 8px;">${title}</h3>
        ${items.length===0? `<div class="empty" style="padding:10px 4px;font-size:12px;">${emptyMsg}</div>` :
          shown.map(renderRow).join('')}
        ${items.length>4 ? `<button class="link-btn" data-action="toggle-board-expand" data-key="${key}" style="margin-top:6px;font-size:11px;">${expanded?'Show less':'Show all '+items.length}</button>` : ''}
      </div>`;
    }

    return `
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        ${ROUNDS.map(r=>`<span class="chip ${r.id===round.id?'':'off'}" data-action="pick-board-round" data-round="${r.id}">${r.label}${r.id===current?' · now':''}</span>`).join('')}
      </div>

      ${teamGames.length>0 ? `
      <div class="card">
        <h3>🏆 2v2 game — net (best ball + low total)</h3>
        ${teamGames.map(({g,result}:any)=>{
          const aLeads = result.ptsA>result.ptsB, bLeads = result.ptsB>result.ptsA;
          return `
          <div style="margin-bottom:4px;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${esc(g.name)} · thru ${result.holesPlayed} holes</div>
            <div class="matchup">
              <div class="teamcol ${aLeads?'leading':''}">
                <div class="teamnames">${result.a.join(' & ')}</div>
                <div class="teampts">${result.ptsA}</div>
              </div>
              <div class="vs">VS</div>
              <div class="teamcol ${bLeads?'leading':''}">
                <div class="teamnames">${result.b.join(' & ')}</div>
                <div class="teampts">${result.ptsB}</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>` : `<div class="card"><div class="empty">Set Team A/B for each foursome in Edit groups &amp; players to see the 2v2 game here.</div></div>`}

      <div class="grid2">
        ${miniList('gross','⛳ Best to par — gross', grossList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;"><b>${i+1}.</b> ${esc(x.p)}</span>
            <span style="font-size:12.5px;">${x.diff>0?'+':''}${x.diff}</span>
          </div>`, 'No scores yet.')}

        ${miniList('net','🎯 Best to par — net', netList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;"><b>${i+1}.</b> ${esc(x.p)}</span>
            <span style="font-size:12.5px;">${x.diff>0?'+':''}${x.diff}</span>
          </div>`, 'No scores yet.')}

        ${miniList('mullies','🍺 Most Shotgun Mullies', mulliganList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;"><b>${i+1}.</b> ${esc(x.p)}</span>
            <span style="font-size:12.5px;">${x.n}</span>
          </div>`, 'None logged.')}

        ${miniList('birdies','🐦 Birdies &amp; 🦅 eagles', bePlayers, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;"><b>${i+1}.</b> ${esc(x.p)}</span>
            <span style="font-size:11.5px;">${x.birdies}b · ${x.eagles}e</span>
          </div>`, 'None yet.')}
      </div>
    `;
  }

  function renderCost(){
    const players = allPlayers();
    const balances = computeBalances();
    const settlements = computeSettlements();

    return `
      <div class="card">
        <h3>Add expense</h3>
        <label class="field">What was it for?</label>
        <input type="text" id="exp-desc" placeholder="Cart fees, beer, dinner..."/>
        <label class="field">Amount</label>
        <input type="number" id="exp-amount" placeholder="0.00" step="0.01"/>
        <label class="field">Who paid?</label>
        <select id="exp-paidby">${players.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>
        <label class="field">Split among</label>
        <div id="exp-split" style="display:flex;flex-wrap:wrap;">
          ${players.map(p=>`<span class="chip" data-toggle-split data-player="${esc(p)}">${esc(p)}</span>`).join('')}
        </div>
        <label class="field">Receipt photo (optional)</label>
        <input type="file" id="exp-photo" accept="image/*"/>
        <button class="btn primary block" data-action="add-expense" style="margin-top:12px;">Add expense</button>
      </div>

      <div class="card">
        <h3>Settle up</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">The fewest payments needed to square everyone up.</div>
        ${settlements.length===0? '<div class="empty">Everyone is settled up.</div>' :
          settlements.map((s,idx)=>`
          <div class="row" style="padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${esc(s.from)} <span style="color:var(--text-muted);">owes</span> ${esc(s.to)}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <b style="font-size:13px;">${fmtMoney(s.amount)}</b>
              <button class="btn small" data-action="mark-paid" data-from="${esc(s.from)}" data-to="${esc(s.to)}" data-amount="${s.amount}">Mark paid</button>
            </span>
          </div>`).join('')}
      </div>

      <div class="card">
        <h3>Balances</h3>
        ${players.map(p=>{
          const b = balances[p]||0;
          const cls = b>0.001?'success':b<-0.001?'danger':'';
          const label = b>0.001? 'is owed '+fmtMoney(b) : b<-0.001? 'owes '+fmtMoney(-b) : 'settled up';
          return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${esc(p)}</span>
            <span class="pill ${cls==='success'?'success':''}" style="${cls==='danger'?'background:var(--danger-bg);color:var(--danger-text);':''}">${label}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="card">
        <h3>All expenses</h3>
        ${state.expenses.length===0? '<div class="empty">No expenses logged yet.</div>' :
          state.expenses.slice().reverse().map((e:any)=>`
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div class="row">
              <span style="font-size:13px;">${esc(e.desc)} <span style="color:var(--text-muted);">— paid by ${esc(e.paidBy)}</span></span>
              <span style="font-size:13px;font-weight:600;">${fmtMoney(e.amount)}</span>
            </div>
            ${e.receiptUrl? `<img src="${e.receiptUrl}" style="max-width:120px;border-radius:8px;margin-top:6px;"/>` : ''}
          </div>`).join('')}
      </div>
    `;
  }

  const REACTION_EMOJIS = ['👍','❤️','😂','⛳','🍺'];
  function renderFeed(){
    return `
      <div class="card">
        <h3>Post to the feed</h3>
        <textarea id="feed-text" rows="2" placeholder="Share an update..."></textarea>
        <input type="file" id="feed-photo" accept="image/*" style="margin-top:8px;font-size:12px;"/>
        <button class="btn primary block" data-action="add-post" style="margin-top:10px;">Post</button>
      </div>
      ${state.chat.length===0? '<div class="empty">No posts yet — be the first!</div>' :
        state.chat.slice().reverse().map((m:any)=>{
          const reactions = m.reactions || {};
          return `
        <div class="msg">
          <span class="author">${esc(m.author||'Someone')}</span><span class="time">${esc(m.time||'')}</span>
          <div style="font-size:14px;margin-top:4px;clear:both;">${esc(m.text||'')}</div>
          ${m.photo? `<img src="${m.photo}"/>` : ''}
          <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">
            ${REACTION_EMOJIS.map(em=>{
              const count = reactions[em]||0;
              return `<span class="chip ${count>0?'':'off'}" style="padding:2px 8px;font-size:12px;" data-action="react" data-mid="${esc(m.id||'')}" data-emoji="${em}">${em}${count>0?' '+count:''}</span>`;
            }).join('')}
          </div>
        </div>`;
        }).join('')
      }
    `;
  }

  function renderProfile(){
    return `
      <div class="card">
        <h3>Your session</h3>
        ${state.session? `
          <div style="font-size:14px;margin-bottom:10px;">Signed in as <b>${esc(state.session.name)}</b> (${esc(groupOf(state.session.groupId)?.name||'')})</div>
          <button class="btn block" data-action="sign-out">Sign out</button>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">You're not signed in — you can view everything, but you'll need to sign in to enter scores for your group.</div>
          <button class="btn primary block" data-action="go-signin">Choose your name</button>
        `}
      </div>
      <div class="card">
        <h3>About this app</h3>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
          Scores, mulligans, expenses, and posts are shared live with everyone on the trip via Supabase. Signing in only unlocks editing for your own group's scorecard.
        </div>
      </div>
    `;
  }

  function bindEvents(){
    document.querySelectorAll('[data-tab]').forEach((el:any)=>{
      el.onclick = ()=>{ state.tab = el.dataset.tab; render(); };
    });
    document.querySelectorAll('[data-action]').forEach((el:any)=>{
      const action = el.dataset.action;
      if(action==='go-signin'){ el.onclick=()=>{ state.tab='score'; state.scoreView='signin'; render(); }; }
      if(action==='cancel-signin'){ el.onclick=()=>{ state.scoreView='entry'; render(); }; }
      if(action==='pick-player'){ el.onclick=()=>{
        state.session = {name: el.dataset.player, groupId: el.dataset.group};
        saveSession();
        state.activeGroupId = el.dataset.group;
        state.scoreView='entry';
        render();
      }; }
      if(action==='sign-out'){ el.onclick=()=>{ state.session=null; saveSession(); render(); }; }
      if(action==='edit-roster'){ el.onclick=()=>{ state.tab='score'; state.scoreView='roster'; render(); }; }
      if(action==='done-roster'){ el.onclick=()=>{ state.scoreView='entry'; render(); }; }
      if(action==='rename-group'){ el.onchange=()=>{ state.config.groups[el.dataset.gi].name=el.value; saveConfig(); }; }
      if(action==='rename-player'){ el.onchange=()=>{
        const gi=el.dataset.gi, pi=el.dataset.pi;
        state.config.groups[gi].players[pi].name=el.value; saveConfig(); render();
      }; }
      if(action==='set-handicap'){ el.onchange=()=>{
        const gi=el.dataset.gi, pi=el.dataset.pi;
        state.config.groups[gi].players[pi].handicap = parseInt(el.value,10)||0; saveConfig();
      }; }
      if(action==='set-team'){ el.onchange=()=>{
        const gi=el.dataset.gi, pi=el.dataset.pi;
        state.config.groups[gi].players[pi].team = el.value; saveConfig();
      }; }
      if(action==='remove-player'){ el.onclick=()=>{
        state.config.groups[el.dataset.gi].players.splice(el.dataset.pi,1); saveConfig(); render();
      }; }
      if(action==='add-player'){ el.onclick=()=>{
        state.config.groups[el.dataset.gi].players.push({name:'New player', email:'', handicap:0, team:'A'}); saveConfig(); render();
      }; }
      if(action==='pick-round'){ el.onchange=()=>{ state.activeRoundId=el.value; state.activeHole=1; state.pickerModalOpen=false; render(); }; }
      if(action==='pick-group'){ el.onchange=()=>{ state.activeGroupId=el.value; state.pickerModalOpen=false; render(); }; }
      if(action==='open-picker-modal'){ el.onclick=()=>{ state.pickerModalOpen=true; render(); }; }
      if(action==='open-scorecard-modal'){ el.onclick=()=>{ state.scorecardModalOpen=!state.scorecardModalOpen; render(); }; }
      if(action==='close-modals'){ el.onclick=()=>{ state.pickerModalOpen=false; state.scorecardModalOpen=false; state.beaverPanelOpen=false; state.mulliganPanelOpen=false; render(); }; }
      if(action==='set-score'){ el.onclick=()=>{
        const round = roundOf(state.activeRoundId);
        setScore(round.id, state.activeHole, el.dataset.player, parseInt(el.dataset.val,10));
        render();
      }; }
      if(action==='toggle-beaver-panel'){ el.onclick=()=>{ state.beaverPanelOpen=!state.beaverPanelOpen; render(); }; }
      if(action==='toggle-mulligan-panel'){ el.onclick=()=>{ state.mulliganPanelOpen=!state.mulliganPanelOpen; render(); }; }
      if(action==='set-beaver-holder'){ el.onclick=()=>{
        const rec = getBeaver(state.activeRoundId, state.activeGroupId, state.activeHole);
        setBeaver(state.activeRoundId, state.activeGroupId, state.activeHole, el.dataset.player, rec?rec.lost:false);
        render();
      }; }
      if(action==='toggle-beaver-lost'){ el.onclick=()=>{
        const rec = getBeaver(state.activeRoundId, state.activeGroupId, state.activeHole);
        const holder = rec?rec.holder:currentBeaverHolder(state.activeRoundId,state.activeGroupId,state.activeHole);
        setBeaver(state.activeRoundId, state.activeGroupId, state.activeHole, holder, el.checked);
      }; }
      if(action==='mulligan'){ el.onclick=()=>{ changeMulligan(state.activeRoundId, el.dataset.player, parseInt(el.dataset.delta,10)); }; }
      if(action==='submit-hole'){ el.onclick=()=>{
        if(state.activeHole<18){ state.activeHole++; }
        render();
      }; }
      if(action==='prev-hole'){ el.onclick=()=>{ if(state.activeHole>1) state.activeHole--; render(); }; }
      if(action==='next-hole'){ el.onclick=()=>{ if(state.activeHole<18) state.activeHole++; render(); }; }
      if(action==='pick-board-round'){ el.onclick=()=>{ state.boardRoundId=el.dataset.round; render(); }; }
      if(action==='toggle-board-expand'){ el.onclick=()=>{ state.boardExpanded[el.dataset.key]=!state.boardExpanded[el.dataset.key]; render(); }; }
      if(action==='react'){ el.onclick=()=>{
        const msg = state.chat.find((m:any)=>String(m.id)===el.dataset.mid);
        if(!msg) return;
        if(!msg.reactions) msg.reactions = {};
        msg.reactions[el.dataset.emoji] = (msg.reactions[el.dataset.emoji]||0) + 1;
        saveChat();
        render();
      }; }
      if(action==='mark-paid'){ el.onclick=()=>{
        state.payments.push({ id:Date.now()+'-'+Math.random().toString(36).slice(2,7), from:el.dataset.from, to:el.dataset.to, amount:parseFloat(el.dataset.amount), time:new Date().toISOString() });
        savePayments();
        render();
      }; }
      if(action==='add-expense'){ el.onclick=async ()=>{
        const desc = (document.getElementById('exp-desc') as HTMLInputElement).value.trim();
        const amount = parseFloat((document.getElementById('exp-amount') as HTMLInputElement).value);
        const paidBy = (document.getElementById('exp-paidby') as HTMLSelectElement).value;
        const splitChips = document.querySelectorAll('#exp-split .chip:not(.off)');
        const splitAmong = Array.from(splitChips).map((c:any)=>c.dataset.player);
        if(!desc || !amount || splitAmong.length===0){ alert('Add a description, amount, and at least one person to split with.'); return; }
        const photoInput = document.getElementById('exp-photo') as HTMLInputElement;
        let receiptUrl: string | null = null;
        if(photoInput.files && photoInput.files[0]){
          const compressed = await compressImage(photoInput.files[0]);
          receiptUrl = await uploadPhoto(compressed, 'receipts');
        }
        state.expenses.push({desc, amount, paidBy, splitAmong, receiptUrl});
        saveExpenses();
        render();
      }; }
      if(action==='add-post'){ el.onclick=async ()=>{
        const text = (document.getElementById('feed-text') as HTMLTextAreaElement).value.trim();
        const fileInput = document.getElementById('feed-photo') as HTMLInputElement;
        const author = state.session? state.session.name : 'Someone';
        const time = new Date().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const id = Date.now()+'-'+Math.random().toString(36).slice(2,7);
        if(fileInput.files && fileInput.files[0]){
          const compressed = await compressImage(fileInput.files[0]);
          const url = await uploadPhoto(compressed, 'chat');
          state.chat.push({id, author, text, time, photo:url, reactions:{}});
          saveChat();
          (document.getElementById('feed-text') as HTMLTextAreaElement).value='';
          render();
        } else {
          if(!text){ return; }
          state.chat.push({id, author, text, time, reactions:{}});
          saveChat();
          render();
        }
      }; }
    });
    document.querySelectorAll('[data-toggle-split]').forEach((el:any)=>{
      el.onclick = ()=>{ el.classList.toggle('off'); };
    });
  }

  load();
}

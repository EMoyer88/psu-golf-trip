'use client';

import { useEffect, useRef } from 'react';
import { kvGet, kvSet, kvSubscribe, uploadPhoto, compressImage } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import {
  ROUNDS_META, DEFAULT_CONFIG, ADMIN_EMAILS,
  strokesForHole, lowHandicapAmong, initialsFor,
  Player, RoundGroup,
} from '@/lib/tripData';

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
  const ROUNDS = ROUNDS_META;

  function autoRoundId(){
    const now = new Date();
    const satStart = new Date(2026,6,25,0,0);
    const satNoon = new Date(2026,6,25,12,0);
    if(now < satStart) return 'fri';
    if(now < satNoon) return 'satam';
    return 'satpm';
  }

  let state: any = {
    tab:'home',
    authUser: null,
    authChecked: false,
    session: null,
    authView:'signin',
    authEmail:'', authPassword:'', authConfirmPassword:'',
    authError:'', authInfo:'', authBusy:false,
    onboardingBusy:false, onboardingError:'',
    profileUploadOpen:false, profileUploadBusy:false, profileUploadError:'',
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
    beaverPanelOpen:false,
    mulliganPanelOpen:false,
    scorecardModalOpen:false,
    pickerModalOpen:false,
    boardExpanded:{},
    boardRoundId: null,
    boardNetScorecardOpen:false,
    adminView:'scoring',
    adminRoundId: null,
    adminGroupId: null,
    adminHole: 1,
    adminExpenseEditingId: null,
    printRoundId: null,
    printGroupId: null,
    printMode: 'one',
    dangerRoundId: null,
  };

  async function load(){
    const cfg = await kvGet('trip-config'); if(cfg) state.config = cfg;
    const sc = await kvGet('scores'); if(sc) state.scores = sc;
    const mu = await kvGet('mulligans'); if(mu) state.mulligans = mu;
    const bv = await kvGet('beaver'); if(bv) state.beaver = bv;
    const ex = await kvGet('expenses'); if(ex) state.expenses = ex;
    const pay = await kvGet('payments'); if(pay) state.payments = pay;
    const ch = await kvGet('chat'); if(ch) state.chat = ch;

    const { data } = await supabase.auth.getSession();
    state.authUser = data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
    state.authChecked = true;
    recomputeSession();

    supabase.auth.onAuthStateChange((_event: string, session: any) => {
      state.authUser = session ? { id: session.user.id, email: session.user.email } : null;
      recomputeSession();
      render();
    });

    state.loaded = true;
    state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
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
    kvSubscribe('trip-config', (v)=>{ state.config = v; recomputeSession(); render(); });
  }

  function saveConfig(){ kvSet('trip-config', state.config); }
  function saveScores(){ kvSet('scores', state.scores); }
  function saveMulligans(){ kvSet('mulligans', state.mulligans); }
  function saveBeaver(){ kvSet('beaver', state.beaver); }
  function saveExpenses(){ kvSet('expenses', state.expenses); }
  function savePayments(){ kvSet('payments', state.payments); }
  function saveChat(){ kvSet('chat', state.chat); }

  // ---- roster / groups ----
  function allPlayers(): Player[] { return state.config.roster; }
  function allPlayerNames(): string[] { return state.config.roster.map((p:Player)=>p.name); }
  function findPlayerObj(name:string): Player | null {
    return state.config.roster.find((p:Player)=>p.name===name) || null;
  }
  function groupsForRound(roundId:string): RoundGroup[] { return state.config.rounds[roundId] || []; }
  function groupInRound(roundId:string, groupId:string): RoundGroup | null {
    return groupsForRound(roundId).find(g=>g.id===groupId) || null;
  }
  function roundOf(id:string){ return ROUNDS.find(r=>r.id===id)!; }
  function sessionGroupIdForRound(roundId:string): string | null {
    if(!state.session) return null;
    const g = groupsForRound(roundId).find(g=>g.players.includes(state.session.name));
    return g ? g.id : null;
  }
  function defaultGroupIdForRound(roundId:string): string | null {
    const sg = sessionGroupIdForRound(roundId);
    if(sg) return sg;
    const gs = groupsForRound(roundId);
    return gs.length ? gs[0].id : null;
  }
  function canEditGroup(roundId:string, groupId:string, adminOverride?:boolean){
    if(adminOverride) return true;
    return !!state.session && sessionGroupIdForRound(roundId)===groupId;
  }
  function isAdmin(){
    return !!state.authUser && ADMIN_EMAILS.includes(String(state.authUser.email||'').trim().toLowerCase());
  }

  // ---- auth ----
  function recomputeSession(){
    if(!state.authUser){ state.session = null; return; }
    const email = String(state.authUser.email||'').trim().toLowerCase();
    const p = state.config.roster.find((r:Player)=>r.email.trim().toLowerCase()===email);
    state.session = p ? { name: p.name } : null;
  }
  async function doSignUp(){
    if(!state.authEmail || !state.authPassword){ state.authError='Enter an email and password.'; render(); return; }
    state.authError=''; state.authInfo=''; state.authBusy=true; render();
    const { data, error } = await supabase.auth.signUp({ email: state.authEmail.trim(), password: state.authPassword });
    state.authBusy=false;
    if(error){ state.authError=error.message; render(); return; }
    if(data.session){
      state.authUser = { id:data.session.user.id, email:data.session.user.email };
      recomputeSession();
      render();
    } else {
      state.authInfo = 'Check your email to confirm your account, then sign in below.';
      state.authView = 'signin';
      state.authPassword='';
      render();
    }
  }
  async function doSignIn(){
    if(!state.authEmail || !state.authPassword){ state.authError='Enter an email and password.'; render(); return; }
    state.authError=''; state.authInfo=''; state.authBusy=true; render();
    const { data, error } = await supabase.auth.signInWithPassword({ email: state.authEmail.trim(), password: state.authPassword });
    state.authBusy=false;
    if(error){ state.authError=error.message; render(); return; }
    state.authUser = { id:data.user.id, email:data.user.email };
    recomputeSession();
    state.tab='home';
    render();
  }
  async function doSignOut(){
    await supabase.auth.signOut();
    state.authUser=null; state.session=null; state.tab='home';
    render();
  }

  // ---- avatar upload ----
  async function handleAvatarFile(file: File, onDone?: ()=>void){
    if(!state.session) return;
    state.onboardingBusy = true; state.onboardingError=''; state.profileUploadError=''; state.profileUploadBusy=true; render();
    try{
      const compressed = await compressImage(file);
      const url = await uploadPhoto(compressed, 'avatars');
      if(!url){
        state.onboardingError = 'Upload failed — check your connection and try again.';
        state.profileUploadError = state.onboardingError;
      } else {
        const p = findPlayerObj(state.session.name);
        if(p){ p.avatarUrl = url; saveConfig(); }
        state.profileUploadOpen = false;
        if(onDone) onDone();
      }
    } catch(e){
      state.onboardingError = 'Something went wrong — try again.';
      state.profileUploadError = state.onboardingError;
    }
    state.onboardingBusy = false; state.profileUploadBusy = false;
    render();
  }

  function avatarHtml(p: Player | null, size:number){
    if(p && p.avatarUrl){
      return `<img src="${esc(p.avatarUrl)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:var(--navy-light);"/>`;
    }
    const initials = p ? initialsFor(p.fullName||p.name) : '?';
    const fs = Math.max(10, Math.round(size*0.4));
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;flex:0 0 auto;background:var(--navy-light);color:var(--navy);display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;">${esc(initials)}</div>`;
  }

  // ---- handicap systems ----
  function fieldLowHandicap(){ return lowHandicapAmong(state.config.roster); }
  function groupLowHandicap(group: RoundGroup){
    const players = group.players.map(n=>findPlayerObj(n)).filter(Boolean) as Player[];
    return lowHandicapAmong(players);
  }
  // Tournament net leaderboard only.
  function netStrokesForHole(playerName:string, si:number){
    const p = findPlayerObj(playerName);
    if(!p) return 0;
    return strokesForHole((p.handicap||0) - fieldLowHandicap(), si);
  }
  // Saturday (AM and PM) 2v2 match only — independent baseline, per foursome.
  function matchStrokesForHole(group: RoundGroup, playerName:string, si:number){
    const p = findPlayerObj(playerName);
    if(!p) return 0;
    return strokesForHole((p.handicap||0) - groupLowHandicap(group), si);
  }
  // Friday best-ball match only — independent baseline: lowest handicap
  // among just the 7 Friday players, not the tournament field and not any
  // single foursome's low. Never reuse fieldLowHandicap/groupLowHandicap here.
  function fridayPlayerNames(): string[] {
    const names: string[] = [];
    groupsForRound('fri').forEach(g=>g.players.forEach(n=>{ if(!names.includes(n)) names.push(n); }));
    return names;
  }
  function fridayLowHandicap(){
    const players = fridayPlayerNames().map(n=>findPlayerObj(n)).filter(Boolean) as Player[];
    return lowHandicapAmong(players);
  }
  function fridayBestBallStrokesForHole(playerName:string, si:number){
    const p = findPlayerObj(playerName);
    if(!p) return 0;
    return strokesForHole((p.handicap||0) - fridayLowHandicap(), si);
  }
  // Friday's 4-player vs 3-player best-ball match: each team's score for a
  // hole is the sum of its own best 2 net scores (regardless of team size).
  // Lower sum wins the hole; ties halve it. Separate model from twoVTwoResults
  // on purpose — team sizes differ and "how many balls count" differs too.
  function fridayBestBallResult(){
    const groups = groupsForRound('fri');
    if(groups.length<2) return null;
    const sorted = [...groups].sort((a,b)=>b.players.length-a.players.length);
    const teamBig = sorted[0], teamSmall = sorted[1];
    if(teamBig.players.length<2 || teamSmall.players.length<2) return null;
    const round = roundOf('fri');
    let ptsBig=0, ptsSmall=0, holesPlayed=0;
    round.holes.forEach((h,idx)=>{
      const sc = getHoleScores('fri', h.n);
      const allPlayers = [...teamBig.players, ...teamSmall.players];
      if(allPlayers.some((p:string)=>sc[p]==null)) return;
      holesPlayed++;
      const netBig = teamBig.players.map((p:string)=>sc[p]-fridayBestBallStrokesForHole(p, round.si[idx])).sort((a,b)=>a-b).slice(0,2);
      const netSmall = teamSmall.players.map((p:string)=>sc[p]-fridayBestBallStrokesForHole(p, round.si[idx])).sort((a,b)=>a-b).slice(0,2);
      const sumBig = netBig[0]+netBig[1];
      const sumSmall = netSmall[0]+netSmall[1];
      if(sumBig<sumSmall) ptsBig+=1; else if(sumSmall<sumBig) ptsSmall+=1; else { ptsBig+=0.5; ptsSmall+=0.5; }
    });
    return {teamBig: teamBig.players, teamSmall: teamSmall.players, ptsBig, ptsSmall, holesPlayed};
  }

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
    let diff = 0, played=0;
    round.holes.forEach((h,idx)=>{
      const sc = getHoleScores(roundId,h.n);
      if(sc[player]!=null){
        const strokes = netStrokesForHole(player, round.si[idx]);
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
    const g = groupInRound(roundId, groupId);
    if(!g || !g.players.length) return null;
    let holder = g.players[0];
    for(let h=1; h<upToHole; h++){
      const rec = getBeaver(roundId, groupId, h);
      if(rec && rec.holder) holder = rec.holder;
    }
    return holder;
  }
  function teamsForGroup(group: RoundGroup){
    if(!group.teams) return null;
    const a = group.players.filter(n=>group.teams![n]==='A');
    const b = group.players.filter(n=>group.teams![n]==='B');
    return {a,b};
  }
  function twoVTwoResults(roundId:string, group: RoundGroup){
    const teams = teamsForGroup(group);
    if(!teams || teams.a.length!==2 || teams.b.length!==2) return null;
    const {a,b} = teams;
    const round = roundOf(roundId);
    let ptsA=0, ptsB=0, holesPlayed=0;
    round.holes.forEach((h,idx)=>{
      const sc = getHoleScores(roundId,h.n);
      const players=[...a,...b];
      if(players.some((p:string)=>sc[p]==null)) return;
      holesPlayed++;
      const net: any = {};
      players.forEach((p:string)=>{
        const strokes = matchStrokesForHole(group, p, round.si[idx]);
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
  function esc(s:any){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]); }
  function fmtMoney(n:number){ return '$' + (Math.round(n*100)/100).toFixed(2); }

  function computeBalances(){
    const players = allPlayerNames();
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
      user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>',
      admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z"/></svg>'
    };
    return icons[name]||'';
  }

  function render(){
    const app = document.getElementById('app');
    if(!app) return;
    if(!state.loaded || !state.authChecked){ app.innerHTML = '<div class="wrap"><div class="empty" style="color:#fff;">Loading trip data…</div></div>'; return; }

    if(state.authUser && !state.session){
      app.className='';
      app.innerHTML = renderNotOnRoster();
      bindEvents();
      return;
    }
    if(state.authUser && state.session){
      const p = findPlayerObj(state.session.name);
      if(p && !p.avatarUrl){
        app.className='';
        app.innerHTML = renderOnboarding(p);
        bindEvents();
        return;
      }
    }

    const fullscreenScore = state.tab==='score';
    if(fullscreenScore){
      app.className = 'fullscreen-score';
      app.innerHTML = renderScoreEntryFullScreen({
        roundId: state.activeRoundId, groupId: state.activeGroupId, hole: state.activeHole
      }) + tabbarHtml();
      bindEvents();
      return;
    }
    app.className = '';

    let body = '';
    if(state.tab==='home') body = renderHome();
    else if(state.tab==='board') body = renderBoard();
    else if(state.tab==='cost') body = renderCost();
    else if(state.tab==='feed') body = renderFeed();
    else if(state.tab==='profile') body = renderProfile();
    else if(state.tab==='auth') body = renderAuth();
    else if(state.tab==='admin' && isAdmin()) body = renderAdmin();
    else { state.tab='home'; body = renderHome(); }

    app.innerHTML = `
      <div class="wrap">
        <div class="header no-print">
          <img src="/logo.png" alt="Trip logo"/>
          <div class="title">9th Annual PSU Golf Trip</div>
          <div class="subtitle">${state.session ? esc(state.session.name)+(isAdmin()?' · Admin':'') : (state.authUser ? 'Not on roster' : 'Not signed in')}</div>
        </div>
        ${body}
      </div>
      ${tabbarHtml()}
    `;
    bindEvents();
  }
  function tabbarHtml(){
    const tabs: [string,string][] = [['home','Home'],['score','Score'],['board','Leaders'],['cost','Costs'],['feed','Feed']];
    if(isAdmin()) tabs.push(['admin','Admin']);
    tabs.push(['profile','You']);
    return `
      <div class="tabbar no-print">
        ${tabs.map(([id,label])=>tabBtn(id,label)).join('')}
      </div>
    `;
  }
  function tabBtn(id:string,label:string){
    return `<button class="tabbtn ${state.tab===id?'active':''}" data-tab="${id}">${icon(id==='profile'?'user':id)}<span>${label}</span></button>`;
  }

  function renderNotOnRoster(){
    return `
      <div class="wrap">
        <div class="header">
          <img src="/logo.png" alt="Trip logo"/>
          <div class="title">9th Annual PSU Golf Trip</div>
        </div>
        <div class="card" style="text-align:center;">
          <h3>You're signed in, but not on the roster yet</h3>
          <div style="font-size:13px;color:var(--text-secondary);margin:8px 0 16px;">
            Signed in as ${esc(state.authUser.email)}. Ask the trip organizer to add your email to the roster, then reload this page.
          </div>
          <button class="btn block" data-action="sign-out">Sign out</button>
        </div>
      </div>
    `;
  }

  function renderOnboarding(p: Player){
    return `
      <div class="wrap">
        <div class="header">
          <img src="/logo.png" alt="Trip logo"/>
          <div class="title">9th Annual PSU Golf Trip</div>
        </div>
        <div class="card" style="text-align:center;">
          <h3>Add your photo</h3>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
            One last step, ${esc(p.name)} — take or upload a selfie so everyone can spot you on the leaderboard and in the chat feed.
          </div>
          ${avatarHtml(p, 96)}
          <div style="margin:18px 0 6px;display:flex;flex-direction:column;gap:10px;">
            <label class="btn primary block" style="text-align:center;cursor:pointer;">
              📷 Take a photo
              <input type="file" accept="image/*" capture="user" data-action="onboarding-file" style="display:none;"/>
            </label>
            <label class="btn block" style="text-align:center;cursor:pointer;">
              🖼️ Choose from library
              <input type="file" accept="image/*" data-action="onboarding-file" style="display:none;"/>
            </label>
          </div>
          ${state.onboardingBusy? '<div style="font-size:12px;color:var(--text-secondary);">Uploading…</div>' : ''}
          ${state.onboardingError? `<div style="font-size:12px;color:var(--danger-text);">${esc(state.onboardingError)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderAuth(){
    const signup = state.authView==='signup';
    return `
      <div class="card">
        <h3>${signup? 'Create your account' : 'Sign in'}</h3>
        <label class="field">Email</label>
        <input type="email" id="auth-email" value="${esc(state.authEmail)}" placeholder="you@example.com"/>
        <label class="field">Password</label>
        <input type="password" id="auth-password" value="${esc(state.authPassword)}" placeholder="••••••••"/>
        ${state.authError? `<div style="font-size:12px;color:var(--danger-text);margin-top:10px;">${esc(state.authError)}</div>` : ''}
        ${state.authInfo? `<div style="font-size:12px;color:var(--success-text);margin-top:10px;">${esc(state.authInfo)}</div>` : ''}
        <button class="btn primary block" style="margin-top:14px;" data-action="${signup?'submit-signup':'submit-signin'}" ${state.authBusy?'disabled':''}>
          ${state.authBusy? 'Please wait…' : (signup? 'Sign up' : 'Sign in')}
        </button>
        <button class="link-btn" style="margin-top:12px;" data-action="toggle-auth-view">
          ${signup? 'Already have an account? Sign in' : "New here? Create an account"}
        </button>
      </div>
    `;
  }

  function renderHome(){
    let roundsHtml = ROUNDS.map(r=>{
      const groups = groupsForRound(r.id);
      return `
      <div class="card">
        <div class="row"><h3 style="margin:0">${r.label} — ${esc(r.course)}</h3><span class="pill">Par ${r.par}</span></div>
        <div style="font-size:12px;color:var(--text-secondary);margin:4px 0 8px;">${r.yards.toLocaleString()} yds · ${esc(r.tee)} tee</div>
        <div class="divider"></div>
        ${groups.map(g=>`
          <div class="row" style="margin-bottom:4px;align-items:flex-start;">
            <span style="font-size:13px;white-space:nowrap;">${esc(g.teeTime)}</span>
            <span style="font-size:12px;color:var(--text-secondary);text-align:right;">${g.players.join(', ')}</span>
          </div>
        `).join('')}
      </div>`;
    }).join('');

    return `
      ${state.authUser ? '' : `
      <div class="card" style="border-color:var(--navy);">
        <h3>Sign in</h3>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">Sign in with your email so you can enter scores for your own group.</div>
        <button class="btn primary block" data-action="go-auth">Sign in / sign up</button>
      </div>`}
      ${roundsHtml}
    `;
  }

  function renderRosterEditor(){
    const roster: Player[] = state.config.roster;
    return `
      <div class="card">
        <h3>Roster</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Display name, real name, email, and handicap (used for net scoring and 2v2 strokes).</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 55px 30px;gap:6px;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
          <span>Display</span><span>Full name</span><span>Email</span><span>Hcp</span><span></span>
        </div>
        ${roster.map((p,pi)=>`
          <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 55px 30px;gap:6px;margin-bottom:6px;align-items:center;">
            <input type="text" data-action="rename-player" data-pi="${pi}" value="${esc(p.name)}"/>
            <input type="text" data-action="set-fullname" data-pi="${pi}" value="${esc(p.fullName)}"/>
            <input type="text" data-action="set-email" data-pi="${pi}" value="${esc(p.email)}"/>
            <input type="number" data-action="set-handicap" data-pi="${pi}" value="${p.handicap||0}"/>
            <button class="btn small" data-action="remove-player" data-pi="${pi}">✕</button>
          </div>
        `).join('')}
        <button class="btn small" data-action="add-player">+ Add player</button>
      </div>
      ${ROUNDS.map(r=>renderRoundGroupsEditor(r.id, r.label)).join('')}
    `;
  }

  function renderRoundGroupsEditor(roundId:string, label:string){
    const groups: RoundGroup[] = groupsForRound(roundId);
    const isTeamRound = roundId==='satam' || roundId==='satpm';
    const roster: Player[] = state.config.roster;
    return `
      <div class="card">
        <h3>${esc(label)} groups</h3>
        ${groups.map((g,gi)=>`
          <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
              <input type="text" data-action="rename-teetime" data-round="${roundId}" data-gi="${gi}" value="${esc(g.teeTime)}" style="max-width:120px;font-weight:600;"/>
              <button class="btn small" data-action="remove-group" data-round="${roundId}" data-gi="${gi}">Remove group</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">
              ${roster.map((p:Player)=>`
                <span class="chip ${g.players.includes(p.name)?'':'off'}" data-action="toggle-group-player" data-round="${roundId}" data-gi="${gi}" data-player="${esc(p.name)}">${esc(p.name)}</span>
              `).join('')}
            </div>
            ${isTeamRound ? `
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">2v2 teams:</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              ${g.players.map(name=>`
                <span style="font-size:12px;display:flex;align-items:center;gap:4px;">
                  ${esc(name)}
                  <select data-action="set-round-team" data-round="${roundId}" data-gi="${gi}" data-player="${esc(name)}" style="width:auto;padding:2px 4px;">
                    <option value="A" ${(g.teams&&g.teams[name])!=='B'?'selected':''}>A</option>
                    <option value="B" ${(g.teams&&g.teams[name])==='B'?'selected':''}>B</option>
                  </select>
                </span>
              `).join('')}
            </div>` : ''}
          </div>
        `).join('')}
        <button class="btn small" data-action="add-group" data-round="${roundId}">+ Add group</button>
      </div>
    `;
  }

  function renderScoreEntryFullScreen(opts:{roundId:string, groupId:string|null, hole:number}){
    const round = roundOf(opts.roundId);
    const groups = groupsForRound(opts.roundId);
    const group = (opts.groupId && groupInRound(opts.roundId, opts.groupId)) || groups[0];
    if(!group){
      return `<div class="scoreholder"><div class="empty" style="color:#fff;">No groups configured for ${esc(round.label)} yet.</div></div>`;
    }
    const hole = round.holes.find(h=>h.n===opts.hole) || round.holes[0];
    const editable = canEditGroup(opts.roundId, group.id);
    const beaverHolder = currentBeaverHolder(round.id, group.id, hole.n);
    const scores = getHoleScores(round.id, hole.n);
    const holeIdx = hole.n-1;
    const isFri = round.id==='fri';

    let scoresInit: any = {...scores};
    group.players.forEach((name:string)=>{ if(scoresInit[name]==null) scoresInit[name]=hole.par; });

    const low = Math.max(1, hole.par-3);
    const high = Math.min(10, hole.par+4);
    let opts_:number[] = [];
    for(let i=low;i<=high;i++) opts_.push(i);
    if(!opts_.includes(1)) opts_.unshift(1);

    const totalMulligans = group.players.reduce((a:number,name:string)=>a+getMulligans(round.id,name),0);

    return `
      <div class="scoreholder">
        <div style="flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:6px 2px;">
          <img src="/logo.png" style="width:22px;height:22px;border-radius:50%;object-fit:contain;background:#fff;"/>
          <span class="chip" data-action="open-picker-modal" style="font-size:11px;">${esc(round.label)} · ${esc(group.teeTime)} ▾</span>
          <span></span>
        </div>
        ${!editable ? `<div style="font-size:11px;color:var(--navy);background:var(--navy-light);border-radius:8px;padding:4px 8px;margin-bottom:6px;text-align:center;flex:0 0 auto;">Viewing ${esc(group.teeTime)} — sign in to edit</div>` : ''}
        <div class="scoretopbar">
          <button class="navbtn" data-action="prev-hole" ${hole.n<=1?'disabled':''}>‹</button>
          <div class="holeinfo"><b>⛳ Hole ${hole.n}</b><br/>Par ${hole.par} · ${hole.yds} yds</div>
          <button class="navbtn" data-action="next-hole" ${hole.n>=18?'disabled':''}>›</button>
        </div>

        <div class="playersarea">
          ${group.players.map((name:string)=>{
            const p = findPlayerObj(name);
            const val = scoresInit[name];
            const diff = val - hole.par;
            let meta = '';
            if(isFri){
              const s = fridayBestBallStrokesForHole(name, round.si[holeIdx]);
              meta = s>0 ? ('+'+s) : '';
            } else if(group.teams && group.teams[name]){
              const s = matchStrokesForHole(group, name, round.si[holeIdx]);
              meta = 'Tm '+group.teams[name]+(s>0?' · +'+s:'');
            }
            const isHolder = beaverHolder===name;
            const dotColor = diff<=-2? 'var(--success-text)' : diff===-1? '#2E9E5B' : 'transparent';
            return `
            <div class="playerrow-compact">
              ${avatarHtml(p, 40)}
              <div class="pname">
                <span class="nm">${esc(name)}</span>
                <span class="meta">${meta}</span>
              </div>
              <div class="scorestrip">
                ${opts_.map(n=>`<button class="scorebtn-sm ${n===val?'selected':''}" ${editable?`data-action="set-score" data-player="${esc(name)}" data-val="${n}"`:'disabled'}>${n}</button>`).join('')}
              </div>
              <div class="tagdot" style="background:${dotColor};"></div>
              <div class="beaverslot" data-action="toggle-beaver-panel">${isHolder?`<img src="/beaver.png"/>`:''}</div>
            </div>`;
          }).join('')}
        </div>

        <div class="bottomtoolbar">
          <button class="toolbarbtn" data-action="toggle-mulligan-panel">🍺 Mullies${totalMulligans>0?`<span class="badge-count">${totalMulligans}</span>`:''}</button>
          <button class="toolbarbtn" data-action="open-scorecard-modal">Scorecard</button>
          <button class="toolbarbtn primary" data-action="submit-hole" ${editable?'':'disabled'}>Submit</button>
        </div>
      </div>
      ${state.beaverPanelOpen ? renderBeaverModal(round, group, hole, editable) : ''}
      ${state.mulliganPanelOpen ? renderMulliganModal(round, group, editable) : ''}
      ${state.scorecardModalOpen ? renderScorecardModal(round, group) : ''}
      ${state.pickerModalOpen ? renderPickerModal(round, group) : ''}
    `;
  }

  function renderBeaverModal(round:any, group: RoundGroup, hole:any, editable:boolean){
    const beaverRec = getBeaver(round.id, group.id, hole.n);
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">🦫 Beaver ball — hole ${hole.n}</h3>
          <button class="link-btn" data-action="toggle-beaver-panel">Close</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;">
          ${group.players.map((name:string)=>`<span class="chip ${beaverRec && beaverRec.holder===name ? '' : 'off'}" ${editable?`data-action="set-beaver-holder" data-player="${esc(name)}"`:''}>${esc(name)}</span>`).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;">
          <input type="checkbox" ${beaverRec && beaverRec.lost ? 'checked':''} ${editable?`data-action="toggle-beaver-lost"`:'disabled'}/>
          Ball was lost this hole (shotgun a beer) 🍺
        </label>
      </div>
    </div>`;
  }
  function renderMulliganModal(round:any, group: RoundGroup, editable:boolean){
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">🍺 Shotgun Mullies</h3>
          <button class="link-btn" data-action="toggle-mulligan-panel">Close</button>
        </div>
        ${group.players.map((name:string)=>`
          <div class="row" style="margin:8px 0;">
            <span style="font-size:13px;">${esc(name)}</span>
            <span style="display:flex;align-items:center;gap:10px;">
              <button class="btn small" ${editable?`data-action="mulligan" data-player="${esc(name)}" data-delta="-1"`:'disabled'}>−</button>
              <span style="min-width:16px;text-align:center;font-weight:600;">${getMulligans(round.id,name)}</span>
              <button class="btn small" ${editable?`data-action="mulligan" data-player="${esc(name)}" data-delta="1"`:'disabled'}>+</button>
            </span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }
  function renderScorecardModal(round:any, group: RoundGroup){
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
  function renderPickerModal(round:any, group: RoundGroup){
    const groups = groupsForRound(round.id);
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
          ${groups.map(g=>`<option value="${g.id}" ${g.id===group.id?'selected':''}>${g.teeTime} — ${g.players.join(', ')}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }

  function renderFullScorecard(round:any, group: RoundGroup){
    const holesOut = round.holes.filter((h:any)=>h.n<=9);
    const holesIn = round.holes.filter((h:any)=>h.n>9);
    function rowFor(name:string){
      let out=0,inn=0;
      const outCells = holesOut.map((h:any)=>{ const s=getHoleScores(round.id,h.n)[name]; if(s!=null) out+=s; return `<td>${s??''}</td>`; }).join('');
      const inCells = holesIn.map((h:any)=>{ const s=getHoleScores(round.id,h.n)[name]; if(s!=null) inn+=s; return `<td>${s??''}</td>`; }).join('');
      const tot = out+inn;
      return `<tr><td class="name">${esc(name)}</td>${outCells}<td><b>${out||''}</b></td>${inCells}<td><b>${inn||''}</b></td><td><b>${tot||''}</b></td></tr>`;
    }
    return `
      <div style="overflow-x:auto;">
      <div class="row"><h3 style="margin:0;">${esc(round.course)} — ${esc(group.teeTime)}</h3></div>
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

    let grossList = allPlayerNames().map(p=>{
      const {diff,played} = toParFor(round.id,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let netList = allPlayerNames().map(p=>{
      const {diff,played} = netToParFor(round.id,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let mulliganList = allPlayerNames().map(p=>({p, n:getMulligans(round.id,p)}))
      .filter(x=>x.n>0).sort((a,b)=>b.n-a.n);

    const bePlayers = allPlayerNames().map(p=>{
      const be = birdieEagleCount(p);
      return {p, ...be, score: be.eagles*2+be.birdies};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

    const teamGames = groupsForRound(round.id).map((g)=>({g, result: twoVTwoResults(round.id, g)})).filter((x:any)=>x.result);

    function nameCell(name:string){
      const p = findPlayerObj(name);
      return `${avatarHtml(p,22)}<span>${esc(name)}</span>`;
    }

    function miniList(key:string, title:string, items:any[], renderRow:any, emptyMsg:string){
      const expanded = !!state.boardExpanded[key];
      const shown = expanded ? items : items.slice(0,4);
      return `
      <div class="card" style="padding:12px 14px;">
        <h3 style="font-size:13px;margin:0 0 8px;">${title}</h3>
        ${items.length===0? `<div class="empty" style="padding:10px 4px;font-size:12px;">${emptyMsg}</div>` :
          shown.map(renderRow).join('')}
        ${key==='net' ? renderNetScorecardToggle(round) : ''}
        ${items.length>4 ? `<button class="link-btn" data-action="toggle-board-expand" data-key="${key}" style="margin-top:6px;font-size:11px;">${expanded?'Show less':'Show all '+items.length}</button>` : ''}
      </div>`;
    }

    return `
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        ${ROUNDS.map(r=>`<span class="chip ${r.id===round.id?'':'off'}" data-action="pick-board-round" data-round="${r.id}">${r.label}${r.id===current?' · now':''}</span>`).join('')}
      </div>

      ${round.id==='fri' ? renderFridayBestBallCard() : (teamGames.length>0 ? `
      <div class="card">
        <h3>🏆 2v2 game — net (best ball + low total)</h3>
        ${teamGames.map(({g,result}:any)=>{
          const aLeads = result.ptsA>result.ptsB, bLeads = result.ptsB>result.ptsA;
          return `
          <div style="margin-bottom:4px;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${esc(g.teeTime)} · thru ${result.holesPlayed} holes</div>
            <div class="matchup">
              <div class="teamcol ${aLeads?'leading':''}">
                <div class="teamnames">${result.a.map((n:string)=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">${avatarHtml(findPlayerObj(n),20)}${esc(n)}</span>`).join('')}</div>
                <div class="teampts">${result.ptsA}</div>
              </div>
              <div class="vs">VS</div>
              <div class="teamcol ${bLeads?'leading':''}">
                <div class="teamnames">${result.b.map((n:string)=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">${avatarHtml(findPlayerObj(n),20)}${esc(n)}</span>`).join('')}</div>
                <div class="teampts">${result.ptsB}</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>` : `<div class="card"><div class="empty">The 2v2 game runs Saturday AM &amp; PM — set up teams in Admin &gt; Roster &amp; groups.</div></div>`)}

      <div class="grid2">
        ${miniList('gross','⛳ Best to par — gross', grossList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:12.5px;">${x.diff>0?'+':''}${x.diff}</span>
          </div>`, 'No scores yet.')}

        ${miniList('net','🎯 Best to par — net', netList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:12.5px;">${x.diff>0?'+':''}${x.diff}</span>
          </div>`, 'No scores yet.')}

        ${miniList('mullies','🍺 Most Shotgun Mullies', mulliganList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:12.5px;">${x.n}</span>
          </div>`, 'None logged.')}

        ${miniList('birdies','🐦 Birdies &amp; 🦅 eagles', bePlayers, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:11.5px;">${x.birdies}b · ${x.eagles}e</span>
          </div>`, 'None yet.')}
      </div>
    `;
  }

  function renderFridayBestBallCard(){
    const result = fridayBestBallResult();
    if(!result){
      return `<div class="card"><div class="empty">Friday's best-ball match needs a 4-player team and a 3-player team — set up in Admin &gt; Roster &amp; groups.</div></div>`;
    }
    const bigLeads = result.ptsBig>result.ptsSmall, smallLeads = result.ptsSmall>result.ptsBig;
    function names(list:string[]){
      return list.map((n:string)=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">${avatarHtml(findPlayerObj(n),20)}${esc(n)}</span>`).join('');
    }
    return `
      <div class="card">
        <h3>🏌️ Friday best-ball — net (best 2 balls per team)</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">4-some vs 3-some · thru ${result.holesPlayed} holes</div>
        <div class="matchup">
          <div class="teamcol ${bigLeads?'leading':''}">
            <div class="teamnames">${names(result.teamBig)}</div>
            <div class="teampts">${result.ptsBig}</div>
          </div>
          <div class="vs">VS</div>
          <div class="teamcol ${smallLeads?'leading':''}">
            <div class="teamnames">${names(result.teamSmall)}</div>
            <div class="teampts">${result.ptsSmall}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderNetScorecardToggle(round:any){
    const open = state.boardNetScorecardOpen;
    return `
      <button class="link-btn" data-action="toggle-net-scorecard" style="margin-top:6px;font-size:11px;">${open?'Hide net scorecard':'View net scorecard ▾'}</button>
      ${open? renderNetScorecardTable(round): ''}
    `;
  }
  function renderNetScorecardTable(round:any){
    const holesOut = round.holes.filter((h:any)=>h.n<=9);
    const holesIn = round.holes.filter((h:any)=>h.n>9);
    const low = fieldLowHandicap();
    const players: Player[] = state.config.roster.filter((p:Player)=>toParFor(round.id,p.name).played>0);
    function cellsFor(p:Player, holes:any[]){
      return holes.map((h:any)=>{
        const idx = round.holes.findIndex((hh:any)=>hh.n===h.n);
        const s = getHoleScores(round.id,h.n)[p.name];
        if(s==null) return {net:'' as any};
        const strokes = strokesForHole((p.handicap||0)-low, round.si[idx]);
        return {net:s-strokes};
      });
    }
    function row(p:Player){
      const outCells = cellsFor(p,holesOut), inCells = cellsFor(p,holesIn);
      let outN=0, inN=0, anyOut=false, anyIn=false;
      outCells.forEach((c:any)=>{ if(c.net!=='') { outN+=c.net; anyOut=true; } });
      inCells.forEach((c:any)=>{ if(c.net!=='') { inN+=c.net; anyIn=true; } });
      const tot = (anyOut||anyIn) ? outN+inN : '';
      return `<tr><td class="name">${esc(p.name)}</td>${outCells.map((c:any)=>`<td>${c.net}</td>`).join('')}<td><b>${anyOut?outN:''}</b></td>${inCells.map((c:any)=>`<td>${c.net}</td>`).join('')}<td><b>${anyIn?inN:''}</b></td><td><b>${tot}</b></td></tr>`;
    }
    return `<div style="overflow-x:auto;margin-top:8px;">
      <table class="sc">
        <tr><th class="name">Hole</th>${holesOut.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>OUT</th>${holesIn.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>IN</th><th>TOT</th></tr>
        <tr><td class="name">Par</td>${holesOut.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesOut.reduce((a:number,h:any)=>a+h.par,0)}</td>${holesIn.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesIn.reduce((a:number,h:any)=>a+h.par,0)}</td><td>${round.par}</td></tr>
        ${players.map(row).join('')}
      </table>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Net = gross score minus tournament net strokes (handicap − field-low handicap ${esc(String(low))}, allocated by stroke index).</div>
    </div>`;
  }

  function renderCost(){
    const players = allPlayerNames();
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
          const authorP = m.author ? findPlayerObj(m.author) : null;
          return `
        <div class="msg">
          <div style="display:flex;align-items:center;gap:8px;">
            ${avatarHtml(authorP, 26)}
            <span class="author">${esc(m.author||'Someone')}</span><span class="time">${esc(m.time||'')}</span>
          </div>
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
    const p = state.session ? findPlayerObj(state.session.name) : null;
    return `
      <div class="card">
        <h3>Your account</h3>
        ${state.authUser? `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            ${avatarHtml(p, 48)}
            <div>
              <div style="font-size:14px;font-weight:600;">${p? esc(p.name) : esc(state.authUser.email)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(state.authUser.email)}</div>
            </div>
          </div>
          ${p ? `
          <label class="btn small" style="cursor:pointer;display:inline-block;margin-bottom:10px;">
            ${p.avatarUrl? 'Update photo' : 'Add photo'}
            <input type="file" accept="image/*" data-action="profile-photo-file" style="display:none;"/>
          </label>
          ${state.profileUploadBusy? '<div style="font-size:12px;color:var(--text-secondary);">Uploading…</div>' : ''}
          ${state.profileUploadError? `<div style="font-size:12px;color:var(--danger-text);">${esc(state.profileUploadError)}</div>` : ''}
          ` : ''}
          <button class="btn block" data-action="sign-out">Sign out</button>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">You're not signed in — you can view everything, but you'll need to sign in to enter scores for your group.</div>
          <button class="btn primary block" data-action="go-auth">Sign in / sign up</button>
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

  // ---- Admin ----
  function renderAdmin(){
    const view = state.adminView==='scoring-full' ? 'scoring' : (state.adminView||'scoring');
    return `
      <div class="no-print" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <span class="chip ${view==='scoring'?'':'off'}" data-action="admin-nav" data-view="scoring">Scores</span>
        <span class="chip ${view==='expenses'?'':'off'}" data-action="admin-nav" data-view="expenses">Expenses</span>
        <span class="chip ${view==='print'?'':'off'}" data-action="admin-nav" data-view="print">Print scorecards</span>
        <span class="chip ${view==='roster'?'':'off'}" data-action="admin-nav" data-view="roster">Roster &amp; groups</span>
        <span class="chip ${view==='danger'?'':'off'}" data-action="admin-nav" data-view="danger">Danger zone</span>
      </div>
      ${view==='scoring'?renderAdminScoring()
        : view==='expenses'?renderAdminExpenses()
        : view==='print'?renderAdminPrint()
        : view==='roster'?renderRosterEditor()
        : renderAdminDanger()}
    `;
  }

  function renderAdminScoring(){
    const roundId = state.adminRoundId || autoRoundId();
    const round = roundOf(roundId);
    const groups = groupsForRound(roundId);
    const groupId = (state.adminGroupId && groups.find(g=>g.id===state.adminGroupId)) ? state.adminGroupId : (groups[0]?groups[0].id:null);
    const group = groupId ? groupInRound(roundId, groupId) : null;
    const hole = round.holes.find(h=>h.n===state.adminHole) || round.holes[0];
    const scores = group ? getHoleScores(roundId, hole.n) : {};
    return `
      <div class="card">
        <h3>Edit any group's scores</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">This bypasses the "only your own group" rule — for fixing mistakes.</div>
        <label class="field">Round</label>
        <select data-action="admin-pick-round">${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===roundId?'selected':''}>${r.label}</option>`).join('')}</select>
        <label class="field">Group</label>
        <select data-action="admin-pick-group">${groups.map(g=>`<option value="${g.id}" ${g.id===groupId?'selected':''}>${g.teeTime} — ${g.players.join(', ')}</option>`).join('')}</select>
        ${!group ? '<div class="empty">No groups configured for this round.</div>' : `
        <label class="field">Hole</label>
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px;margin-bottom:12px;">
          <button class="btn small" data-action="admin-hole-prev" ${hole.n<=1?'disabled':''}>‹</button>
          <span style="font-weight:600;font-size:13px;">Hole ${hole.n} · Par ${hole.par}</span>
          <button class="btn small" data-action="admin-hole-next" ${hole.n>=18?'disabled':''}>›</button>
        </div>
        ${group.players.map((name:string)=>{
          const p = findPlayerObj(name);
          const val = scores[name];
          const low = Math.max(1, hole.par-3), high = Math.min(10,hole.par+4);
          let optsN:number[]=[]; for(let i=low;i<=high;i++) optsN.push(i); if(!optsN.includes(1)) optsN.unshift(1);
          return `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            ${avatarHtml(p,30)}
            <span style="width:56px;font-size:13px;font-weight:600;flex:0 0 auto;">${esc(name)}</span>
            <div class="scorestrip" style="flex:1;">
              ${optsN.map(n=>`<button class="scorebtn-sm ${n===val?'selected':''}" data-action="admin-set-score" data-player="${esc(name)}" data-val="${n}">${n}</button>`).join('')}
            </div>
          </div>`;
        }).join('')}
        `}
      </div>
    `;
  }

  function renderAdminExpenses(){
    return `<div class="card">
      <h3>Edit or delete expenses</h3>
      ${state.expenses.length===0? '<div class="empty">No expenses yet.</div>' :
        state.expenses.map((e:any,idx:number)=>{
          if(state.adminExpenseEditingId===idx){
            return `<div id="admin-exp-edit-${idx}" style="padding:10px 0;border-bottom:1px solid var(--border);">
              <label class="field">Description</label><input type="text" id="admin-exp-desc-${idx}" value="${esc(e.desc)}"/>
              <label class="field">Amount</label><input type="number" step="0.01" id="admin-exp-amount-${idx}" value="${e.amount}"/>
              <label class="field">Paid by</label>
              <select id="admin-exp-paidby-${idx}">${allPlayerNames().map(n=>`<option value="${esc(n)}" ${n===e.paidBy?'selected':''}>${esc(n)}</option>`).join('')}</select>
              <label class="field">Split among</label>
              <div style="display:flex;flex-wrap:wrap;">
                ${allPlayerNames().map(n=>`<span class="chip ${e.splitAmong.includes(n)?'':'off'}" data-toggle-split data-player="${esc(n)}">${esc(n)}</span>`).join('')}
              </div>
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn primary" data-action="admin-save-expense" data-idx="${idx}">Save</button>
                <button class="btn ghost" data-action="admin-cancel-edit-expense">Cancel</button>
              </div>
            </div>`;
          }
          return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${esc(e.desc)} <span style="color:var(--text-muted);">— ${fmtMoney(e.amount)}, paid by ${esc(e.paidBy)}</span></span>
            <span style="display:flex;gap:6px;">
              <button class="btn small" data-action="admin-edit-expense" data-idx="${idx}">Edit</button>
              <button class="btn small" data-action="admin-delete-expense" data-idx="${idx}">Delete</button>
            </span>
          </div>`;
        }).join('')}
    </div>`;
  }

  function renderAdminPrint(){
    const roundId = state.printRoundId || 'satpm';
    const round = roundOf(roundId);
    const groups = groupsForRound(roundId);
    const groupId = (state.printGroupId && groups.find(g=>g.id===state.printGroupId)) ? state.printGroupId : (groups[0]?groups[0].id:null);
    const toPrint = state.printMode==='all' ? groups : groups.filter(g=>g.id===groupId);
    return `
      <div class="card no-print">
        <h3>Print blank scorecards</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Every hole's par and yardage, plus (Saturday PM only) each player's 2v2-match stroke dots.</div>
        <label class="field">Round</label>
        <select data-action="print-pick-round">${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===roundId?'selected':''}>${r.label} — ${r.course}</option>`).join('')}</select>
        <label class="field">Foursome</label>
        <select data-action="print-pick-group">${groups.map(g=>`<option value="${g.id}" ${g.id===groupId?'selected':''}>${g.teeTime} — ${g.players.join(', ')}</option>`).join('')}</select>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn primary" data-action="print-one">Print this foursome</button>
          <button class="btn" data-action="print-all">Print all ${groups.length} foursomes</button>
        </div>
      </div>
      <div id="print-area">
        ${toPrint.map(g=>renderPrintableCard(round,g)).join('')}
      </div>
    `;
  }

  function renderPrintableCard(round:any, group: RoundGroup){
    const is2v2 = !!group.teams;
    const low = is2v2 ? groupLowHandicap(group) : 0;
    function holeBlock(holes:any[]){
      return `
        <tr><th class="name">Hole</th>${holes.map((h:any)=>`<th>${h.n}</th>`).join('')}</tr>
        <tr><td class="name">Par</td>${holes.map((h:any)=>`<td>${h.par}</td>`).join('')}</tr>
        <tr><td class="name">Yds</td>${holes.map((h:any)=>`<td>${h.yds}</td>`).join('')}</tr>
        ${group.players.map((name:string)=>{
          const p = findPlayerObj(name);
          const cells = holes.map((h:any)=>{
            if(!is2v2) return `<td style="height:22px;"></td>`;
            const idx = round.holes.findIndex((hh:any)=>hh.n===h.n);
            const strokes = strokesForHole((p?p.handicap||0:0)-low, round.si[idx]);
            const dots = strokes>0 ? '&bull;'.repeat(strokes) : '';
            return `<td style="font-size:11px;color:var(--navy);height:22px;letter-spacing:1px;">${dots}</td>`;
          }).join('');
          return `<tr><td class="name">${esc(name)}${is2v2?` (${p?p.handicap||0:0})`:''}</td>${cells}</tr>`;
        }).join('')}
      `;
    }
    const holesOut = round.holes.filter((h:any)=>h.n<=9);
    const holesIn = round.holes.filter((h:any)=>h.n>9);
    return `
      <div class="card print-page">
        <h3 style="margin-bottom:2px;">${is2v2? '2v2 Scorecard' : 'Blank Scorecard'}</h3>
        ${is2v2? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Dots show strokes given for the 2v2 match, based on the lowest handicap in this foursome — not the tournament net leaderboard.</div>` : ''}
        <div style="font-size:12px;margin-bottom:8px;">${esc(round.course)} · ${esc(group.teeTime)} · ${group.players.join(', ')}</div>
        <table class="sc" style="margin-bottom:10px;">${holeBlock(holesOut)}</table>
        <table class="sc">${holeBlock(holesIn)}</table>
      </div>
    `;
  }

  // Deletes scores, mulligans, and beaver-ball state for one round. Match/
  // leaderboard results (Friday best-ball, Saturday 2v2) aren't stored
  // anywhere separately — they're always recomputed live from scores, so
  // clearing scores here is sufficient to reset them too.
  function clearRoundData(roundId:string){
    const round = roundOf(roundId);
    round.holes.forEach(h=>{ delete state.scores[scoreKey(roundId,h.n)]; });
    delete state.mulligans[roundId];
    groupsForRound(roundId).forEach(g=>{
      round.holes.forEach(h=>{ delete state.beaver[beaverKey(roundId,g.id,h.n)]; });
    });
  }

  function renderAdminDanger(){
    const roundId = state.dangerRoundId || 'all';
    const label = roundId==='all' ? 'all rounds' : roundOf(roundId).label;
    return `
      <div class="card" style="border-color:var(--danger-text);">
        <h3>⚠️ Danger zone</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
          For testing/practice runs before the real trip. This permanently deletes
          <b>everyone's</b> entered scores, mulligans, and beaver-ball history for the
          round you pick — it does <b>not</b> touch expenses, payments, chat/photos, or the roster.
          This cannot be undone.
        </div>
        <label class="field">Round to clear</label>
        <select data-action="danger-pick-round">
          ${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===roundId?'selected':''}>${r.label}</option>`).join('')}
          <option value="all" ${roundId==='all'?'selected':''}>All rounds</option>
        </select>
        <label class="field">Type CLEAR to confirm</label>
        <input type="text" id="danger-confirm-input" placeholder="CLEAR"/>
        <button class="btn block" style="margin-top:12px;background:var(--danger-bg);color:var(--danger-text);border-color:var(--danger-text);font-weight:600;" data-action="danger-clear-scores">
          Clear scores for ${esc(label)}
        </button>
      </div>
    `;
  }

  function bindEvents(){
    document.querySelectorAll('[data-tab]').forEach((el:any)=>{
      el.onclick = ()=>{
        state.tab = el.dataset.tab;
        if(state.tab==='score' && !groupInRound(state.activeRoundId, state.activeGroupId)){
          state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
        }
        render();
      };
    });
    document.querySelectorAll('[data-action]').forEach((el:any)=>{
      const action = el.dataset.action;
      if(action==='go-auth'){ el.onclick=()=>{ state.tab='auth'; render(); }; }
      if(action==='toggle-auth-view'){ el.onclick=()=>{ state.authView = state.authView==='signup'?'signin':'signup'; state.authError=''; state.authInfo=''; render(); }; }
      if(action==='submit-signin'){ el.onclick=()=>{
        state.authEmail = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
        state.authPassword = (document.getElementById('auth-password') as HTMLInputElement).value;
        doSignIn();
      }; }
      if(action==='submit-signup'){ el.onclick=()=>{
        state.authEmail = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
        state.authPassword = (document.getElementById('auth-password') as HTMLInputElement).value;
        doSignUp();
      }; }
      if(action==='sign-out'){ el.onclick=()=>{ doSignOut(); }; }
      if(action==='onboarding-file'){ el.onchange=()=>{
        if(el.files && el.files[0]) handleAvatarFile(el.files[0]);
      }; }
      if(action==='profile-photo-file'){ el.onchange=()=>{
        if(el.files && el.files[0]) handleAvatarFile(el.files[0]);
      }; }
      if(action==='rename-player'){ el.onchange=()=>{
        const pi=el.dataset.pi;
        const oldName = state.config.roster[pi].name;
        const newName = el.value.trim() || oldName;
        state.config.roster[pi].name = newName;
        if(oldName!==newName){
          Object.values(state.config.rounds).forEach((gs:any)=>gs.forEach((g:any)=>{
            g.players = g.players.map((n:string)=>n===oldName?newName:n);
            if(g.teams && g.teams[oldName]!=null){ g.teams[newName]=g.teams[oldName]; delete g.teams[oldName]; }
          }));
        }
        saveConfig(); render();
      }; }
      if(action==='set-fullname'){ el.onchange=()=>{ state.config.roster[el.dataset.pi].fullName = el.value; saveConfig(); }; }
      if(action==='set-email'){ el.onchange=()=>{ state.config.roster[el.dataset.pi].email = el.value; saveConfig(); }; }
      if(action==='set-handicap'){ el.onchange=()=>{ state.config.roster[el.dataset.pi].handicap = parseInt(el.value,10)||0; saveConfig(); }; }
      if(action==='remove-player'){ el.onclick=()=>{
        const name = state.config.roster[el.dataset.pi].name;
        state.config.roster.splice(el.dataset.pi,1);
        Object.values(state.config.rounds).forEach((gs:any)=>gs.forEach((g:any)=>{
          g.players = g.players.filter((n:string)=>n!==name);
          if(g.teams) delete g.teams[name];
        }));
        saveConfig(); render();
      }; }
      if(action==='add-player'){ el.onclick=()=>{
        state.config.roster.push({name:'New player', fullName:'New player', email:'', handicap:0, avatarUrl:null});
        saveConfig(); render();
      }; }
      if(action==='rename-teetime'){ el.onchange=()=>{
        state.config.rounds[el.dataset.round][el.dataset.gi].teeTime = el.value; saveConfig();
      }; }
      if(action==='remove-group'){ el.onclick=()=>{
        state.config.rounds[el.dataset.round].splice(el.dataset.gi,1); saveConfig(); render();
      }; }
      if(action==='add-group'){ el.onclick=()=>{
        const roundId = el.dataset.round;
        const n = state.config.rounds[roundId].length+1;
        state.config.rounds[roundId].push({id:roundId+'-g'+n+'-'+Date.now(), teeTime:'TBD', players:[], teams: (roundId==='satam'||roundId==='satpm')?{}:undefined});
        saveConfig(); render();
      }; }
      if(action==='toggle-group-player'){ el.onclick=()=>{
        const g = state.config.rounds[el.dataset.round][el.dataset.gi];
        const name = el.dataset.player;
        if(g.players.includes(name)){
          g.players = g.players.filter((n:string)=>n!==name);
          if(g.teams) delete g.teams[name];
        } else {
          g.players.push(name);
          if(g.teams) g.teams[name] = 'A';
        }
        saveConfig(); render();
      }; }
      if(action==='set-round-team'){ el.onchange=()=>{
        const g = state.config.rounds[el.dataset.round][el.dataset.gi];
        if(!g.teams) g.teams={};
        g.teams[el.dataset.player] = el.value;
        saveConfig();
      }; }
      if(action==='pick-round'){ el.onchange=()=>{
        state.activeRoundId=el.value; state.activeHole=1;
        state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
        state.pickerModalOpen=false; render();
      }; }
      if(action==='pick-group'){ el.onchange=()=>{ state.activeGroupId=el.value; state.pickerModalOpen=false; render(); }; }
      if(action==='open-picker-modal'){ el.onclick=()=>{ state.pickerModalOpen=true; render(); }; }
      if(action==='open-scorecard-modal'){ el.onclick=()=>{ state.scorecardModalOpen=!state.scorecardModalOpen; render(); }; }
      if(action==='close-modals'){ el.onclick=()=>{ state.pickerModalOpen=false; state.scorecardModalOpen=false; state.beaverPanelOpen=false; state.mulliganPanelOpen=false; render(); }; }
      if(action==='set-score'){ el.onclick=()=>{
        setScore(state.activeRoundId, state.activeHole, el.dataset.player, parseInt(el.dataset.val,10));
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
      if(action==='toggle-net-scorecard'){ el.onclick=()=>{ state.boardNetScorecardOpen=!state.boardNetScorecardOpen; render(); }; }
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
      // ---- Admin ----
      if(action==='admin-nav'){ el.onclick=()=>{ state.adminView=el.dataset.view; render(); }; }
      if(action==='admin-pick-round'){ el.onchange=()=>{
        state.adminRoundId=el.value; state.adminHole=1;
        const gs = groupsForRound(state.adminRoundId);
        state.adminGroupId = gs.length? gs[0].id : null;
        render();
      }; }
      if(action==='admin-pick-group'){ el.onchange=()=>{ state.adminGroupId=el.value; render(); }; }
      if(action==='admin-hole-prev'){ el.onclick=()=>{ if(state.adminHole>1) state.adminHole--; render(); }; }
      if(action==='admin-hole-next'){ el.onclick=()=>{ if(state.adminHole<18) state.adminHole++; render(); }; }
      if(action==='admin-set-score'){ el.onclick=()=>{
        const roundId = state.adminRoundId || autoRoundId();
        setScore(roundId, state.adminHole, el.dataset.player, parseInt(el.dataset.val,10));
        render();
      }; }
      if(action==='admin-edit-expense'){ el.onclick=()=>{ state.adminExpenseEditingId=parseInt(el.dataset.idx,10); render(); }; }
      if(action==='admin-cancel-edit-expense'){ el.onclick=()=>{ state.adminExpenseEditingId=null; render(); }; }
      if(action==='admin-delete-expense'){ el.onclick=()=>{
        if(!confirm('Delete this expense?')) return;
        state.expenses.splice(parseInt(el.dataset.idx,10),1);
        state.adminExpenseEditingId=null;
        saveExpenses(); render();
      }; }
      if(action==='admin-save-expense'){ el.onclick=()=>{
        const idx = parseInt(el.dataset.idx,10);
        const desc = (document.getElementById(`admin-exp-desc-${idx}`) as HTMLInputElement).value.trim();
        const amount = parseFloat((document.getElementById(`admin-exp-amount-${idx}`) as HTMLInputElement).value);
        const paidBy = (document.getElementById(`admin-exp-paidby-${idx}`) as HTMLSelectElement).value;
        const container = document.getElementById(`admin-exp-edit-${idx}`);
        const splitChips = container ? container.querySelectorAll('.chip:not(.off)') : [];
        const splitAmong = Array.from(splitChips).map((c:any)=>c.dataset.player);
        if(!desc || !amount || splitAmong.length===0){ alert('Add a description, amount, and at least one person to split with.'); return; }
        state.expenses[idx] = {...state.expenses[idx], desc, amount, paidBy, splitAmong};
        state.adminExpenseEditingId=null;
        saveExpenses(); render();
      }; }
      if(action==='print-pick-round'){ el.onchange=()=>{
        state.printRoundId=el.value;
        const gs = groupsForRound(state.printRoundId);
        state.printGroupId = gs.length? gs[0].id : null;
        render();
      }; }
      if(action==='print-pick-group'){ el.onchange=()=>{ state.printGroupId=el.value; render(); }; }
      if(action==='print-one'){ el.onclick=()=>{ state.printMode='one'; render(); setTimeout(()=>window.print(),50); }; }
      if(action==='print-all'){ el.onclick=()=>{ state.printMode='all'; render(); setTimeout(()=>window.print(),50); }; }
      if(action==='danger-pick-round'){ el.onchange=()=>{ state.dangerRoundId=el.value; render(); }; }
      if(action==='danger-clear-scores'){ el.onclick=()=>{
        const input = document.getElementById('danger-confirm-input') as HTMLInputElement | null;
        if(!input || input.value.trim()!=='CLEAR'){ alert('Type CLEAR (all caps) in the box to confirm.'); return; }
        const target = state.dangerRoundId || 'all';
        const roundIds = target==='all' ? ROUNDS.map(r=>r.id) : [target];
        const label = target==='all' ? 'ALL rounds' : roundOf(target).label;
        if(!confirm(`This will permanently delete all scores, mulligans, and beaver-ball data for ${label}. This cannot be undone. Continue?`)) return;
        roundIds.forEach(clearRoundData);
        saveScores(); saveMulligans(); saveBeaver();
        input.value='';
        render();
      }; }
    });
    document.querySelectorAll('[data-toggle-split]').forEach((el:any)=>{
      el.onclick = ()=>{ el.classList.toggle('off'); };
    });
  }

  load();
}

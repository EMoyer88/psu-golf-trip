'use client';

import { useEffect, useRef } from 'react';
import { kvGet, kvSet, kvSubscribe, uploadPhoto, compressImage } from '@/lib/store';
import {
  ROUNDS_META, DEFAULT_CONFIG, ADMIN_EMAILS,
  strokesForHole, lowHandicapAmong, initialsFor,
  Player, RoundGroup,
} from '@/lib/tripData';
import {
  LEADERBOARD_FLAVOR, EMPTY_STATES, LAST_PLACE_LABEL, MATCH_COMMENTARY, AUTO_POST_CONFIG,
  pickMatchCommentary, pickPlayerLine,
} from '@/lib/trashTalk';
import { LUNCH_MENU, LUNCH_MODIFIERS, LUNCH_ORDER_DEADLINE, LUNCH_READY_TIME_LABEL } from '@/lib/lunchMenu';

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
    myEmail: null, // roster email the person identified as, persisted in localStorage — no Supabase Auth involved
    session: null,
    authEmail:'',
    authError:'',
    onboardingBusy:false, onboardingError:'',
    profileUploadOpen:false, profileUploadBusy:false, profileUploadError:'',
    rosterPhotoUploadingFor: null, rosterPhotoError:'', rosterPhotoErrorFor: null,
    config: DEFAULT_CONFIG,
    configDraft: null, // unsaved working copy of config while adminView==='roster' — see saveConfig()/isRosterDraftDirty()
    rosterSavedMsg: '',
    scores: {},
    mulligans: {},
    beaver: {},
    expenses: [],
    payments: [],
    chat: [],
    autoPostFlags: {},
    scoreAuditLog: [],
    auditFilterRound: 'all',
    auditFilterPlayer: 'all',
    lunchOrders: {},
    lunchOrderDraft: null,
    lunchOrderSavedMsg: '',
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
    matchScorecardRoundId: null,
    matchScorecardGroupId: null,
    adminView:'scoring',
    adminRoundId: null,
    adminGroupId: null,
    adminHole: 1,
    adminExpenseEditingId: null,
    adminMulliganRoundId: null,
    printRoundId: null,
    printGroupId: null,
    printMode: 'one',
    dangerRoundId: null,
    reactorsModal: null,
    replyingToId: null,
  };

  async function load(){
    const cfg = await kvGet('trip-config'); if(cfg) state.config = cfg;
    const sc = await kvGet('scores'); if(sc) state.scores = sc;
    const mu = await kvGet('mulligans'); if(mu) state.mulligans = mu;
    const bv = await kvGet('beaver'); if(bv) state.beaver = bv;
    const ex = await kvGet('expenses'); if(ex) state.expenses = ex;
    const pay = await kvGet('payments'); if(pay) state.payments = pay;
    const ch = await kvGet('chat'); if(ch) state.chat = ch;
    const apf = await kvGet('auto-post-flags'); if(apf) state.autoPostFlags = apf;
    const sal = await kvGet('score-audit-log'); if(sal) state.scoreAuditLog = sal;
    const lo = await kvGet('lunch-orders'); if(lo) state.lunchOrders = lo;

    try{ state.myEmail = localStorage.getItem('golf-my-email') || null; }catch(e){ state.myEmail = null; }
    recomputeSession();

    state.loaded = true;
    state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
    render();
    subscribeAll();
    checkLunchCalloutAutoPost();
  }

  function subscribeAll(){
    kvSubscribe('scores', (v)=>{ state.scores = v; render(); });
    kvSubscribe('mulligans', (v)=>{ state.mulligans = v; render(); });
    kvSubscribe('beaver', (v)=>{ state.beaver = v; render(); });
    kvSubscribe('expenses', (v)=>{ state.expenses = v; render(); });
    kvSubscribe('payments', (v)=>{ state.payments = v; render(); });
    kvSubscribe('chat', (v)=>{ state.chat = v; render(); });
    kvSubscribe('auto-post-flags', (v)=>{ state.autoPostFlags = v; });
    kvSubscribe('score-audit-log', (v)=>{ state.scoreAuditLog = v; render(); });
    kvSubscribe('lunch-orders', (v)=>{ state.lunchOrders = v; render(); });
    kvSubscribe('trip-config', (v)=>{ state.config = v; recomputeSession(); render(); });
  }

  function saveConfig(){ kvSet('trip-config', state.config); }
  // ---- roster/tee-time admin draft (explicit Save, not live-on-every-change) ----
  function isRosterDraftDirty(){
    return !!state.configDraft && JSON.stringify(state.configDraft) !== JSON.stringify(state.config);
  }
  function confirmLeaveRoster(){
    if(state.adminView==='roster' && isRosterDraftDirty()){
      if(!confirm('You have unsaved roster/tee-time changes. Leave without saving?')) return false;
      state.configDraft = null;
    }
    return true;
  }
  function saveScores(){ kvSet('scores', state.scores); }
  function saveMulligans(){ kvSet('mulligans', state.mulligans); }
  function saveBeaver(){ kvSet('beaver', state.beaver); }
  function saveExpenses(){ kvSet('expenses', state.expenses); }
  function savePayments(){ kvSet('payments', state.payments); }
  function saveChat(){ kvSet('chat', state.chat); }
  function saveAutoPostFlags(){ kvSet('auto-post-flags', state.autoPostFlags); }
  function saveScoreAuditLog(){ kvSet('score-audit-log', state.scoreAuditLog); }
  function saveLunchOrders(){ kvSet('lunch-orders', state.lunchOrders); }

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
    return !!state.myEmail && ADMIN_EMAILS.includes(String(state.myEmail||'').trim().toLowerCase());
  }

  // ---- identification (email-only, no Supabase Auth — matched against the roster's email field) ----
  function recomputeSession(){
    if(!state.myEmail){ state.session = null; return; }
    const email = String(state.myEmail||'').trim().toLowerCase();
    const p = state.config.roster.find((r:Player)=>r.email.trim().toLowerCase()===email);
    state.session = p ? { name: p.name } : null;
  }
  function doIdentify(){
    const email = state.authEmail.trim();
    if(!email){ state.authError='Enter your email.'; render(); return; }
    const norm = email.toLowerCase();
    const match = state.config.roster.find((r:Player)=>r.email.trim().toLowerCase()===norm);
    if(!match){
      state.authError = "That email isn't on the roster — check with Erik or Greg to get it added.";
      render();
      return;
    }
    state.authError='';
    state.myEmail = email;
    try{ localStorage.setItem('golf-my-email', email); }catch(e){}
    recomputeSession();
    state.tab='home';
    render();
  }
  function doSignOut(){
    state.myEmail=null; state.session=null; state.tab='home';
    try{ localStorage.removeItem('golf-my-email'); }catch(e){}
    render();
  }

  // ---- avatar upload ----
  // Shared core: compress, upload to the avatars/ folder, and stamp the
  // resulting URL onto a specific roster player. Used both by a player
  // uploading their own selfie and by an admin replacing someone else's
  // photo from the roster editor.
  async function uploadAvatarForPlayer(file: File, targetName:string): Promise<{ok:boolean, error?:string}>{
    try{
      const compressed = await compressImage(file);
      const url = await uploadPhoto(compressed, 'avatars');
      if(!url) return {ok:false, error:'Upload failed — check your connection and try again.'};
      const p = findPlayerObj(targetName);
      if(p){
        p.avatarUrl = url;
        saveConfig();
        // Keep an in-progress roster-editor draft in sync so it doesn't
        // overwrite this photo with a stale copy when later saved.
        if(state.configDraft){
          const dp = state.configDraft.roster.find((r:Player)=>r.name===targetName);
          if(dp) dp.avatarUrl = url;
        }
      }
      return {ok:true};
    } catch(e){
      return {ok:false, error:'Something went wrong — try again.'};
    }
  }
  async function handleAvatarFile(file: File, onDone?: ()=>void){
    if(!state.session) return;
    state.onboardingBusy = true; state.onboardingError=''; state.profileUploadError=''; state.profileUploadBusy=true; render();
    const result = await uploadAvatarForPlayer(file, state.session.name);
    if(!result.ok){
      state.onboardingError = result.error!;
      state.profileUploadError = result.error!;
    } else {
      state.profileUploadOpen = false;
      if(onDone) onDone();
    }
    state.onboardingBusy = false; state.profileUploadBusy = false;
    render();
  }
  // Admin-only: replace ANY roster player's photo from the roster editor —
  // for anyone who skipped the forced selfie step, or wants a new photo.
  async function handleRosterAvatarFile(file: File, targetName:string){
    state.rosterPhotoUploadingFor = targetName;
    state.rosterPhotoError = ''; state.rosterPhotoErrorFor = null;
    render();
    const result = await uploadAvatarForPlayer(file, targetName);
    state.rosterPhotoUploadingFor = null;
    if(!result.ok){
      state.rosterPhotoError = result.error!;
      state.rosterPhotoErrorFor = targetName;
    }
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
  // Friday's 4-player vs 3-player best-ball match: TWO independent points
  // are available per hole (regardless of team size — the 3-player team
  // still only counts its best 2 balls for the Low Total point):
  //   1. Low Ball — each team's single lowest net score head-to-head.
  //   2. Low Total — each team's best-2-net-scores sum head-to-head.
  // Each point is decided separately; an exact tie on that point is a PUSH
  // (no point to either team — NOT a 0.5/0.5 halve). So a hole can produce
  // 2-0, 1-1, 1-0-with-a-push, or 0-0. Tracked as a running cumulative
  // point total per team, independent of Saturday's Ryder-Cup-style match
  // play and the tournament net leaderboard.
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
      const netBig = teamBig.players.map((p:string)=>sc[p]-fridayBestBallStrokesForHole(p, round.si[idx])).sort((a,b)=>a-b);
      const netSmall = teamSmall.players.map((p:string)=>sc[p]-fridayBestBallStrokesForHole(p, round.si[idx])).sort((a,b)=>a-b);
      // Point 1: Low Ball — single lowest net score per team.
      if(netBig[0]<netSmall[0]) ptsBig+=1; else if(netSmall[0]<netBig[0]) ptsSmall+=1; // equal = push
      // Point 2: Low Total — best 2 net scores summed per team.
      const totalBig = netBig[0]+netBig[1], totalSmall = netSmall[0]+netSmall[1];
      if(totalBig<totalSmall) ptsBig+=1; else if(totalSmall<totalBig) ptsSmall+=1; // equal = push
    });
    return {teamBig: teamBig.players, teamSmall: teamSmall.players, ptsBig, ptsSmall, holesPlayed};
  }

  function scoreKey(roundId:string, hole:number){ return roundId+'-h'+hole; }
  function getHoleScores(roundId:string, hole:number){
    return state.scores[scoreKey(roundId,hole)] || {};
  }
  function setScore(roundId:string, hole:number, player:string, val:number, isAdminOverride?:boolean){
    const k = scoreKey(roundId,hole);
    if(!state.scores[k]) state.scores[k] = {};
    const prevVal = state.scores[k][player]!=null ? state.scores[k][player] : null;
    state.scores[k][player] = val;
    saveScores();
    logScoreChange(roundId, hole, player, prevVal, val, !!isAdminOverride);
    // Tied directly to this one score-entry action (covers both the normal
    // and admin scoring paths, since both call setScore) — never on
    // render, so editing/correcting a score can't spam the feed by itself.
    checkBirdieEagleAutoPost(roundId, hole, player, val);
    checkMatchMilestoneAutoPosts(roundId);
  }
  // Admin-only: fully clear a hole's score back to its normal unentered
  // state (not a placeholder "0") — for correcting a bad entry, not just
  // overwriting it with another number.
  function eraseScore(roundId:string, hole:number, player:string){
    const k = scoreKey(roundId,hole);
    const prevVal = (state.scores[k] && state.scores[k][player]!=null) ? state.scores[k][player] : null;
    if(state.scores[k]) delete state.scores[k][player];
    saveScores();
    logScoreChange(roundId, hole, player, prevVal, null, true);
    // Same flag reset an edit-away-from-a-birdie already does, so a future
    // genuinely-new qualifying score can still post.
    const flagKey = `${roundId}-h${hole}-${player}`;
    if(state.autoPostFlags[flagKey]){
      state.autoPostFlags[flagKey] = null;
      saveAutoPostFlags();
    }
    checkMatchMilestoneAutoPosts(roundId);
  }

  // ---- score-entry audit log (append-only; troubleshooting tool, admin-only view) ----
  function logScoreChange(roundId:string, hole:number, player:string, prevVal:number|null, newVal:number|null, isAdminOverride:boolean){
    const actor = state.session ? state.session.name : (state.myEmail || 'Unknown');
    state.scoreAuditLog.push({
      id: Date.now()+'-'+Math.random().toString(36).slice(2,7),
      time: new Date().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}),
      actor,
      roundId,
      hole,
      player,
      prevValue: prevVal==null ? 'blank' : prevVal,
      newValue: newVal==null ? 'erased' : newVal,
      isAdminOverride,
    });
    saveScoreAuditLog();
  }

  // ---- automatic "⛳ Live Update" feed posts for live scoring events ----
  // Saturday (AM + PM) only, per lib/trashTalk.ts's AUTO_POST_CONFIG.
  function pushAutoPost(text:string){
    const id = Date.now()+'-'+Math.random().toString(36).slice(2,7);
    const time = new Date().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
    state.chat.push({ id, author: AUTO_POST_CONFIG.authorName, isAuto:true, text, time, reactions:{}, replies:[] });
    saveChat();
  }
  // Birdie/eagle: tracks the CURRENT event type per (round, hole, player)
  // key. Re-saving the same value is a no-op (type unchanged). Editing away
  // from a birdie/eagle clears the flag without posting. Editing INTO one —
  // whether fresh or a correction — posts, since the stored type changed.
  function checkBirdieEagleAutoPost(roundId:string, hole:number, player:string, val:number){
    if(roundId==='fri') return; // Saturday only in this batch
    const round = roundOf(roundId);
    const h = round.holes.find(hh=>hh.n===hole);
    if(!h) return;
    const diff = val - h.par;
    const newType: 'eagle'|'birdie'|null = diff<=-2 ? 'eagle' : diff===-1 ? 'birdie' : null;
    const key = `${roundId}-h${hole}-${player}`;
    const prevType = state.autoPostFlags[key] || null;
    if(newType===prevType) return;
    state.autoPostFlags[key] = newType;
    saveAutoPostFlags();
    if(newType && (AUTO_POST_CONFIG.enabled as any)[newType]){
      const line = pickPlayerLine(player);
      const base = newType==='eagle'
        ? AUTO_POST_CONFIG.templates.eagle(player, hole)
        : AUTO_POST_CONFIG.templates.birdie(player, hole);
      pushAutoPost(line ? `${base} ${line}` : base);
    }
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
  // Friday is a standalone exhibition round and never feeds the cumulative
  // tournament leaderboard — Saturday AM + PM combine into one 36-hole total
  // instead. Used for gross/net/mullies; birdieEagleCount below already only
  // looks at trackBirdies rounds (satam+satpm), so it needs no change.
  const SAT_ROUND_IDS = ['satam', 'satpm'];
  function toParForRounds(roundIds:string[], player:string){
    let diff=0, played=0;
    roundIds.forEach(rid=>{
      const r = toParFor(rid, player);
      diff += r.diff; played += r.played;
    });
    return {diff, played};
  }
  function netToParForRounds(roundIds:string[], player:string){
    let diff=0, played=0;
    roundIds.forEach(rid=>{
      const r = netToParFor(rid, player);
      diff += r.diff; played += r.played;
    });
    return {diff, played};
  }
  function mulligansForRounds(roundIds:string[], player:string){
    return roundIds.reduce((sum,rid)=>sum+getMulligans(rid,player),0);
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
  // Next player in the group's order after `holder`, wrapping around.
  function nextBeaverHolder(players:string[], holder:string){
    const idx = players.indexOf(holder);
    if(idx===-1) return players[0];
    return players[(idx+1) % players.length];
  }
  // The single source of truth for who holds the beaver ball at `uptoHole`.
  // Walks hole by hole from 1: a manual tap on a hole becomes that hole's
  // starting holder; otherwise the ball auto-advances to the next player
  // after whoever held it, UNLESS that hole was marked "lost", in which case
  // it stays put. The advance only applies going INTO the next hole, so the
  // holder returned for `uptoHole` itself reflects any manual override on
  // that hole without yet applying its own lost/advance outcome.
  function currentBeaverHolder(roundId:string, groupId:string, uptoHole:number){
    const g = groupInRound(roundId, groupId);
    if(!g || !g.players.length) return null;
    let holder = g.players[0];
    for(let h=1; h<=uptoHole; h++){
      const rec = getBeaver(roundId, groupId, h);
      if(rec && rec.holder) holder = rec.holder;
      if(h<uptoHole){
        const lost = !!(rec && rec.lost);
        if(!lost) holder = nextBeaverHolder(g.players, holder);
      }
    }
    return holder;
  }
  function teamsForGroup(group: RoundGroup){
    if(!group.teams) return null;
    const a = group.players.filter(n=>group.teams![n]==='A');
    const b = group.players.filter(n=>group.teams![n]==='B');
    return {a,b};
  }
  // Real match play, best ball only (no "low total" point). diff is a
  // running differential: positive = Team A up, negative = Team B up, 0 =
  // all square. Equal best-ball scores on a hole push — no point, no change
  // to diff. Once abs(diff) exceeds the holes remaining after a hole, the
  // match is mathematically clinched and we stop counting further holes,
  // exactly like real match play (a clinch on the 18th hole itself reports
  // as "N UP" rather than "N and 0", since there are 0 holes left to spare).
  function twoVTwoResults(roundId:string, group: RoundGroup){
    const teams = teamsForGroup(group);
    if(!teams || teams.a.length!==2 || teams.b.length!==2) return null;
    const {a,b} = teams;
    const round = roundOf(roundId);
    let diff = 0, holesPlayed = 0;
    let clinchedAtHole: number|null = null;
    let clinchedTeam: 'A'|'B'|null = null;
    let leadChangedThisHole = false;
    for(const h of round.holes){
      if(clinchedAtHole!=null) break;
      const idx = h.n-1;
      const sc = getHoleScores(roundId,h.n);
      const players=[...a,...b];
      if(players.some((p:string)=>sc[p]==null)) break;
      holesPlayed++;
      const net: any = {};
      players.forEach((p:string)=>{
        const strokes = matchStrokesForHole(group, p, round.si[idx]);
        net[p] = sc[p]-strokes;
      });
      const aBest = Math.min(net[a[0]], net[a[1]]);
      const bBest = Math.min(net[b[0]], net[b[1]]);
      const beforeLeader: 'A'|'B'|null = diff>0?'A':diff<0?'B':null;
      if(aBest<bBest) diff+=1; else if(bBest<aBest) diff-=1; // equal = push, diff unchanged
      const afterLeader: 'A'|'B'|null = diff>0?'A':diff<0?'B':null;
      leadChangedThisHole = !!(beforeLeader && afterLeader && beforeLeader!==afterLeader);
      const holesRemaining = 18 - h.n;
      if(Math.abs(diff) > holesRemaining){
        clinchedAtHole = h.n;
        clinchedTeam = diff>0 ? 'A' : 'B';
      }
    }
    return {a, b, diff, holesPlayed, clinchedAtHole, clinchedTeam, leadChangedThisHole};
  }
  // Human-readable Ryder-Cup-style status for a twoVTwoResults() result.
  function matchStatusText(result:any){
    if(result.holesPlayed===0) return { text:'Not started', leader:null as 'A'|'B'|null, clinched:false };
    if(result.clinchedAtHole!=null){
      const holesRemaining = 18 - result.clinchedAtHole;
      const teamLabel = result.clinchedTeam==='A' ? result.a.join(' & ') : result.b.join(' & ');
      const margin = Math.abs(result.diff);
      const text = holesRemaining===0
        ? `${teamLabel} win ${margin} UP`
        : `${teamLabel} win ${margin} and ${holesRemaining}`;
      return { text, leader: result.clinchedTeam, clinched:true };
    }
    if(result.holesPlayed>=18){
      if(result.diff===0) return { text:'Match halved', leader:null, clinched:false };
      const teamLabel = result.diff>0 ? result.a.join(' & ') : result.b.join(' & ');
      return { text:`${teamLabel} win ${Math.abs(result.diff)} UP`, leader: result.diff>0?'A':'B', clinched:true };
    }
    if(result.diff===0) return { text:'ALL SQUARE', leader:null, clinched:false };
    const teamLabel = result.diff>0 ? result.a.join(' & ') : result.b.join(' & ');
    return { text:`${teamLabel} ${Math.abs(result.diff)} UP`, leader: result.diff>0?'A':'B', clinched:false };
  }
  // Saturday 2v2 "⛳ Live Update" posts: match clinched, and the first time
  // a lead reaches AUTO_POST_CONFIG.bigLeadThreshold holes. Runs for every
  // foursome in the round after any score change in that round (cheap —
  // at most 3 foursomes). Match-clinched can re-fire if a later correction
  // un-clinches and then re-clinches the match (a genuinely new result);
  // the big-lead milestone is a true one-shot per match, per the spec, and
  // is never re-armed even if the lead dips back down.
  function checkMatchMilestoneAutoPosts(roundId:string){
    if(roundId!=='satam' && roundId!=='satpm') return; // Saturday only
    groupsForRound(roundId).forEach(g=>{
      const result = twoVTwoResults(roundId, g);
      if(!result) return;
      const status = matchStatusText(result);
      const baseKey = `${roundId}-${g.id}`;

      if(AUTO_POST_CONFIG.enabled.matchClinched){
        const clinchKey = `${baseKey}-clinched`;
        const wasClinched = !!state.autoPostFlags[clinchKey];
        if(status.clinched && !wasClinched){
          state.autoPostFlags[clinchKey] = true;
          saveAutoPostFlags();
          const winningTeam = status.leader==='A' ? result.a.join(' & ') : result.b.join(' & ');
          const losingTeam = status.leader==='A' ? result.b.join(' & ') : result.a.join(' & ');
          const losingPlayers = status.leader==='A' ? result.b : result.a;
          const holesRemaining = result.clinchedAtHole!=null ? 18-result.clinchedAtHole : 0;
          const margin = Math.abs(result.diff);
          const base = AUTO_POST_CONFIG.templates.matchClinched(winningTeam, losingTeam, margin, holesRemaining);
          const line = pickMatchCommentary('clinched', losingPlayers);
          pushAutoPost(line ? `${base} ${line}` : base);
        } else if(!status.clinched && wasClinched){
          state.autoPostFlags[clinchKey] = false; // allow a genuine later re-clinch to post again
          saveAutoPostFlags();
        }
      }

      // Once the match is decided, "pulling away" no longer makes sense —
      // and this also avoids double-posting a milestone and a clinch
      // announcement for the same hole in a late, fast-closing match.
      if(AUTO_POST_CONFIG.enabled.bigLeadMilestone && !status.clinched){
        const leadKey = `${baseKey}-bigLead`;
        const alreadyFired = !!state.autoPostFlags[leadKey];
        if(!alreadyFired && Math.abs(result.diff) >= AUTO_POST_CONFIG.bigLeadThreshold){
          state.autoPostFlags[leadKey] = true;
          saveAutoPostFlags();
          const leaderIsA = result.diff>0;
          const leadingTeam = leaderIsA ? result.a.join(' & ') : result.b.join(' & ');
          const trailingTeam = leaderIsA ? result.b.join(' & ') : result.a.join(' & ');
          const trailingPlayers = leaderIsA ? result.b : result.a;
          const base = AUTO_POST_CONFIG.templates.bigLeadMilestone(leadingTeam, trailingTeam, Math.abs(result.diff));
          const line = pickMatchCommentary('trailingBig', trailingPlayers);
          pushAutoPost(line ? `${base} ${line}` : base);
        }
      }
    });
  }
  // Friday 5pm lunch-order cutoff callout. No backend cron exists, so this
  // is checked client-side — once after load() and on a periodic timer (see
  // initApp) — whenever anyone has the app open at/after the deadline. A
  // persisted flag (reused from autoPostFlags, synced like every other
  // auto-post flag) makes sure only the first client to notice posts.
  function checkLunchCalloutAutoPost(){
    if(!AUTO_POST_CONFIG.enabled.lunchCallout) return;
    if(state.autoPostFlags['lunch-callout']) return;
    if(Date.now() < LUNCH_ORDER_DEADLINE.getTime()) return;
    state.autoPostFlags['lunch-callout'] = true;
    saveAutoPostFlags();
    const missing = allPlayerNames().filter((n:string)=>!state.lunchOrders[n]);
    const text = missing.length===0
      ? AUTO_POST_CONFIG.templates.lunchCalloutAllIn()
      : AUTO_POST_CONFIG.templates.lunchCalloutMissing(missing);
    pushAutoPost(text);
    render();
  }
  // Hole-by-hole replay of a 2v2 match — same rules/clinch logic as
  // twoVTwoResults, but returns a per-hole record (gross scores, per-hole
  // match strokes, hole winner, running status) for the match scorecard
  // view instead of just the final summary. Holes past a clinch still show
  // gross scores/strokes if entered, but no winner/status (match is over).
  function twoVTwoHoleRows(roundId:string, group: RoundGroup){
    const teams = teamsForGroup(group);
    if(!teams || teams.a.length!==2 || teams.b.length!==2) return null;
    const {a,b} = teams;
    const round = roundOf(roundId);
    let diff = 0;
    let clinchedAtHole: number|null = null;
    const players = [...a,...b];
    const rows = round.holes.map((h:any)=>{
      const idx = h.n-1;
      const sc = getHoleScores(roundId,h.n);
      const gross: any = {};
      const strokes: any = {};
      players.forEach((p:string)=>{
        gross[p] = sc[p]!=null ? sc[p] : null;
        strokes[p] = matchStrokesForHole(group, p, round.si[idx]);
      });
      const allScored = players.every((p:string)=>sc[p]!=null);
      let winner: 'A'|'B'|'push'|null = null;
      let statusAfter: string|null = null;
      if(allScored && clinchedAtHole==null){
        const aBest = Math.min(gross[a[0]]-strokes[a[0]], gross[a[1]]-strokes[a[1]]);
        const bBest = Math.min(gross[b[0]]-strokes[b[0]], gross[b[1]]-strokes[b[1]]);
        if(aBest<bBest){ diff+=1; winner='A'; } else if(bBest<aBest){ diff-=1; winner='B'; } else winner='push';
        statusAfter = diff===0 ? 'AS' : (diff>0 ? `A +${diff}` : `B +${-diff}`);
        const holesRemaining = 18 - h.n;
        if(Math.abs(diff) > holesRemaining) clinchedAtHole = h.n;
      }
      const counted = (allScored && clinchedAtHole==null) || h.n===clinchedAtHole;
      return { n:h.n, par:h.par, gross, strokes, winner, statusAfter, counted };
    });
    return { a, b, rows, finalDiff:diff, clinchedAtHole };
  }
  function esc(s:any){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]); }
  // Standard competition ranking ("1224") for an already-sorted list: tied
  // items (per isTied) share the same rank number, and the next distinct
  // rank skips ahead by however many were tied (e.g. 1,1,1,4 not 1,1,1,2).
  function computeSharedRanks(items:any[], isTied:(a:any,b:any)=>boolean): number[] {
    const ranks: number[] = [];
    items.forEach((item,i)=>{
      if(i>0 && isTied(items[i-1], item)) ranks.push(ranks[i-1]);
      else ranks.push(i+1);
    });
    return ranks;
  }
  function fmtMoney(n:number){ return '$' + (Math.round(n*100)/100).toFixed(2); }

  function computeBalances(){
    const players = allPlayerNames();
    const balances: any = {};
    players.forEach(p=>balances[p]=0);
    state.expenses.forEach((e:any)=>{
      if(e.shares){
        // Custom split — use each person's actual stored dollar share
        // instead of assuming an even split.
        Object.entries(e.shares).forEach(([p,amt]:any)=>{ balances[p] = (balances[p]||0) - amt; });
      } else {
        const share = e.amount / e.splitAmong.length;
        e.splitAmong.forEach((p:string)=> balances[p] = (balances[p]||0) - share);
      }
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

  // ---- custom (uneven) expense split UI ----
  // Rebuilds and refreshes via direct DOM manipulation rather than a full
  // render() cycle, so toggling split mode or a participant mid-form-fill
  // never resets whatever else the user has already typed into this form.
  function rebuildExpenseCustomAmounts(){
    const container = document.getElementById('exp-custom-amounts');
    if(!container) return;
    const customChip = document.getElementById('exp-split-mode-custom');
    const isCustom = !!(customChip && !customChip.classList.contains('off'));
    if(!isCustom){ container.style.display='none'; container.innerHTML=''; return; }
    container.style.display='block';
    const selectedChips = Array.from(document.querySelectorAll('#exp-split .chip:not(.off)'));
    const selected = selectedChips.map((c:any)=>c.dataset.player);
    // Preserve anything already typed for players still selected.
    const existing: any = {};
    container.querySelectorAll('input[data-player]').forEach((inp:any)=>{ existing[inp.dataset.player] = inp.value; });
    const totalAmount = parseFloat((document.getElementById('exp-amount') as HTMLInputElement).value) || 0;
    const evenShare = selected.length>0 ? totalAmount/selected.length : 0;
    container.innerHTML = selected.map((p:string)=>{
      const val = (existing[p]!=null && existing[p]!=='') ? existing[p] : (evenShare>0 ? evenShare.toFixed(2) : '');
      return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="flex:1;font-size:13px;">${esc(p)}</span>
        <input type="number" step="0.01" class="exp-share-input" data-player="${esc(p)}" value="${esc(val)}" style="width:90px;"/>
      </div>`;
    }).join('') + `<div id="exp-remaining" style="font-size:12px;font-weight:700;margin-top:4px;"></div>`;
    container.querySelectorAll('.exp-share-input').forEach((inp:any)=>{ inp.oninput = updateExpenseRemaining; });
    updateExpenseRemaining();
  }
  function updateExpenseRemaining(){
    const remainingEl = document.getElementById('exp-remaining');
    if(!remainingEl) return;
    const totalAmount = parseFloat((document.getElementById('exp-amount') as HTMLInputElement).value) || 0;
    const inputs = Array.from(document.querySelectorAll('#exp-custom-amounts .exp-share-input')) as HTMLInputElement[];
    const sum = inputs.reduce((s,inp)=> s + (parseFloat(inp.value)||0), 0);
    const remaining = Math.round((totalAmount - sum)*100)/100;
    const matches = Math.abs(remaining) < 0.005;
    remainingEl.textContent = matches ? 'Fully allocated ✓' : `Remaining to allocate: ${fmtMoney(remaining)}`;
    remainingEl.style.color = matches ? 'var(--success-text)' : 'var(--danger-text)';
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
    if(!state.loaded){ app.innerHTML = '<div class="wrap"><div class="empty" style="color:#fff;">Loading trip data…</div></div>'; return; }

    if(state.myEmail && !state.session){
      app.className='';
      app.innerHTML = renderNotOnRoster();
      bindEvents();
      return;
    }
    if(state.myEmail && state.session){
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
      centerScoreStrips();
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
          <div class="subtitle">${state.session ? esc(state.session.name)+(isAdmin()?' · Admin':'') : (state.myEmail ? 'Not on roster' : 'Not signed in')}</div>
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
    const showDot = id==='feed' && hasUnreadFeed();
    return `<button class="tabbtn ${state.tab===id?'active':''}" data-tab="${id}" style="position:relative;">${icon(id==='profile'?'user':id)}<span>${label}</span>${showDot?'<span class="tab-dot"></span>':''}</button>`;
  }

  function renderNotOnRoster(){
    return `
      <div class="wrap">
        <div class="header">
          <img src="/logo.png" alt="Trip logo"/>
          <div class="title">9th Annual PSU Golf Trip</div>
        </div>
        <div class="card" style="text-align:center;">
          <h3>That email isn't on the roster</h3>
          <div style="font-size:13px;color:var(--text-secondary);margin:8px 0 16px;">
            You identified as ${esc(state.myEmail)}. Ask the trip organizer to add your email to the roster, then try again.
          </div>
          <button class="btn block" data-action="sign-out">Try a different email</button>
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
    return `
      <div class="card">
        <h3>Sign in</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Enter the email on your roster row — no password needed — to unlock editing for your own group.</div>
        <label class="field">Email</label>
        <input type="email" id="auth-email" value="${esc(state.authEmail)}" placeholder="you@example.com"/>
        ${state.authError? `<div style="font-size:12px;color:var(--danger-text);margin-top:10px;">${esc(state.authError)}</div>` : ''}
        <button class="btn primary block" style="margin-top:14px;" data-action="submit-signin">Sign in</button>
      </div>
    `;
  }

  function renderPairingCard(labelLeft:string, playersLeft:string[], labelRight:string, playersRight:string[]){
    // Bigger vertical player cards (photo on top, name centered underneath)
    // arranged as a small wrapping grid per team — the photo is the
    // dominant element here, not a small icon beside the name.
    function playerCards(list:string[]){
      return list.map(n=>`
        <div class="player-card">
          ${avatarHtml(findPlayerObj(n), 54)}
          <span class="player-card-name">${esc(n)}</span>
        </div>
      `).join('');
    }
    return `
      <div class="matchup" style="margin-bottom:8px;">
        <div class="teamcol">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">${esc(labelLeft)}</div>
          <div class="player-grid">${playerCards(playersLeft)}</div>
        </div>
        <div class="vs">VS</div>
        <div class="teamcol">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">${esc(labelRight)}</div>
          <div class="player-grid">${playerCards(playersRight)}</div>
        </div>
      </div>
    `;
  }

  function renderHome(){
    let roundsHtml = ROUNDS.map(r=>{
      const groups = groupsForRound(r.id);
      let pairingsHtml = '';
      if(r.id==='fri'){
        const sorted = [...groups].sort((a,b)=>b.players.length-a.players.length);
        if(sorted.length===2 && sorted[0].players.length>=2 && sorted[1].players.length>=2){
          pairingsHtml = renderPairingCard(
            `${sorted[0].teeTime} · ${sorted[0].players.length}-some`, sorted[0].players,
            `${sorted[1].teeTime} · ${sorted[1].players.length}-some`, sorted[1].players
          );
        }
      } else {
        pairingsHtml = groups.map(g=>{
          const teams = teamsForGroup(g);
          if(!teams || teams.a.length!==2 || teams.b.length!==2) return '';
          return renderPairingCard(`${g.teeTime} · Team A`, teams.a, `${g.teeTime} · Team B`, teams.b);
        }).join('');
      }
      return `
      <div class="card">
        <div class="row"><h3 style="margin:0">${r.label} — ${esc(r.course)}</h3><span class="pill">Par ${r.par}</span></div>
        <div style="font-size:12px;color:var(--text-secondary);margin:4px 0 8px;">${r.yards.toLocaleString()} yds · ${esc(r.tee)} tee</div>
        <div class="divider"></div>
        ${pairingsHtml || groups.map(g=>`
          <div class="row" style="margin-bottom:4px;align-items:flex-start;">
            <span style="font-size:13px;white-space:nowrap;">${esc(g.teeTime)}</span>
            <span style="font-size:12px;color:var(--text-secondary);text-align:right;">${g.players.join(', ')}</span>
          </div>
        `).join('')}
      </div>`;
    }).join('');

    return `
      ${state.myEmail ? '' : `
      <div class="card" style="border-color:var(--navy);">
        <h3>Sign in</h3>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">Sign in with your email so you can enter scores for your own group.</div>
        <button class="btn primary block" data-action="go-auth">Sign in</button>
      </div>`}
      ${roundsHtml}
    `;
  }

  function renderRosterEditor(){
    if(!state.configDraft) state.configDraft = JSON.parse(JSON.stringify(state.config));
    const dirty = isRosterDraftDirty();
    const roster: Player[] = state.configDraft.roster;
    return `
      <div class="card" style="border-color:${dirty?'var(--gold)':'var(--border)'};">
        <div class="row" style="align-items:center;">
          <h3 style="margin:0;">${dirty? 'Unsaved roster/tee-time changes' : 'Roster & tee times'}</h3>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin:6px 0 10px;">
          ${dirty? 'Edits below are local only until you save.' : 'No unsaved changes.'}
          ${state.rosterSavedMsg? ` <span style="color:var(--success-text);font-weight:600;">${esc(state.rosterSavedMsg)}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn primary" data-action="admin-roster-save" ${dirty?'':'disabled'}>Save changes</button>
          <button class="btn" data-action="admin-roster-discard" ${dirty?'':'disabled'}>Discard changes</button>
        </div>
      </div>
      <div class="card">
        <h3>Roster</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Display name, real name, email, handicap, and photo.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 55px 30px;gap:6px;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
          <span>Display</span><span>Full name</span><span>Email</span><span>Hcp</span><span></span>
        </div>
        ${roster.map((p,pi)=>`
          <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
            <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 55px 30px;gap:6px;margin-bottom:8px;align-items:center;">
              <input type="text" data-action="rename-player" data-pi="${pi}" value="${esc(p.name)}"/>
              <input type="text" data-action="set-fullname" data-pi="${pi}" value="${esc(p.fullName)}"/>
              <input type="text" data-action="set-email" data-pi="${pi}" value="${esc(p.email)}"/>
              <input type="number" data-action="set-handicap" data-pi="${pi}" value="${p.handicap||0}"/>
              <button class="btn small" data-action="remove-player" data-pi="${pi}">✕</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${avatarHtml(p, 36)}
              <label class="btn small" style="cursor:pointer;">
                📷 Take photo
                <input type="file" accept="image/*" capture="user" data-action="roster-photo-file" data-player="${esc(p.name)}" style="display:none;"/>
              </label>
              <label class="btn small" style="cursor:pointer;">
                🖼️ Library
                <input type="file" accept="image/*" data-action="roster-photo-file" data-player="${esc(p.name)}" style="display:none;"/>
              </label>
              ${state.rosterPhotoUploadingFor===p.name? `<span style="font-size:11px;color:var(--text-secondary);">Uploading…</span>` : ''}
            </div>
            ${state.rosterPhotoErrorFor===p.name && state.rosterPhotoError? `<div style="font-size:11px;color:var(--danger-text);margin-top:4px;">${esc(state.rosterPhotoError)}</div>` : ''}
          </div>
        `).join('')}
        <button class="btn small" data-action="add-player">+ Add player</button>
      </div>
      ${ROUNDS.map(r=>renderRoundGroupsEditor(r.id, r.label)).join('')}
    `;
  }

  function renderRoundGroupsEditor(roundId:string, label:string){
    const groups: RoundGroup[] = state.configDraft.rounds[roundId] || [];
    const isTeamRound = roundId==='satam' || roundId==='satpm';
    const roster: Player[] = state.configDraft.roster;
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

    // Saturday 2v2 match status + rotating trash-talk commentary, shown
    // right on the scoring screen (not just the leaderboard).
    let matchBannerHtml = '';
    if(round.id==='satam' || round.id==='satpm'){
      const matchResult = twoVTwoResults(round.id, group);
      if(matchResult && matchResult.holesPlayed>0){
        const status = matchStatusText(matchResult);
        const commentary = commentaryFor(matchResult, status);
        const arrow = status.leader==='A' ? '◀ ' : status.leader==='B' ? '▶ ' : '';
        matchBannerHtml = `
          <div style="flex:0 0 auto;text-align:center;background:#fff;border:1px solid var(--border);border-radius:10px;padding:6px 10px;margin-bottom:8px;">
            <div style="font-weight:700;font-size:12.5px;color:${status.clinched?'var(--success-text)':'var(--navy)'};">${arrow}${esc(status.text)}</div>
            ${commentary? `<div style="font-size:10.5px;font-style:italic;color:var(--text-muted);margin-top:1px;">${esc(commentary)}</div>` : ''}
          </div>
        `;
      }
    }

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
        ${matchBannerHtml}
        <div class="playersarea">
          ${group.players.map((name:string)=>{
            const p = findPlayerObj(name);
            const val = scoresInit[name];
            const diff = val - hole.par;
            let teamLabel = '';
            let strokes = 0;
            if(isFri){
              strokes = fridayBestBallStrokesForHole(name, round.si[holeIdx]);
            } else if(group.teams && group.teams[name]){
              teamLabel = 'Tm '+group.teams[name];
              strokes = matchStrokesForHole(group, name, round.si[holeIdx]);
            }
            const isHolder = beaverHolder===name;
            const dotColor = diff<=-2? 'var(--success-text)' : diff===-1? '#2E9E5B' : 'transparent';
            // Strokes get their own fixed-height row (always rendered, dots
            // added only when strokes>0) so a player's name/avatar never
            // shift position between holes depending on whether they have
            // a stroke here — only the dot count inside changes.
            const strokeDots = '<span class="stroke-dot"></span>'.repeat(strokes);
            return `
            <div class="playerrow-compact">
              <div class="pcol">
                ${avatarHtml(p, 60)}
                <span class="nm">${esc(name)}</span>
                ${teamLabel ? `<span class="meta">${teamLabel}</span>` : ''}
                <div class="strokedots">${strokeDots}</div>
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
      ${state.beaverPanelOpen ? renderBeaverModal(round, group, hole, editable, beaverHolder) : ''}
      ${state.mulliganPanelOpen ? renderMulliganModal(round, group, editable) : ''}
      ${state.scorecardModalOpen ? renderScorecardModal(round, group) : ''}
      ${state.pickerModalOpen ? renderPickerModal(round, group) : ''}
    `;
  }

  function renderBeaverModal(round:any, group: RoundGroup, hole:any, editable:boolean, currentHolder:string|null){
    const beaverRec = getBeaver(round.id, group.id, hole.n);
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">🦫 Beaver ball — hole ${hole.n}</h3>
          <button class="link-btn" data-action="toggle-beaver-panel">Close</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;">
          ${group.players.map((name:string)=>`<span class="chip ${currentHolder===name ? '' : 'off'}" ${editable?`data-action="set-beaver-holder" data-player="${esc(name)}"`:''}>${esc(name)}</span>`).join('')}
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
        ${editable ? `
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Who's taking the mulligan? We'll record a quick 10-second video of it.</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${group.players.map((name:string)=>`<span class="chip" data-action="start-mulligan-capture" data-player="${esc(name)}" data-round="${esc(round.id)}">${esc(name)}</span>`).join('')}
        </div>` : ''}
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">This round's count</div>
        ${group.players.map((name:string)=>`
          <div class="row" style="margin:4px 0;">
            <span style="font-size:13px;">${esc(name)}</span>
            <span style="font-weight:600;font-size:13px;">${getMulligans(round.id,name)}</span>
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
    // The current group's own 2v2 match status, shown alongside the gross
    // scorecard so both can be checked in one place (Saturday only — no
    // 2v2 game on Friday). Tournament net stroke dots aren't shown here;
    // those live on the net leaderboard's own scorecard.
    let matchStatusHtml = '';
    if(round.id==='satam' || round.id==='satpm'){
      const result = twoVTwoResults(round.id, group);
      if(result && result.holesPlayed>0){
        const status = matchStatusText(result);
        const arrow = status.leader==='A' ? '◀ ' : status.leader==='B' ? '▶ ' : '';
        matchStatusHtml = `<div style="text-align:center;font-weight:700;font-size:13px;color:${status.clinched?'var(--success-text)':'var(--navy)'};margin:2px 0 10px;">${arrow}${esc(status.text)}</div>`;
      }
    }
    return `
      <div style="overflow-x:auto;">
      <div class="scorecard-header">
        <img src="/logo.png" alt="Trip logo"/>
        <h3 style="margin:0;">${esc(round.course)} — ${esc(group.teeTime)}</h3>
      </div>
      ${matchStatusHtml}
      <table class="sc">
        <tr><th class="name">Hole</th>${holesOut.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>OUT</th>${holesIn.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>IN</th><th>TOT</th></tr>
        <tr><td class="name">Par</td>${holesOut.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesOut.reduce((a:number,h:any)=>a+h.par,0)}</td>${holesIn.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesIn.reduce((a:number,h:any)=>a+h.par,0)}</td><td>${round.par}</td></tr>
        ${group.players.map(rowFor).join('')}
      </table>
      </div>
    `;
  }

  // Which players are most relevant to comment on for a given match state —
  // the trailing team when someone's behind, the new leader on a lead
  // change, the losing team once clinched, or everyone when all square.
  function relevantPlayersFor(result:any, status:any){
    if(status.clinched && result.clinchedTeam){
      return result.clinchedTeam==='A' ? result.b : result.a; // losing team
    }
    if(result.leadChangedThisHole && status.leader){
      return status.leader==='A' ? result.a : result.b; // team that just took the lead
    }
    if(status.leader===null) return [...result.a, ...result.b];
    return status.leader==='A' ? result.b : result.a; // trailing team
  }
  function commentaryFor(result:any, status:any){
    if(result.holesPlayed===0) return '';
    let category: keyof typeof MATCH_COMMENTARY;
    if(status.clinched) category = 'clinched';
    else if(result.leadChangedThisHole && status.leader) category = 'leadChanged';
    else if(status.leader===null) category = 'allSquare';
    else category = Math.abs(result.diff)>=4 ? 'trailingBig' : 'trailingSmall';
    return pickMatchCommentary(category, relevantPlayersFor(result, status));
  }

  function renderTeamGameCard(roundId:string, g: RoundGroup, result:any){
    const status = matchStatusText(result);
    const arrow = status.leader==='A' ? '◀ ' : status.leader==='B' ? '▶ ' : '';
    const commentary = commentaryFor(result, status);
    const aLeads = status.leader==='A', bLeads = status.leader==='B';
    function names(list:string[]){
      return list.map((n:string)=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">${avatarHtml(findPlayerObj(n),20)}${esc(n)}</span>`).join('');
    }
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${esc(g.teeTime)} · thru ${result.holesPlayed} holes</div>
        <div class="matchup">
          <div class="teamcol ${aLeads?'leading':''}"><div class="teamnames">${names(result.a)}</div></div>
          <div class="vs">VS</div>
          <div class="teamcol ${bLeads?'leading':''}"><div class="teamnames">${names(result.b)}</div></div>
        </div>
        <div style="text-align:center;font-weight:700;font-size:13px;color:${status.clinched?'var(--success-text)':'var(--navy)'};margin-top:4px;">${arrow}${esc(status.text)}</div>
        ${commentary? `<div style="text-align:center;font-size:11px;font-style:italic;color:var(--text-muted);margin-top:2px;">${esc(commentary)}</div>` : ''}
        <div style="text-align:center;">
          <button class="link-btn" data-action="open-match-scorecard-modal" data-round="${esc(roundId)}" data-group="${esc(g.id)}" style="margin-top:4px;font-size:11px;">View scorecard ▾</button>
        </div>
      </div>
    `;
  }

  function renderBoard(){
    const current = autoRoundId();
    const round = roundOf(state.boardRoundId || current);

    // Combined Saturday (AM+PM) tournament totals — Friday is a standalone
    // exhibition round and never contributes here.
    let grossList = allPlayerNames().map(p=>{
      const {diff,played} = toParForRounds(SAT_ROUND_IDS,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let netList = allPlayerNames().map(p=>{
      const {diff,played} = netToParForRounds(SAT_ROUND_IDS,p);
      return {p,diff,played};
    }).filter(x=>x.played>0).sort((a,b)=>a.diff-b.diff);

    let mulliganList = allPlayerNames().map(p=>({p, n:mulligansForRounds(SAT_ROUND_IDS,p)}))
      .filter(x=>x.n>0).sort((a,b)=>b.n-a.n);

    // Ranked by eagle count first, birdie count as the tiebreaker — NOT the
    // composite score, so e.g. 1 eagle/0 birdies always outranks 0
    // eagles/2 birdies even though eagles*2+birdies would tie them.
    const bePlayers = allPlayerNames().map(p=>{
      const be = birdieEagleCount(p);
      return {p, ...be, score: be.eagles*2+be.birdies};
    }).filter(x=>x.score>0).sort((a,b)=> b.eagles-a.eagles || b.birdies-a.birdies);
    const beRanks = computeSharedRanks(bePlayers, (a,b)=>a.eagles===b.eagles && a.birdies===b.birdies);

    // 2v2 match play stays per-round (three foursomes each for AM and PM).
    const teamGames = groupsForRound(round.id).map((g)=>({g, result: twoVTwoResults(round.id, g)})).filter((x:any)=>x.result);

    const lastGrossName = grossList.length>1 ? grossList[grossList.length-1].p : null;
    const lastNetName = netList.length>1 ? netList[netList.length-1].p : null;

    function nameCell(name:string){
      const p = findPlayerObj(name);
      return `${avatarHtml(p,22)}<span>${esc(name)}</span>`;
    }
    function lastPlaceBadge(name:string){
      const line = pickPlayerLine(name);
      return ` <span title="${esc(line || LAST_PLACE_LABEL)}">🐌</span>`;
    }
    function leaderRow(x:any, i:number, lastName:string|null){
      const isLast = lastName!=null && x.p===lastName;
      const line = isLast ? pickPlayerLine(x.p) : null;
      return `
        <div style="padding:4px 0;border-bottom:1px solid var(--border);">
          <div class="row">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}${isLast?lastPlaceBadge(x.p):''}</span>
            <span style="font-size:12.5px;">${x.diff>0?'+':''}${x.diff}</span>
          </div>
          ${isLast && line ? `<div style="font-size:10px;font-style:italic;color:var(--text-muted);margin-top:2px;">${esc(line)}</div>` : ''}
        </div>`;
    }

    function miniList(key:string, title:string, items:any[], renderRow:any, emptyMsg:string){
      const expanded = !!state.boardExpanded[key];
      const shown = expanded ? items : items.slice(0,4);
      const flavor = (LEADERBOARD_FLAVOR as any)[key];
      return `
      <div class="card" style="padding:12px 14px;">
        <h3 style="font-size:13px;margin:0 0 2px;">${title}</h3>
        ${flavor? `<div style="font-size:10.5px;font-style:italic;color:var(--text-muted);margin-bottom:8px;">${esc(flavor)}</div>` : ''}
        ${items.length===0? `<div class="empty" style="padding:10px 4px;font-size:12px;">${emptyMsg}</div>` :
          shown.map(renderRow).join('')}
        ${key==='net' ? `<button class="link-btn" data-action="open-net-scorecard-modal" style="margin-top:6px;font-size:11px;">View net scorecard ▾</button>` : ''}
        ${items.length>4 ? `<button class="link-btn" data-action="toggle-board-expand" data-key="${key}" style="margin-top:6px;font-size:11px;">${expanded?'Show less':'Show all '+items.length}</button>` : ''}
      </div>`;
    }

    return `
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        ${ROUNDS.map(r=>`<span class="chip ${r.id===round.id?'':'off'}" data-action="pick-board-round" data-round="${r.id}">${r.label}${r.id===current?' · now':''}</span>`).join('')}
      </div>

      ${round.id==='fri' ? renderFridayBestBallCard() : (teamGames.length>0 ? `
      <div class="card">
        <h3>🏆 2v2 match play</h3>
        ${teamGames.map(({g,result}:any)=>renderTeamGameCard(round.id,g,result)).join('')}
      </div>` : `<div class="card"><div class="empty">The 2v2 game runs Saturday AM &amp; PM — set up teams in Admin &gt; Roster &amp; groups.</div></div>`)}

      <div class="grid2">
        ${miniList('gross','⛳ Best to par — gross', grossList, (x:any,i:number)=>leaderRow(x,i,lastGrossName), EMPTY_STATES.leaderboard)}

        ${miniList('net','🎯 Best to par — net', netList, (x:any,i:number)=>leaderRow(x,i,lastNetName), EMPTY_STATES.leaderboard)}

        ${miniList('mullies','🍺 Most Shotgun Mullies', mulliganList, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${i+1}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:12.5px;">${x.n}</span>
          </div>`, EMPTY_STATES.mullies)}

        ${miniList('birdies','🐦 Birdies &amp; 🦅 eagles', bePlayers, (x:any,i:number)=>`
          <div class="row" style="padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12.5px;display:flex;align-items:center;gap:6px;"><b>${beRanks[i]}.</b> ${nameCell(x.p)}</span>
            <span style="font-size:11.5px;">${x.birdies}b · ${x.eagles}e</span>
          </div>`, EMPTY_STATES.leaderboard)}
      </div>

      ${state.boardNetScorecardOpen ? renderNetScorecardModal() : ''}
      ${state.matchScorecardGroupId ? renderMatchScorecardModal() : ''}
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
        <h3>🏌️ Friday best-ball — net (2 pts/hole: Low Ball + Low Total)</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">4-some vs 3-some · thru ${result.holesPlayed} holes</div>
        <div class="matchup">
          <div class="teamcol ${bigLeads?'leading':''}">
            <div class="teamnames">${names(result.teamBig)}</div>
            <div class="teampts">${result.ptsBig} <span style="font-size:11px;font-weight:600;">pts</span></div>
          </div>
          <div class="vs">VS</div>
          <div class="teamcol ${smallLeads?'leading':''}">
            <div class="teamnames">${names(result.teamSmall)}</div>
            <div class="teampts">${result.ptsSmall} <span style="font-size:11px;font-weight:600;">pts</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // Small dot row reusing the exact stroke-dot style from the live scoring
  // page, for showing per-hole handicap strokes inside a scorecard cell.
  function strokeDotsCell(value:number|'', strokes:number){
    if(value==='') return '<td></td>';
    const dots = strokes>0 ? `<div style="display:flex;justify-content:center;gap:1px;margin-top:2px;">${'<span class="stroke-dot"></span>'.repeat(strokes)}</div>` : '';
    return `<td><div>${value}</div>${dots}</td>`;
  }

  function renderNetScorecardModal(){
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <span></span>
          <button class="link-btn" data-action="close-modals">Close</button>
        </div>
        ${renderCombinedNetScorecard()}
      </div>
    </div>`;
  }

  function renderMatchScorecardModal(){
    const roundId = state.matchScorecardRoundId;
    const groupId = state.matchScorecardGroupId;
    const group = roundId && groupId ? groupInRound(roundId, groupId) : null;
    return `
    <div class="modal-overlay" data-action="close-modals">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <span></span>
          <button class="link-btn" data-action="close-modals">Close</button>
        </div>
        ${group ? renderMatchScorecard(roundOf(roundId), group) : '<div class="empty">This foursome could not be found.</div>'}
      </div>
    </div>`;
  }
  // Full 18-hole 2v2 match scorecard: gross scores, per-hole 2v2-match
  // stroke dots (per-foursome low, NOT the tournament net allocation), which
  // team won/pushed each hole, and the running Ryder-Cup-style status.
  function renderMatchScorecard(round:any, group: RoundGroup){
    const data = twoVTwoHoleRows(round.id, group);
    if(!data){
      return `<div class="empty">This foursome doesn't have 2v2 teams set up.</div>`;
    }
    const { a, b, rows } = data;
    const players = [...a, ...b];
    function cellHtml(r:any, p:string){
      const g = r.gross[p];
      if(g==null) return '<td></td>';
      const s = r.strokes[p]||0;
      const dots = s>0 ? `<div style="display:flex;justify-content:center;gap:1px;margin-top:2px;">${'<span class="stroke-dot"></span>'.repeat(s)}</div>` : '';
      return `<td><div>${g}</div>${dots}</td>`;
    }
    function playerRow(p:string){
      return `<tr><td class="name">${esc(p)}</td>${rows.map((r:any)=>cellHtml(r,p)).join('')}</tr>`;
    }
    function winnerCell(r:any){
      if(!r.counted || !r.winner) return '<td></td>';
      const label = r.winner==='push' ? '–' : r.winner;
      const color = r.winner==='A' ? 'var(--navy)' : r.winner==='B' ? 'var(--success-text)' : 'var(--text-muted)';
      return `<td style="font-weight:700;color:${color};">${label}</td>`;
    }
    function statusCell(r:any){
      return `<td style="font-size:9px;">${r.counted && r.statusAfter ? esc(r.statusAfter) : ''}</td>`;
    }
    const finalStatus = matchStatusText(twoVTwoResults(round.id, group));
    return `
      <div style="overflow-x:auto;">
        <div class="scorecard-header">
          <img src="/logo.png" alt="Trip logo"/>
          <h3 style="margin:0;">${esc(round.course)} — ${esc(group.teeTime)} · 2v2 match</h3>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">${esc(a.join(' & '))} <b>vs</b> ${esc(b.join(' & '))}</div>
        <table class="sc">
          <tr><th class="name">Hole</th>${rows.map((r:any)=>`<th>${r.n}</th>`).join('')}</tr>
          <tr><td class="name">Par</td>${rows.map((r:any)=>`<td>${r.par}</td>`).join('')}</tr>
          ${players.map(playerRow).join('')}
          <tr><td class="name">Won by</td>${rows.map(winnerCell).join('')}</tr>
          <tr><td class="name">Match</td>${rows.map(statusCell).join('')}</tr>
        </table>
        <div style="text-align:center;font-weight:700;font-size:13px;color:${finalStatus.clinched?'var(--success-text)':'var(--navy)'};margin-top:10px;">${esc(finalStatus.text)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Dots show 2v2-match strokes — lowest handicap in this foursome plays scratch, separate from the tournament net leaderboard. "Won by" and "Match" stop once the match is clinched.</div>
      </div>
    `;
  }
  // The net leaderboard is now a combined Saturday AM+PM 36-hole total, so
  // its detail view shows each round's 18-hole net table (with per-hole
  // stroke dots — tournament-wide field-low allocation) plus a combined
  // 36-hole total row underneath.
  function renderCombinedNetScorecard(){
    const low = fieldLowHandicap();
    const players: Player[] = state.config.roster.filter((p:Player)=>SAT_ROUND_IDS.some(rid=>toParFor(rid,p.name).played>0));

    function roundTable(round:any){
      const holesOut = round.holes.filter((h:any)=>h.n<=9);
      const holesIn = round.holes.filter((h:any)=>h.n>9);
      function cellsFor(p:Player, holes:any[]){
        return holes.map((h:any)=>{
          const idx = round.holes.findIndex((hh:any)=>hh.n===h.n);
          const s = getHoleScores(round.id,h.n)[p.name];
          if(s==null) return {net:'' as any, strokes:0};
          const strokes = strokesForHole((p.handicap||0)-low, round.si[idx]);
          return {net:s-strokes, strokes};
        });
      }
      function row(p:Player){
        const outCells = cellsFor(p,holesOut), inCells = cellsFor(p,holesIn);
        let outN=0, inN=0, anyOut=false, anyIn=false;
        outCells.forEach((c:any)=>{ if(c.net!=='') { outN+=c.net; anyOut=true; } });
        inCells.forEach((c:any)=>{ if(c.net!=='') { inN+=c.net; anyIn=true; } });
        const tot = (anyOut||anyIn) ? outN+inN : '';
        return `<tr><td class="name">${esc(p.name)}</td>${outCells.map((c:any)=>strokeDotsCell(c.net,c.strokes)).join('')}<td><b>${anyOut?outN:''}</b></td>${inCells.map((c:any)=>strokeDotsCell(c.net,c.strokes)).join('')}<td><b>${anyIn?inN:''}</b></td><td><b>${tot}</b></td></tr>`;
      }
      return `
        <div style="font-size:11px;font-weight:700;color:var(--navy);margin:8px 0 2px;">${esc(round.label)}</div>
        <table class="sc">
          <tr><th class="name">Hole</th>${holesOut.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>OUT</th>${holesIn.map((h:any)=>`<th>${h.n}</th>`).join('')}<th>IN</th><th>TOT</th></tr>
          <tr><td class="name">Par</td>${holesOut.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesOut.reduce((a:number,h:any)=>a+h.par,0)}</td>${holesIn.map((h:any)=>`<td>${h.par}</td>`).join('')}<td>${holesIn.reduce((a:number,h:any)=>a+h.par,0)}</td><td>${round.par}</td></tr>
          ${players.map(row).join('')}
        </table>
      `;
    }

    const totalsRows = players.map(p=>{
      const combined = netToParForRounds(SAT_ROUND_IDS, p.name);
      const label = combined.played>0 ? (combined.diff>0?'+':'')+combined.diff : '';
      return `<tr><td class="name">${esc(p.name)}</td><td><b>${label}</b></td></tr>`;
    }).join('');

    return `<div style="overflow-x:auto;">
      <div class="scorecard-header">
        <img src="/logo.png" alt="Trip logo"/>
        <h3 style="margin:0;">Tournament net scorecard</h3>
      </div>
      ${SAT_ROUND_IDS.map(rid=>roundTable(roundOf(rid))).join('')}
      <div style="font-size:11px;font-weight:700;color:var(--navy);margin:10px 0 2px;">36-hole net to par</div>
      <table class="sc"><tr><th class="name">Player</th><th>Net to par</th></tr>${totalsRows}</table>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Net = gross score minus tournament net strokes (handicap − field-low handicap ${esc(String(low))}, allocated by stroke index). Dots show strokes received on that hole.</div>
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
        <div style="display:flex;gap:6px;margin-top:8px;">
          <span class="chip" id="exp-split-mode-even" data-action="set-expense-split-mode" data-mode="even">Split evenly</span>
          <span class="chip off" id="exp-split-mode-custom" data-action="set-expense-split-mode" data-mode="custom">Custom split</span>
        </div>
        <div id="exp-custom-amounts" style="display:none;margin-top:10px;"></div>
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
              <span style="font-size:13px;">${esc(e.desc)} <span style="color:var(--text-muted);">— paid by ${esc(e.paidBy)}</span>${e.shares?' <span class="pill" style="font-size:9px;">custom split</span>':''}</span>
              <span style="font-size:13px;font-weight:600;">${fmtMoney(e.amount)}</span>
            </div>
            ${e.receiptUrl? `<img src="${e.receiptUrl}" style="max-width:120px;border-radius:8px;margin-top:6px;"/>` : ''}
          </div>`).join('')}
      </div>
    `;
  }

  const REACTION_EMOJIS = ['👍','❤️','😂','⛳','🍺'];

  // ---- feed unread tracking (per-device, localStorage — not shared trip data) ----
  function feedActivityCount(){
    return state.chat.reduce((sum:number,m:any)=>sum+1+((m.replies||[]).length), 0);
  }
  function hasUnreadFeed(){
    let seen = 0;
    try{ seen = parseInt(localStorage.getItem('golf-feed-seen')||'0',10)||0; }catch(e){}
    return feedActivityCount() > seen;
  }
  function markFeedSeen(){
    try{ localStorage.setItem('golf-feed-seen', String(feedActivityCount())); }catch(e){}
  }

  // ---- reactions: one active emoji per person per post ----
  function reactorsFor(msg:any, emoji:string): string[] {
    const r = msg.reactions && msg.reactions[emoji];
    return Array.isArray(r) ? r : [];
  }
  function toggleReaction(msg:any, emoji:string){
    if(!state.session){ alert('Sign in to react.'); return; }
    const person = state.session.name;
    if(!msg.reactions) msg.reactions = {};
    const alreadyOnThis = reactorsFor(msg, emoji).includes(person);
    // One active reaction per person: clear their name from every emoji first.
    REACTION_EMOJIS.forEach(em=>{
      msg.reactions[em] = reactorsFor(msg, em).filter((n:string)=>n!==person);
    });
    // Tapping your own already-active reaction just removes it (the "undo").
    // Tapping a different one adds it back under the new emoji.
    if(!alreadyOnThis){
      msg.reactions[emoji] = [...reactorsFor(msg, emoji), person];
    }
    saveChat();
  }

  function renderFeed(){
    markFeedSeen();
    return `
      <div class="card">
        <h3>Post to the feed</h3>
        <textarea id="feed-text" rows="2" placeholder="Share an update..."></textarea>
        <input type="file" id="feed-photo" accept="image/*" style="margin-top:8px;font-size:12px;"/>
        <button class="btn primary block" data-action="add-post" style="margin-top:10px;">Post</button>
      </div>
      ${state.chat.length===0? '<div class="empty">No posts yet — be the first!</div>' :
        state.chat.slice().reverse().map(renderFeedMessage).join('')
      }
      ${state.reactorsModal ? renderReactorsModal() : ''}
    `;
  }

  function renderFeedMessage(m:any){
    const isAuto = !!m.isAuto;
    const authorP = m.author ? findPlayerObj(m.author) : null;
    const replies = m.replies || [];
    const replying = state.replyingToId === m.id;
    // Auto-posts get their own avatar (a golf flag, since they're not a
    // roster player), a tinted card, and an "AUTO" badge so it's never
    // mistaken for a real person posting.
    const avatarBlock = isAuto
      ? `<div style="width:26px;height:26px;border-radius:50%;flex:0 0 auto;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;">⛳</div>`
      : avatarHtml(authorP, 26);
    return `
      <div class="msg" style="${isAuto?'background:var(--navy-light);border-color:var(--navy);':''}">
        <div style="display:flex;align-items:center;gap:8px;">
          ${avatarBlock}
          <span class="author" style="${isAuto?'color:var(--navy);':''}">${esc(m.author||'Someone')}</span>
          ${isAuto? `<span class="pill" style="font-size:9px;">AUTO</span>` : ''}
          <span class="time">${esc(m.time||'')}</span>
        </div>
        <div style="font-size:14px;margin-top:4px;clear:both;${isAuto?'font-weight:600;':''}">${esc(m.text||'')}</div>
        ${m.photo? `<img src="${m.photo}"/>` : ''}
        ${m.video? `<video src="${m.video}" controls playsinline style="width:100%;border-radius:8px;margin-top:6px;"></video>` : ''}
        <div style="display:flex;gap:2px;margin-top:8px;flex-wrap:wrap;align-items:center;">
          ${REACTION_EMOJIS.map(em=>{
            const names = reactorsFor(m, em);
            const mine = state.session && names.includes(state.session.name);
            return `
            <span style="display:inline-flex;align-items:center;margin:2px 2px 2px 0;">
              <span class="chip reaction-chip ${names.length>0||mine?'':'off'}" style="padding:2px 8px;font-size:12px;${names.length>0?'border-radius:14px 0 0 14px;':''}" data-action="react" data-mid="${esc(m.id||'')}" data-emoji="${em}">${em}</span>${names.length>0? `<span class="chip off" style="padding:2px 6px;font-size:11px;font-weight:700;border-radius:0 14px 14px 0;border-left:none;cursor:pointer;" data-action="show-reactors" data-mid="${esc(m.id||'')}" data-emoji="${em}">${names.length}</span>`:''}
            </span>`;
          }).join('')}
          <button class="link-btn" style="font-size:11px;margin-left:auto;" data-action="toggle-reply" data-mid="${esc(m.id||'')}">Reply${replies.length? ` (${replies.length})`:''}</button>
          ${isAdmin()? `<button class="link-btn" style="font-size:11px;color:var(--danger-text);" data-action="admin-delete-post" data-mid="${esc(m.id||'')}">Delete</button>` : ''}
        </div>
        ${replying? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
          <textarea id="reply-text-${esc(m.id||'')}" rows="2" placeholder="Write a reply..." style="font-size:13px;"></textarea>
          <button class="btn primary small" style="margin-top:6px;" data-action="add-reply" data-mid="${esc(m.id||'')}">Reply</button>
        </div>` : ''}
        ${replies.length? `
        <div style="margin-top:8px;padding-left:12px;border-left:2px solid var(--border);display:flex;flex-direction:column;gap:8px;">
          ${replies.map((r:any)=>{
            const rp = r.author? findPlayerObj(r.author): null;
            return `
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${avatarHtml(rp, 20)}
                <span class="author" style="font-size:11px;">${esc(r.author||'Someone')}</span><span class="time" style="font-size:9px;">${esc(r.time||'')}</span>
              </div>
              <div style="font-size:13px;margin-top:2px;">${esc(r.text||'')}</div>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>`;
  }

  function renderReactorsModal(){
    const { mid, emoji } = state.reactorsModal;
    const msg = state.chat.find((m:any)=>String(m.id)===String(mid));
    const names: string[] = msg ? reactorsFor(msg, emoji) : [];
    return `
    <div class="modal-overlay" data-action="close-reactors-modal">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="row" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;">${emoji} Reacted</h3>
          <button class="link-btn" data-action="close-reactors-modal">Close</button>
        </div>
        ${names.length===0? '<div class="empty">No one yet.</div>' : names.map(n=>{
          const p = findPlayerObj(n);
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;">${avatarHtml(p,26)}<span style="font-size:13px;">${esc(n)}</span></div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderProfile(){
    const p = state.session ? findPlayerObj(state.session.name) : null;
    return `
      <div class="card">
        <h3>Your account</h3>
        ${state.myEmail? `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            ${avatarHtml(p, 48)}
            <div>
              <div style="font-size:14px;font-weight:600;">${p? esc(p.name) : esc(state.myEmail)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(state.myEmail)}</div>
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
          <button class="btn primary block" data-action="go-auth">Sign in</button>
        `}
      </div>
      ${renderLunchOrderSection()}
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
        <span class="chip ${view==='mullies'?'':'off'}" data-action="admin-nav" data-view="mullies">Mullies</span>
        <span class="chip ${view==='expenses'?'':'off'}" data-action="admin-nav" data-view="expenses">Expenses</span>
        <span class="chip ${view==='print'?'':'off'}" data-action="admin-nav" data-view="print">Print scorecards</span>
        <span class="chip ${view==='roster'?'':'off'}" data-action="admin-nav" data-view="roster">Roster &amp; groups</span>
        <span class="chip ${view==='lunch'?'':'off'}" data-action="admin-nav" data-view="lunch">Lunch orders</span>
        <span class="chip ${view==='audit'?'':'off'}" data-action="admin-nav" data-view="audit">Score audit log</span>
        <span class="chip ${view==='danger'?'':'off'}" data-action="admin-nav" data-view="danger">Danger zone</span>
      </div>
      ${view==='scoring'?renderAdminScoring()
        : view==='mullies'?renderAdminMullies()
        : view==='expenses'?renderAdminExpenses()
        : view==='print'?renderAdminPrint()
        : view==='roster'?renderRosterEditor()
        : view==='lunch'?renderAdminLunchOrders()
        : view==='audit'?renderAdminAuditLog()
        : renderAdminDanger()}
    `;
  }

  function renderAdminMullies(){
    const roundId = state.adminMulliganRoundId || autoRoundId();
    return `
      <div class="card">
        <h3>Edit Shotgun Mullies</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Directly set anyone's mulligan count for a round — for fixing mistakes. The leaderboard sums both Saturday rounds for display.</div>
        <label class="field">Round</label>
        <select data-action="admin-mulligan-pick-round">${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===roundId?'selected':''}>${r.label}</option>`).join('')}</select>
        ${allPlayerNames().map(name=>{
          const p = findPlayerObj(name);
          return `
          <div style="display:flex;align-items:center;gap:10px;margin:10px 0;">
            ${avatarHtml(p,28)}
            <span style="flex:1;font-size:13px;">${esc(name)}</span>
            <input type="number" min="0" style="width:70px;" data-action="admin-set-mulligan" data-round="${esc(roundId)}" data-player="${esc(name)}" value="${getMulligans(roundId,name)}"/>
          </div>`;
        }).join('')}
      </div>
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
            <button class="btn small" data-action="admin-erase-score" data-player="${esc(name)}" ${val==null?'disabled':''}>✕ Clear</button>
          </div>`;
        }).join('')}
        `}
      </div>
    `;
  }

  function renderAdminAuditLog(){
    const roundFilter = state.auditFilterRound || 'all';
    const playerFilter = state.auditFilterPlayer || 'all';
    let entries = state.scoreAuditLog.slice().reverse();
    if(roundFilter!=='all') entries = entries.filter((e:any)=>e.roundId===roundFilter);
    if(playerFilter!=='all') entries = entries.filter((e:any)=>e.player===playerFilter);
    return `
      <div class="card">
        <h3>Score audit log</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Every score set, changed, or erased — troubleshooting tool, not shown to players. Append-only.</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <select data-action="audit-filter-round">
            <option value="all" ${roundFilter==='all'?'selected':''}>All rounds</option>
            ${ROUNDS.map(r=>`<option value="${r.id}" ${r.id===roundFilter?'selected':''}>${esc(r.label)}</option>`).join('')}
          </select>
          <select data-action="audit-filter-player">
            <option value="all" ${playerFilter==='all'?'selected':''}>All players</option>
            ${allPlayerNames().map(n=>`<option value="${esc(n)}" ${n===playerFilter?'selected':''}>${esc(n)}</option>`).join('')}
          </select>
        </div>
        ${entries.length===0? '<div class="empty">No matching entries.</div>' : entries.map((e:any)=>`
          <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
            <div style="display:flex;justify-content:space-between;">
              <b>${esc(e.player)}</b><span style="color:var(--text-muted);">${esc(e.time)}</span>
            </div>
            <div>${esc(roundOf(e.roundId).label)} · Hole ${e.hole} — ${esc(String(e.prevValue))} → ${esc(String(e.newValue))} ${e.isAdminOverride?'<span class="pill gold" style="font-size:9px;">ADMIN</span>':''}</div>
            <div style="color:var(--text-secondary);">by ${esc(e.actor)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---- Saturday lunch pre-order helpers ----
  function lunchFindItem(itemId:string){
    for(const cat of LUNCH_MENU){ const it = cat.items.find(i=>i.id===itemId); if(it) return it; }
    return null;
  }
  function lunchLineFor(draft:any, itemId:string){
    return draft.lines.find((l:any)=>l.itemId===itemId);
  }
  function lunchLinePrice(line:any){
    const item = lunchFindItem(line.itemId);
    if(!item) return 0;
    let unit = item.price;
    if(line.modifiers?.subFries) unit += LUNCH_MODIFIERS.find(m=>m.id==='subFries')!.price;
    if(line.modifiers?.wrap) unit += LUNCH_MODIFIERS.find(m=>m.id==='wrap')!.price;
    return unit * line.qty;
  }
  function lunchDraftTotal(draft:any){
    return draft.lines.reduce((sum:number,l:any)=>sum+lunchLinePrice(l), 0);
  }
  function lunchOrderModsLabel(l:any){
    return [l.choice, l.modifiers?.subFries?'sub fries':null, l.modifiers?.wrap?'wrap':null].filter(Boolean).join(', ');
  }
  function renderLunchMenuItems(draft:any, readonly:boolean){
    return LUNCH_MENU.map(cat=>`
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:6px;">${esc(cat.label)}</div>
        ${cat.items.map((item:any)=>{
          const line = lunchLineFor(draft, item.id);
          const qty = line? line.qty : 0;
          if(readonly && qty<=0) return '';
          return `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;font-weight:600;">${esc(item.name)}</span>
              <span style="font-size:12px;color:var(--text-secondary);">${fmtMoney(item.price)}</span>
            </div>
            ${!readonly ? `
            <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
              <button class="btn small" data-action="lunch-qty" data-item="${item.id}" data-delta="-1" ${qty<=0?'disabled':''}>−</button>
              <span style="min-width:16px;text-align:center;font-weight:600;">${qty}</span>
              <button class="btn small" data-action="lunch-qty" data-item="${item.id}" data-delta="1">+</button>
            </div>
            ${qty>0 && item.choice? `
            <select data-action="lunch-choice" data-item="${item.id}" style="margin-top:6px;">
              <option value="">Choose ${esc(item.choice.label.toLowerCase())}…</option>
              ${item.choice.options.map((o:string)=>`<option value="${esc(o)}" ${line?.choice===o?'selected':''}>${esc(o)}</option>`).join('')}
            </select>` : ''}
            ${qty>0 && cat.modifiersAllowed? `
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
              ${LUNCH_MODIFIERS.map(mod=>`
                <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" data-action="lunch-modifier" data-item="${item.id}" data-mod="${mod.id}" ${(line?.modifiers as any)?.[mod.id]?'checked':''}/>
                  ${esc(mod.label)} (+${fmtMoney(mod.price)})
                </label>
              `).join('')}
            </div>` : ''}
            ` : `
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
              Qty ${qty}${lunchOrderModsLabel(line)? ` · ${esc(lunchOrderModsLabel(line))}` : ''}
            </div>`}
          </div>`;
        }).join('')}
      </div>
    `).join('');
  }
  function renderLunchOrderSummary(draft:any){
    if(draft.lines.length===0) return `<div class="empty" style="padding:10px 0;">No items selected yet.</div>`;
    return `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        ${draft.lines.map((l:any)=>{
          const item = lunchFindItem(l.itemId);
          if(!item) return '';
          const mods = lunchOrderModsLabel(l);
          return `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
            <span>${l.qty}x ${esc(item.name)}${mods? ` <span style="color:var(--text-muted);">(${esc(mods)})</span>`:''}</span>
            <span>${fmtMoney(lunchLinePrice(l))}</span>
          </div>`;
        }).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
          <span>Total</span><span>${fmtMoney(lunchDraftTotal(draft))}</span>
        </div>
      </div>
    `;
  }
  function renderLunchOrderSection(){
    if(!state.session) return '';
    const locked = Date.now() >= LUNCH_ORDER_DEADLINE.getTime();
    const deadlineLabel = LUNCH_ORDER_DEADLINE.toLocaleString([], {weekday:'long', hour:'numeric', minute:'2-digit'});
    const existing = state.lunchOrders[state.session.name];
    if(locked){
      return `
        <div class="card">
          <h3>🌭 Saturday Lunch Order</h3>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Orders closed ${esc(deadlineLabel)}.</div>
          ${existing? renderLunchMenuItems(existing, true) : `<div class="empty">You didn't submit an order.</div>`}
        </div>
      `;
    }
    if(!state.lunchOrderDraft){
      state.lunchOrderDraft = existing ? JSON.parse(JSON.stringify(existing)) : { lines: [] };
    }
    const draft = state.lunchOrderDraft;
    return `
      <div class="card">
        <h3>🌭 Saturday Lunch Order</h3>
        <div style="font-size:12px;color:var(--danger-text);font-weight:600;margin-bottom:10px;">Order by ${esc(deadlineLabel)} or you're excluded from the order.</div>
        ${renderLunchMenuItems(draft, false)}
        ${renderLunchOrderSummary(draft)}
        ${state.lunchOrderSavedMsg? `<div style="font-size:12px;color:var(--success-text);margin-top:8px;">${esc(state.lunchOrderSavedMsg)}</div>` : ''}
        <button class="btn primary block" style="margin-top:12px;" data-action="lunch-submit">${existing? 'Update order' : 'Submit order'}</button>
      </div>
    `;
  }
  function renderAdminLunchOrders(){
    const orders = state.lunchOrders;
    const submittedNames = Object.keys(orders);
    const missing = allPlayerNames().filter((n:string)=>!orders[n]);
    const grouped: Record<string, {item:any, totalQty:number, entries:{player:string, qty:number, choice?:string, modifiers?:any}[]}> = {};
    let grandItems = 0, grandTotal = 0;
    submittedNames.forEach(name=>{
      const o = orders[name];
      o.lines.forEach((l:any)=>{
        const item = lunchFindItem(l.itemId);
        if(!item) return;
        if(!grouped[l.itemId]) grouped[l.itemId] = { item, totalQty:0, entries:[] };
        grouped[l.itemId].totalQty += l.qty;
        grouped[l.itemId].entries.push({ player:name, qty:l.qty, choice:l.choice, modifiers:l.modifiers });
        grandItems += l.qty;
        grandTotal += lunchLinePrice(l);
      });
    });
    return `
      <div class="card" style="text-align:center;">
        <h3 style="margin:0;">🌭 Saturday Lunch — ready ${esc(LUNCH_READY_TIME_LABEL)}</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Combined clubhouse order</div>
      </div>
      <div class="card">
        <h3>By item</h3>
        ${Object.keys(grouped).length===0? '<div class="empty">No orders yet.</div>' : Object.values(grouped).map(g=>`
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div style="font-weight:700;font-size:13px;">${esc(g.item.name)} x${g.totalQty}</div>
            ${g.entries.map(e=>`<div style="font-size:12px;color:var(--text-secondary);margin-left:8px;">${esc(e.player)} (${e.qty})${e.choice?` — ${esc(e.choice)}`:''}${e.modifiers?.subFries?' — sub fries':''}${e.modifiers?.wrap?' — wrap':''}</div>`).join('')}
          </div>
        `).join('')}
      </div>
      <div class="card">
        <h3>By person</h3>
        ${submittedNames.length===0? '<div class="empty">No orders yet.</div>' : submittedNames.map(name=>{
          const o = orders[name];
          const total = o.lines.reduce((s:number,l:any)=>s+lunchLinePrice(l),0);
          return `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div style="font-weight:700;font-size:13px;">${esc(name)} — ${fmtMoney(total)}</div>
            ${o.lines.map((l:any)=>{
              const item = lunchFindItem(l.itemId);
              if(!item) return '';
              const mods = lunchOrderModsLabel(l);
              return `<div style="font-size:12px;color:var(--text-secondary);margin-left:8px;">${l.qty}x ${esc(item.name)}${mods?` (${esc(mods)})`:''}</div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <h3>Totals</h3>
        <div style="font-size:13px;">Items: <b>${grandItems}</b></div>
        <div style="font-size:13px;">Total: <b>${fmtMoney(grandTotal)}</b></div>
      </div>
      <div class="card" style="${missing.length?'border-color:var(--danger-text);':''}">
        <h3>Didn't order (${missing.length})</h3>
        ${missing.length===0? '<div class="empty">Everyone ordered!</div>' : missing.map((n:string)=>`<span class="chip off" style="margin:2px;">${esc(n)}</span>`).join('')}
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
        <div class="scorecard-header">
          <img src="/logo.png" alt="Trip logo"/>
          <h3 style="margin:0;">${is2v2? '2v2 Scorecard' : 'Blank Scorecard'}</h3>
        </div>
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

  // Scrolls each player's score strip so the currently-selected value (par
  // by default) sits centered in view, instead of at the left edge. Runs on
  // every fullscreen-score render — innerHTML replacement resets scrollLeft
  // to 0 each time anyway, so "recenter always" is what keeps this correct
  // both on initial load/hole-change and after any in-place re-render.
  function centerScoreStrips(){
    document.querySelectorAll('.scorestrip').forEach((strip:any)=>{
      const sel = strip.querySelector('.scorebtn-sm.selected');
      if(!sel) return;
      // offsetLeft is relative to the nearest positioned ancestor, which may
      // not be the strip itself — measure via getBoundingClientRect instead
      // so this works regardless of the surrounding layout's positioning.
      const stripRect = strip.getBoundingClientRect();
      const selRect = sel.getBoundingClientRect();
      const selLeftWithinStrip = (selRect.left - stripRect.left) + strip.scrollLeft;
      const target = selLeftWithinStrip - (strip.clientWidth/2) + (selRect.width/2);
      strip.scrollLeft = Math.max(0, target);
    });
  }

  // ---- video shotgun mulligan capture ----
  // Lives entirely outside the normal render()/#app innerHTML cycle — that
  // cycle can be triggered at any moment by an unrelated realtime update
  // (someone posts an expense while a video is recording), and innerHTML
  // replacement would tear down the live <video> preview mid-recording.
  // Appending our own overlay directly to document.body keeps it immune.
  let mulliganCtx: any = null;
  // Guards the async gap between clicking Cancel and getUserMedia()
  // resolving/MediaRecorder.stop() actually firing onstop — without this,
  // a stream acquired (or a recording finished) after Cancel was already
  // clicked would otherwise get attached to media elements and left
  // playing with nothing around anymore to ever stop it.
  let mulliganCancelled = false;

  // Stops every track on a getUserMedia stream — this alone is NOT enough
  // to make iOS drop its "Now Playing" indicator; the <video> element
  // itself also needs to be paused and have its source cleared (see
  // releaseVideoEl below), since it can keep playing audio even once
  // detached from the visible layout if its source is still attached.
  function stopMediaStream(stream: MediaStream | null | undefined){
    if(!stream) return;
    stream.getTracks().forEach(t=>{ try{ t.stop(); }catch(e){} });
  }
  function releaseVideoEl(videoEl: HTMLVideoElement | null | undefined){
    if(!videoEl) return;
    try{ videoEl.pause(); }catch(e){}
    try{ videoEl.srcObject = null; }catch(e){}
    try{ videoEl.removeAttribute('src'); videoEl.load(); }catch(e){}
  }
  // iOS can populate its Now Playing / Dynamic Island media indicator for a
  // playing <video> even without the page ever touching the Media Session
  // API directly. We don't set navigator.mediaSession anywhere explicitly,
  // but reset it defensively on every exit path anyway, in case any is set
  // implicitly by the platform.
  function resetMediaSession(){
    try{
      const ms: any = (navigator as any).mediaSession;
      if(ms){
        ms.metadata = null;
        if('playbackState' in ms) ms.playbackState = 'none';
      }
    }catch(e){}
  }

  function openMulliganCaptureFlow(player:string, roundId:string){
    let overlay = document.getElementById('mulligan-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'mulligan-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:200;display:flex;flex-direction:column;';
      document.body.appendChild(overlay);
    }
    beginMulliganRecording(overlay, player, roundId);
  }

  // The one true exit path — Cancel, the getUserMedia-failed Close button,
  // or called defensively before starting over. Fully tears down whatever
  // stream/recorder/video is currently active, however far the flow got.
  function teardownMulliganCapture(){
    mulliganCancelled = true;
    if(mulliganCtx){
      if(mulliganCtx.iv) clearInterval(mulliganCtx.iv);
      if(mulliganCtx.recorder && mulliganCtx.recorder.state!=='inactive'){
        try{ mulliganCtx.recorder.stop(); }catch(e){}
      }
      stopMediaStream(mulliganCtx.stream);
      if(mulliganCtx.videoUrl){ URL.revokeObjectURL(mulliganCtx.videoUrl); }
    }
    const overlay = document.getElementById('mulligan-overlay');
    if(overlay){
      releaseVideoEl(overlay.querySelector('video'));
      overlay.remove();
    }
    resetMediaSession();
    mulliganCtx = null;
  }

  function beginMulliganRecording(overlay:HTMLElement, player:string, roundId:string){
    mulliganCancelled = false;
    overlay.innerHTML = `
      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <video id="mull-video" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
        <div style="position:absolute;top:16px;left:16px;background:rgba(0,0,0,0.55);color:#fff;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#e53935;animation:mullpulse 1s infinite;"></span>
          <span id="mull-timer">Recording… 10</span>
        </div>
        <button id="mull-cancel" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:13px;">Cancel</button>
      </div>
      <div style="text-align:center;color:#fff;font-size:13px;padding:12px;">🍺 ${esc(player)}'s shotgun mulligan</div>
    `;
    document.getElementById('mull-cancel')!.onclick = ()=> teardownMulliganCapture();

    const videoEl = document.getElementById('mull-video') as HTMLVideoElement;
    navigator.mediaDevices.getUserMedia({
      // Rear-facing by default — whoever's recording is filming someone
      // else's mulligan, not themselves. (Separate from and does not
      // affect the selfie/avatar capture flow, which stays front-facing.)
      video: { facingMode:'environment', width:{ideal:640}, height:{ideal:854}, frameRate:{ideal:24} },
      audio: true,
    }).then((stream)=>{
      // Cancel was clicked while getUserMedia was still resolving — this
      // stream was never attached to anything, so stop it immediately
      // instead of leaving it running with no UI left to release it.
      if(mulliganCancelled){ stopMediaStream(stream); return; }
      videoEl.srcObject = stream;
      const chunks: Blob[] = [];
      const preferredType = ['video/webm;codecs=vp8,opus','video/webm','video/mp4']
        .find(t=>(window as any).MediaRecorder && MediaRecorder.isTypeSupported(t));
      // Compression happens at capture time (constrained resolution/frame
      // rate above + a capped bitrate here) rather than a separate transcode
      // pass — there's no lightweight in-browser video transcoder available,
      // and this keeps a 10s clip to a reasonable upload size.
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType, videoBitsPerSecond: 1_000_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 1_000_000 });
      recorder.ondataavailable = (e)=>{ if(e.data.size>0) chunks.push(e.data); };
      recorder.onstop = ()=>{
        stopMediaStream(stream);
        releaseVideoEl(videoEl);
        // Cancel was clicked mid-recording: recorder.stop() fires this
        // handler asynchronously, after the overlay may already be gone.
        // Without this check we'd still build a fresh autoplay review
        // <video> in a detached-but-alive overlay — a real orphaned
        // audio/video element with nothing left to ever stop it, which is
        // exactly the stuck Now-Playing-indicator bug this fixes.
        if(mulliganCancelled) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        showMulliganReview(overlay, player, roundId, blob);
      };
      recorder.start();
      let remaining = 10;
      const timerEl = document.getElementById('mull-timer');
      const iv = setInterval(()=>{
        remaining--;
        if(timerEl) timerEl.textContent = `Recording… ${Math.max(remaining,0)}`;
        if(remaining<=0){
          clearInterval(iv);
          if(recorder.state!=='inactive') recorder.stop();
        }
      }, 1000);
      mulliganCtx = { stream, recorder, iv };
    }).catch((err:any)=>{
      if(mulliganCancelled) return;
      overlay.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#fff;font-size:14px;">
          Camera/mic access is needed to record a mulligan.${err && err.message ? ' ('+esc(err.message)+')' : ''}
        </div>
        <button id="mull-close-err" style="margin:0 16px 16px;padding:12px;border-radius:10px;border:none;background:#fff;font-weight:600;">Close</button>
      `;
      document.getElementById('mull-close-err')!.onclick = ()=> teardownMulliganCapture();
    });
  }

  function showMulliganReview(overlay:HTMLElement, player:string, roundId:string, blob:Blob){
    const url = URL.createObjectURL(blob);
    mulliganCtx = { videoUrl: url };
    overlay.innerHTML = `
      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <video id="mull-review-video" src="${url}" controls autoplay loop playsinline style="width:100%;height:100%;object-fit:contain;background:#000;"></video>
      </div>
      <div style="display:flex;gap:10px;padding:14px;background:#000;">
        <button id="mull-retake" class="toolbarbtn" style="flex:1;background:transparent;color:#fff;border-color:rgba(255,255,255,0.4);">Retake</button>
        <button id="mull-post" class="toolbarbtn primary" style="flex:1;">Post mulligan</button>
      </div>
    `;
    document.getElementById('mull-retake')!.onclick = ()=>{
      releaseVideoEl(document.getElementById('mull-review-video') as HTMLVideoElement);
      URL.revokeObjectURL(url);
      beginMulliganRecording(overlay, player, roundId);
    };
    document.getElementById('mull-post')!.onclick = async ()=>{
      const postBtn = document.getElementById('mull-post') as HTMLButtonElement;
      postBtn.disabled = true; postBtn.textContent = 'Posting…';
      try{
        const ext = (blob.type||'').includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `mulligan-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
        const uploadedUrl = await uploadPhoto(file, 'mulligans');
        if(uploadedUrl){
          const id = Date.now()+'-'+Math.random().toString(36).slice(2,7);
          const time = new Date().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          state.chat.push({ id, author: player, text: `🍺 ${player} took a shotgun mulligan`, time, video: uploadedUrl, reactions:{}, replies:[] });
          saveChat();
          changeMulligan(roundId, player, 1);
        } else {
          alert('Upload failed — check your connection and try again.');
          postBtn.disabled = false; postBtn.textContent = 'Post mulligan';
          return;
        }
        URL.revokeObjectURL(url);
        mulliganCtx = null;
        releaseVideoEl(document.getElementById('mull-review-video') as HTMLVideoElement);
        const el = document.getElementById('mulligan-overlay');
        if(el) el.remove();
        resetMediaSession();
        render();
      }catch(e){
        postBtn.disabled = false; postBtn.textContent = 'Post mulligan';
        alert('Something went wrong posting the mulligan — try again.');
      }
    };
  }

  function bindEvents(){
    document.querySelectorAll('[data-tab]').forEach((el:any)=>{
      el.onclick = ()=>{
        const nextTab = el.dataset.tab;
        if(nextTab!==state.tab && !confirmLeaveRoster()) return;
        state.tab = nextTab;
        if(state.tab==='score' && !groupInRound(state.activeRoundId, state.activeGroupId)){
          state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
        }
        render();
      };
    });
    document.querySelectorAll('[data-action]').forEach((el:any)=>{
      const action = el.dataset.action;
      if(action==='go-auth'){ el.onclick=()=>{ state.tab='auth'; render(); }; }
      if(action==='submit-signin'){ el.onclick=()=>{
        state.authEmail = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
        doIdentify();
      }; }
      if(action==='sign-out'){ el.onclick=()=>{ doSignOut(); }; }
      if(action==='onboarding-file'){ el.onchange=()=>{
        if(el.files && el.files[0]) handleAvatarFile(el.files[0]);
      }; }
      if(action==='profile-photo-file'){ el.onchange=()=>{
        if(el.files && el.files[0]) handleAvatarFile(el.files[0]);
      }; }
      if(action==='roster-photo-file'){ el.onchange=()=>{
        if(el.files && el.files[0]) handleRosterAvatarFile(el.files[0], el.dataset.player);
      }; }
      if(action==='rename-player'){ el.onchange=()=>{
        const pi=el.dataset.pi;
        const draft = state.configDraft;
        const oldName = draft.roster[pi].name;
        const newName = el.value.trim() || oldName;
        draft.roster[pi].name = newName;
        if(oldName!==newName){
          Object.values(draft.rounds).forEach((gs:any)=>gs.forEach((g:any)=>{
            g.players = g.players.map((n:string)=>n===oldName?newName:n);
            if(g.teams && g.teams[oldName]!=null){ g.teams[newName]=g.teams[oldName]; delete g.teams[oldName]; }
          }));
        }
        render();
      }; }
      if(action==='set-fullname'){ el.onchange=()=>{ state.configDraft.roster[el.dataset.pi].fullName = el.value; render(); }; }
      if(action==='set-email'){ el.onchange=()=>{ state.configDraft.roster[el.dataset.pi].email = el.value; render(); }; }
      if(action==='set-handicap'){ el.onchange=()=>{ state.configDraft.roster[el.dataset.pi].handicap = parseInt(el.value,10)||0; render(); }; }
      if(action==='remove-player'){ el.onclick=()=>{
        const draft = state.configDraft;
        const name = draft.roster[el.dataset.pi].name;
        draft.roster.splice(el.dataset.pi,1);
        Object.values(draft.rounds).forEach((gs:any)=>gs.forEach((g:any)=>{
          g.players = g.players.filter((n:string)=>n!==name);
          if(g.teams) delete g.teams[name];
        }));
        render();
      }; }
      if(action==='add-player'){ el.onclick=()=>{
        state.configDraft.roster.push({name:'New player', fullName:'New player', email:'', handicap:0, avatarUrl:null});
        render();
      }; }
      if(action==='rename-teetime'){ el.onchange=()=>{
        state.configDraft.rounds[el.dataset.round][el.dataset.gi].teeTime = el.value; render();
      }; }
      if(action==='remove-group'){ el.onclick=()=>{
        state.configDraft.rounds[el.dataset.round].splice(el.dataset.gi,1); render();
      }; }
      if(action==='add-group'){ el.onclick=()=>{
        const roundId = el.dataset.round;
        const n = state.configDraft.rounds[roundId].length+1;
        state.configDraft.rounds[roundId].push({id:roundId+'-g'+n+'-'+Date.now(), teeTime:'TBD', players:[], teams: (roundId==='satam'||roundId==='satpm')?{}:undefined});
        render();
      }; }
      if(action==='toggle-group-player'){ el.onclick=()=>{
        const g = state.configDraft.rounds[el.dataset.round][el.dataset.gi];
        const name = el.dataset.player;
        if(g.players.includes(name)){
          g.players = g.players.filter((n:string)=>n!==name);
          if(g.teams) delete g.teams[name];
        } else {
          g.players.push(name);
          if(g.teams) g.teams[name] = 'A';
        }
        render();
      }; }
      if(action==='set-round-team'){ el.onchange=()=>{
        const g = state.configDraft.rounds[el.dataset.round][el.dataset.gi];
        if(!g.teams) g.teams={};
        g.teams[el.dataset.player] = el.value;
        render();
      }; }
      if(action==='admin-roster-save'){ el.onclick=()=>{
        state.config = state.configDraft;
        state.configDraft = null;
        saveConfig();
        state.rosterSavedMsg = 'Saved!';
        render();
        setTimeout(()=>{ state.rosterSavedMsg=''; render(); }, 2500);
      }; }
      if(action==='admin-roster-discard'){ el.onclick=()=>{
        if(!isRosterDraftDirty() || confirm('Discard unsaved roster/tee-time changes?')){
          state.configDraft = JSON.parse(JSON.stringify(state.config));
          render();
        }
      }; }
      if(action==='pick-round'){ el.onchange=()=>{
        state.activeRoundId=el.value; state.activeHole=1;
        state.activeGroupId = defaultGroupIdForRound(state.activeRoundId);
        state.pickerModalOpen=false; render();
      }; }
      if(action==='pick-group'){ el.onchange=()=>{ state.activeGroupId=el.value; state.pickerModalOpen=false; render(); }; }
      if(action==='open-picker-modal'){ el.onclick=()=>{ state.pickerModalOpen=true; render(); }; }
      if(action==='open-scorecard-modal'){ el.onclick=()=>{ state.scorecardModalOpen=!state.scorecardModalOpen; render(); }; }
      if(action==='close-modals'){ el.onclick=()=>{
        state.pickerModalOpen=false; state.scorecardModalOpen=false; state.beaverPanelOpen=false; state.mulliganPanelOpen=false;
        state.boardNetScorecardOpen=false; state.matchScorecardRoundId=null; state.matchScorecardGroupId=null;
        render();
      }; }
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
      if(action==='start-mulligan-capture'){ el.onclick=()=>{
        state.mulliganPanelOpen = false;
        render();
        openMulliganCaptureFlow(el.dataset.player, el.dataset.round);
      }; }
      if(action==='submit-hole'){ el.onclick=()=>{
        if(state.activeHole<18){ state.activeHole++; }
        render();
      }; }
      if(action==='prev-hole'){ el.onclick=()=>{ if(state.activeHole>1) state.activeHole--; render(); }; }
      if(action==='next-hole'){ el.onclick=()=>{ if(state.activeHole<18) state.activeHole++; render(); }; }
      if(action==='pick-board-round'){ el.onclick=()=>{ state.boardRoundId=el.dataset.round; render(); }; }
      if(action==='toggle-board-expand'){ el.onclick=()=>{ state.boardExpanded[el.dataset.key]=!state.boardExpanded[el.dataset.key]; render(); }; }
      if(action==='open-net-scorecard-modal'){ el.onclick=()=>{ state.boardNetScorecardOpen=true; render(); }; }
      if(action==='open-match-scorecard-modal'){ el.onclick=()=>{
        state.matchScorecardRoundId = el.dataset.round;
        state.matchScorecardGroupId = el.dataset.group;
        render();
      }; }
      if(action==='react'){
        // Long-press (or press-and-hold with a mouse) shows who reacted instead
        // of toggling — a redundant path to the same info the count badge opens.
        let pressTimer: any = null;
        let longPressed = false;
        const startPress = ()=>{
          longPressed = false;
          pressTimer = setTimeout(()=>{
            longPressed = true;
            state.reactorsModal = { mid: el.dataset.mid, emoji: el.dataset.emoji };
            render();
          }, 550);
        };
        const cancelPress = ()=>{ if(pressTimer) clearTimeout(pressTimer); };
        el.addEventListener('touchstart', startPress, {passive:true});
        el.addEventListener('touchend', cancelPress);
        el.addEventListener('touchmove', cancelPress);
        el.addEventListener('mousedown', startPress);
        el.addEventListener('mouseup', cancelPress);
        el.addEventListener('mouseleave', cancelPress);
        el.onclick = ()=>{
          if(longPressed){ longPressed=false; return; }
          const msg = state.chat.find((m:any)=>String(m.id)===el.dataset.mid);
          if(!msg) return;
          toggleReaction(msg, el.dataset.emoji);
          render();
        };
      }
      if(action==='show-reactors'){ el.onclick=()=>{
        state.reactorsModal = { mid: el.dataset.mid, emoji: el.dataset.emoji };
        render();
      }; }
      if(action==='close-reactors-modal'){ el.onclick=()=>{ state.reactorsModal = null; render(); }; }
      if(action==='toggle-reply'){ el.onclick=()=>{
        state.replyingToId = (state.replyingToId===el.dataset.mid) ? null : el.dataset.mid;
        render();
      }; }
      if(action==='add-reply'){ el.onclick=()=>{
        const mid = el.dataset.mid;
        const textEl = document.getElementById(`reply-text-${mid}`) as HTMLTextAreaElement | null;
        const text = textEl ? textEl.value.trim() : '';
        if(!text) return;
        const msg = state.chat.find((m:any)=>String(m.id)===mid);
        if(!msg) return;
        if(!msg.replies) msg.replies = [];
        const author = state.session ? state.session.name : 'Someone';
        const time = new Date().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        msg.replies.push({ id: Date.now()+'-'+Math.random().toString(36).slice(2,7), author, text, time });
        saveChat();
        state.replyingToId = null;
        render();
      }; }
      if(action==='mark-paid'){ el.onclick=()=>{
        state.payments.push({ id:Date.now()+'-'+Math.random().toString(36).slice(2,7), from:el.dataset.from, to:el.dataset.to, amount:parseFloat(el.dataset.amount), time:new Date().toISOString() });
        savePayments();
        render();
      }; }
      if(action==='set-expense-split-mode'){ el.onclick=()=>{
        document.getElementById('exp-split-mode-even')!.classList.toggle('off', el.dataset.mode!=='even');
        document.getElementById('exp-split-mode-custom')!.classList.toggle('off', el.dataset.mode!=='custom');
        rebuildExpenseCustomAmounts();
      }; }
      if(action==='add-expense'){ el.onclick=async ()=>{
        const desc = (document.getElementById('exp-desc') as HTMLInputElement).value.trim();
        const amount = parseFloat((document.getElementById('exp-amount') as HTMLInputElement).value);
        const paidBy = (document.getElementById('exp-paidby') as HTMLSelectElement).value;
        const splitChips = document.querySelectorAll('#exp-split .chip:not(.off)');
        const splitAmong = Array.from(splitChips).map((c:any)=>c.dataset.player);
        if(!desc || !amount || splitAmong.length===0){ alert('Add a description, amount, and at least one person to split with.'); return; }
        const customChip = document.getElementById('exp-split-mode-custom');
        const isCustom = !!(customChip && !customChip.classList.contains('off'));
        let shares: Record<string,number> | undefined;
        if(isCustom){
          const inputs = Array.from(document.querySelectorAll('#exp-custom-amounts .exp-share-input')) as HTMLInputElement[];
          shares = {};
          let sum = 0;
          for(const inp of inputs){
            const v = parseFloat(inp.value);
            if(isNaN(v) || v<0){ alert('Enter a valid amount for every participant.'); return; }
            const rounded = Math.round(v*100)/100;
            shares[inp.dataset.player!] = rounded;
            sum += rounded;
          }
          const diff = Math.round((amount-sum)*100)/100;
          if(Math.abs(diff)>=0.01){
            alert(`Custom amounts must add up to the total (${fmtMoney(amount)}). Currently ${diff>0?'short by '+fmtMoney(diff):'over by '+fmtMoney(-diff)}.`);
            return;
          }
        }
        const photoInput = document.getElementById('exp-photo') as HTMLInputElement;
        let receiptUrl: string | null = null;
        if(photoInput.files && photoInput.files[0]){
          const compressed = await compressImage(photoInput.files[0]);
          receiptUrl = await uploadPhoto(compressed, 'receipts');
        }
        const record: any = {desc, amount, paidBy, splitAmong, receiptUrl};
        if(shares) record.shares = shares;
        state.expenses.push(record);
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
      if(action==='admin-delete-post'){ el.onclick=()=>{
        if(!confirm('Delete this post? Its replies and reactions will be removed too.')) return;
        const mid = el.dataset.mid;
        state.chat = state.chat.filter((m:any)=>String(m.id)!==mid);
        saveChat();
        render();
      }; }
      // ---- Saturday lunch pre-order ----
      if(action==='lunch-qty'){ el.onclick=()=>{
        const itemId = el.dataset.item;
        const delta = parseInt(el.dataset.delta,10);
        const draft = state.lunchOrderDraft;
        let line = lunchLineFor(draft, itemId);
        if(!line){ line = {itemId, qty:0, modifiers:{}}; draft.lines.push(line); }
        line.qty = Math.max(0, line.qty+delta);
        if(line.qty===0){ draft.lines = draft.lines.filter((l:any)=>l!==line); }
        render();
      }; }
      if(action==='lunch-choice'){ el.onchange=()=>{
        const line = lunchLineFor(state.lunchOrderDraft, el.dataset.item);
        if(line) line.choice = el.value;
        render();
      }; }
      if(action==='lunch-modifier'){ el.onchange=()=>{
        const line = lunchLineFor(state.lunchOrderDraft, el.dataset.item);
        if(line){ if(!line.modifiers) line.modifiers={}; line.modifiers[el.dataset.mod] = el.checked; }
        render();
      }; }
      if(action==='lunch-submit'){ el.onclick=()=>{
        const draft = state.lunchOrderDraft;
        for(const line of draft.lines){
          const item = lunchFindItem(line.itemId);
          if(item?.choice && !line.choice){
            alert(`Pick a ${item.choice.label.toLowerCase()} for ${item.name}.`);
            return;
          }
        }
        if(draft.lines.length===0 && !confirm('Submit an empty order (no lunch)?')) return;
        state.lunchOrders[state.session.name] = { player: state.session.name, lines: JSON.parse(JSON.stringify(draft.lines)), submittedAt: Date.now() };
        saveLunchOrders();
        state.lunchOrderDraft = null;
        state.lunchOrderSavedMsg = 'Order submitted!';
        render();
        setTimeout(()=>{ state.lunchOrderSavedMsg=''; render(); }, 2500);
      }; }
      // ---- Admin ----
      if(action==='admin-nav'){ el.onclick=()=>{
        const nextView = el.dataset.view;
        if(nextView!==state.adminView && !confirmLeaveRoster()) return;
        state.adminView=nextView; render();
      }; }
      if(action==='admin-pick-round'){ el.onchange=()=>{
        state.adminRoundId=el.value; state.adminHole=1;
        const gs = groupsForRound(state.adminRoundId);
        state.adminGroupId = gs.length? gs[0].id : null;
        render();
      }; }
      if(action==='admin-pick-group'){ el.onchange=()=>{ state.adminGroupId=el.value; render(); }; }
      if(action==='admin-hole-prev'){ el.onclick=()=>{ if(state.adminHole>1) state.adminHole--; render(); }; }
      if(action==='admin-hole-next'){ el.onclick=()=>{ if(state.adminHole<18) state.adminHole++; render(); }; }
      if(action==='admin-mulligan-pick-round'){ el.onchange=()=>{ state.adminMulliganRoundId=el.value; render(); }; }
      if(action==='admin-set-mulligan'){ el.onchange=()=>{
        const v = Math.max(0, parseInt(el.value,10)||0);
        const roundId = el.dataset.round;
        if(!state.mulligans[roundId]) state.mulligans[roundId] = {};
        state.mulligans[roundId][el.dataset.player] = v;
        saveMulligans();
        render();
      }; }
      if(action==='admin-set-score'){ el.onclick=()=>{
        const roundId = state.adminRoundId || autoRoundId();
        setScore(roundId, state.adminHole, el.dataset.player, parseInt(el.dataset.val,10), true);
        render();
      }; }
      if(action==='admin-erase-score'){ el.onclick=()=>{
        const roundId = state.adminRoundId || autoRoundId();
        if(!confirm(`Erase ${el.dataset.player}'s score for hole ${state.adminHole}? This can't be undone.`)) return;
        eraseScore(roundId, state.adminHole, el.dataset.player);
        render();
      }; }
      if(action==='audit-filter-round'){ el.onchange=()=>{ state.auditFilterRound = el.value; render(); }; }
      if(action==='audit-filter-player'){ el.onchange=()=>{ state.auditFilterPlayer = el.value; render(); }; }
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
        const old = state.expenses[idx];
        // This simple editor doesn't support editing custom per-person
        // amounts directly — if the admin changes the total or who's
        // included, a stale custom split would no longer add up correctly,
        // so fall back to an even split rather than silently keeping it.
        let shares = old.shares;
        if(shares){
          const shareNames = Object.keys(shares);
          const sameParticipants = splitAmong.length===shareNames.length && splitAmong.every((p:string)=>shares[p]!=null);
          const sameAmount = Math.abs((old.amount||0)-amount)<0.005;
          if(!sameParticipants || !sameAmount) shares = undefined;
        }
        state.expenses[idx] = {...old, desc, amount, paidBy, splitAmong, shares};
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
      el.onclick = ()=>{
        el.classList.toggle('off');
        if(el.closest('#exp-split')) rebuildExpenseCustomAmounts();
      };
    });
    const expAmountEl = document.getElementById('exp-amount');
    if(expAmountEl) (expAmountEl as any).oninput = updateExpenseRemaining;
  }

  // ---- pull-to-refresh (Home + Leaders only; Score tab has its own
  // fullscreen layout + realtime sync and is explicitly excluded) ----
  let ptrStartY: number|null = null;
  let ptrTriggered = false;
  let ptrRefreshing = false;

  function ptrEligibleTab(){
    return state.tab==='home' || state.tab==='board';
  }
  function showRefreshBanner(){
    let el = document.getElementById('ptr-banner');
    if(!el){
      el = document.createElement('div');
      el.id = 'ptr-banner';
      el.textContent = 'Refreshing…';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100;text-align:center;padding:8px;font-size:12px;font-weight:600;color:#fff;background:var(--navy);transform:translateY(-100%);transition:transform .2s ease;';
      document.body.appendChild(el);
    }
    requestAnimationFrame(()=>{ el!.style.transform='translateY(0)'; });
  }
  function hideRefreshBanner(){
    const el = document.getElementById('ptr-banner');
    if(el) el.style.transform='translateY(-100%)';
  }
  async function doPullRefresh(){
    ptrRefreshing = true;
    showRefreshBanner();
    try{
      if(state.tab==='home'){
        const cfg = await kvGet('trip-config');
        if(cfg){ state.config = cfg; recomputeSession(); }
      } else if(state.tab==='board'){
        const [sc, mu, bv, cfg] = await Promise.all([
          kvGet('scores'), kvGet('mulligans'), kvGet('beaver'), kvGet('trip-config')
        ]);
        if(sc) state.scores = sc;
        if(mu) state.mulligans = mu;
        if(bv) state.beaver = bv;
        if(cfg){ state.config = cfg; recomputeSession(); }
      }
      render();
    } finally {
      setTimeout(()=>{ hideRefreshBanner(); ptrRefreshing = false; }, 400);
    }
  }
  window.addEventListener('touchstart', (e:TouchEvent)=>{
    if(!ptrEligibleTab() || ptrRefreshing || window.scrollY>0){ ptrStartY = null; return; }
    ptrStartY = e.touches[0].clientY;
    ptrTriggered = false;
  }, {passive:true});
  window.addEventListener('touchmove', (e:TouchEvent)=>{
    if(ptrStartY==null || ptrRefreshing || ptrTriggered) return;
    const dy = e.touches[0].clientY - ptrStartY;
    if(dy>0 && window.scrollY<=0){
      e.preventDefault(); // suppress native overscroll/rubber-band while we handle the pull ourselves
      if(dy>70){
        ptrTriggered = true;
        doPullRefresh();
      }
    }
  }, {passive:false});
  window.addEventListener('touchend', ()=>{ ptrStartY = null; }, {passive:true});

  window.addEventListener('beforeunload', (e:any)=>{
    if(state.adminView==='roster' && isRosterDraftDirty()){
      e.preventDefault(); e.returnValue='';
    }
  });

  // No backend cron exists — catch the Friday 5pm lunch-order cutoff for
  // anyone who already has the app open by polling once a minute.
  setInterval(checkLunchCalloutAutoPost, 60000);

  load();
}

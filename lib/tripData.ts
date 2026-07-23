// Static trip data: course/hole info (fixed) and the default roster + group
// assignments (editable at runtime, but these are the starting values).
//
// Three separate handicap-stroke systems are used across the app — see
// strokesForHole() below and the distinctly-named functions in page.tsx that
// call it. They must never be conflated:
//   - Tournament net leaderboard (netStrokesForHole): strokes = handicap -
//     lowest handicap in the whole 12-player field.
//   - Saturday (AM and PM) 2v2 match (matchStrokesForHole): strokes =
//     handicap - lowest handicap within that specific foursome.
//   - Friday best-ball match (fridayBestBallStrokesForHole): strokes =
//     handicap - lowest handicap among just the 7 Friday players.

export type Player = {
  name: string; // short display name, used everywhere in the UI and as the key for scores/mulligans/etc.
  fullName: string;
  email: string;
  handicap: number;
  avatarUrl: string | null;
};

export type RoundGroup = {
  id: string;
  teeTime: string;
  players: string[]; // Player.name values
  teams?: Record<string, 'A' | 'B'>; // only present for rounds with a 2v2 game (Saturday AM and PM) — Friday's best-ball format uses the two groups themselves as its teams instead
};

export type Hole = { n: number; par: number; yds: number };

export type RoundMeta = {
  id: string;
  label: string;
  course: string;
  par: number;
  yards: number;
  holes: Hole[];
  si: number[]; // stroke index per hole, same order as holes
  tee: string;
};

export type TripConfig = {
  roster: Player[];
  rounds: Record<string, RoundGroup[]>;
};

export const ADMIN_EMAILS = ['erik.moyer.88@gmail.com', 'gpoli111@gmail.com'];

export const ROUNDS_META: RoundMeta[] = [
  {
    id: 'fri', label: 'Friday', course: 'Mountain View Country Club', par: 71, yards: 6015,
    holes: [
      { n: 1, par: 4, yds: 392 }, { n: 2, par: 3, yds: 102 }, { n: 3, par: 5, yds: 546 }, { n: 4, par: 4, yds: 343 }, { n: 5, par: 4, yds: 258 },
      { n: 6, par: 3, yds: 180 }, { n: 7, par: 5, yds: 457 }, { n: 8, par: 4, yds: 300 }, { n: 9, par: 3, yds: 131 },
      { n: 10, par: 3, yds: 167 }, { n: 11, par: 4, yds: 300 }, { n: 12, par: 4, yds: 383 }, { n: 13, par: 5, yds: 582 }, { n: 14, par: 4, yds: 356 },
      { n: 15, par: 5, yds: 532 }, { n: 16, par: 3, yds: 151 }, { n: 17, par: 4, yds: 449 }, { n: 18, par: 4, yds: 386 },
    ],
    si: [4, 18, 2, 8, 16, 10, 6, 12, 14, 17, 11, 5, 1, 13, 7, 15, 9, 3],
    tee: 'White',
  },
  {
    id: 'satam', label: 'Saturday AM', course: 'PSU White Course', par: 72, yards: 6130,
    holes: [
      { n: 1, par: 4, yds: 383 }, { n: 2, par: 4, yds: 355 }, { n: 3, par: 5, yds: 532 }, { n: 4, par: 4, yds: 330 }, { n: 5, par: 3, yds: 153 },
      { n: 6, par: 5, yds: 498 }, { n: 7, par: 3, yds: 167 }, { n: 8, par: 4, yds: 350 }, { n: 9, par: 4, yds: 353 },
      { n: 10, par: 5, yds: 464 }, { n: 11, par: 4, yds: 353 }, { n: 12, par: 3, yds: 166 }, { n: 13, par: 5, yds: 577 }, { n: 14, par: 3, yds: 181 },
      { n: 15, par: 4, yds: 315 }, { n: 16, par: 3, yds: 165 }, { n: 17, par: 4, yds: 307 }, { n: 18, par: 5, yds: 481 },
    ],
    si: [9, 5, 1, 13, 17, 3, 15, 11, 7, 8, 4, 16, 2, 18, 10, 14, 12, 6],
    tee: 'White',
  },
  {
    id: 'satpm', label: 'Saturday PM', course: 'PSU Blue Course', par: 72, yards: 6329,
    holes: [
      { n: 1, par: 4, yds: 360 }, { n: 2, par: 4, yds: 364 }, { n: 3, par: 4, yds: 387 }, { n: 4, par: 3, yds: 182 }, { n: 5, par: 5, yds: 499 },
      { n: 6, par: 4, yds: 383 }, { n: 7, par: 4, yds: 400 }, { n: 8, par: 3, yds: 161 }, { n: 9, par: 5, yds: 507 },
      { n: 10, par: 4, yds: 383 }, { n: 11, par: 4, yds: 310 }, { n: 12, par: 5, yds: 570 }, { n: 13, par: 4, yds: 358 }, { n: 14, par: 3, yds: 142 },
      { n: 15, par: 4, yds: 325 }, { n: 16, par: 4, yds: 385 }, { n: 17, par: 3, yds: 167 }, { n: 18, par: 5, yds: 446 },
    ],
    si: [9, 7, 1, 15, 13, 5, 3, 17, 11, 6, 16, 2, 8, 14, 12, 4, 18, 10],
    tee: 'White',
  },
];

export const DEFAULT_ROSTER: Player[] = [
  { name: 'Erik', fullName: 'Erik Moyer', email: 'erik.moyer.88@gmail.com', handicap: 12, avatarUrl: null },
  { name: 'Alex', fullName: 'Alex Moyer', email: 'adm5087@gmail.com', handicap: 20, avatarUrl: null },
  { name: 'Dan', fullName: 'Dan Kurtz', email: 'dsk313@gmail.com', handicap: 18, avatarUrl: null },
  { name: 'Greg', fullName: 'Greg Poli', email: 'gpoli111@gmail.com', handicap: 9, avatarUrl: null },
  { name: 'Jeff', fullName: 'Jeff Schmuckler', email: 'jeff.schmuckler@gmail.com', handicap: 28, avatarUrl: null },
  { name: 'Chilla', fullName: 'Chris Chilla', email: 'cac5153@gmail.com', handicap: 19, avatarUrl: null },
  { name: 'Stein', fullName: 'Chris Stein', email: 'cwstein21@gmail.com', handicap: 27, avatarUrl: null },
  { name: 'Ken', fullName: 'Ken Marone', email: 'kenmarone1187@gmail.com', handicap: 19, avatarUrl: null },
  { name: 'Corey', fullName: 'Corey Robinson', email: 'csrobinson@herbein.com', handicap: 16, avatarUrl: null },
  { name: 'Ryan', fullName: 'Ryan Krall', email: 'rakrall@herbein.com', handicap: 12, avatarUrl: null },
  { name: 'Shaun', fullName: 'Shaun Spence', email: 'spence24527@gmail.com', handicap: 26, avatarUrl: null },
  { name: 'Ben', fullName: 'Ben Ellert', email: 'bme5021@gmail.com', handicap: 20, avatarUrl: null },
];

export const DEFAULT_ROUND_GROUPS: Record<string, RoundGroup[]> = {
  fri: [
    { id: 'fri-g1', teeTime: '1:18 PM', players: ['Chilla', 'Erik', 'Jeff', 'Shaun'] },
    { id: 'fri-g2', teeTime: '1:27 PM', players: ['Greg', 'Alex', 'Stein'] },
  ],
  satam: [
    { id: 'satam-g1', teeTime: '8:20 AM', players: ['Greg', 'Chilla', 'Ken', 'Erik'], teams: { Greg: 'A', Ken: 'A', Chilla: 'B', Erik: 'B' } },
    { id: 'satam-g2', teeTime: '8:30 AM', players: ['Alex', 'Ryan', 'Dan', 'Jeff'], teams: { Alex: 'A', Dan: 'A', Ryan: 'B', Jeff: 'B' } },
    { id: 'satam-g3', teeTime: '8:40 AM', players: ['Stein', 'Shaun', 'Ben', 'Corey'], teams: { Stein: 'A', Corey: 'A', Shaun: 'B', Ben: 'B' } },
  ],
  satpm: [
    { id: 'satpm-g1', teeTime: '1:35 PM', players: ['Greg', 'Dan', 'Chilla', 'Ben'], teams: { Greg: 'A', Dan: 'A', Chilla: 'B', Ben: 'B' } },
    { id: 'satpm-g2', teeTime: '1:45 PM', players: ['Erik', 'Alex', 'Ryan', 'Corey'], teams: { Erik: 'A', Alex: 'A', Ryan: 'B', Corey: 'B' } },
    { id: 'satpm-g3', teeTime: '1:55 PM', players: ['Jeff', 'Stein', 'Shaun', 'Ken'], teams: { Jeff: 'A', Stein: 'A', Shaun: 'B', Ken: 'B' } },
  ],
};

export const DEFAULT_CONFIG: TripConfig = {
  roster: DEFAULT_ROSTER,
  rounds: DEFAULT_ROUND_GROUPS,
};

// Standard stroke-index allocation: give a stroke on every hole whose SI is
// <= the player's effective handicap, a second stroke once the handicap
// clears 18 + that hole's SI. `handicap` here is already the EFFECTIVE
// handicap (i.e. already offset by whichever "low player plays scratch"
// baseline applies — tournament-wide or per-foursome, see callers).
export function strokesForHole(effectiveHandicap: number, si: number): number {
  const h = effectiveHandicap || 0;
  let s = 0;
  if (h >= si) s = 1;
  if (h >= 18 + si) s = 2;
  return s;
}

// The lowest handicap among a set of players — the baseline that "plays
// scratch" for whichever stroke system is calling this (tournament field or
// a single foursome, depending on what's passed in).
export function lowHandicapAmong(players: Player[]): number {
  if (!players.length) return 0;
  return Math.min(...players.map((p) => p.handicap || 0));
}

// "EM" from "Erik Moyer", "E" from "Erik". Used only as a defensive fallback
// when a player has no avatar photo yet.
export function initialsFor(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

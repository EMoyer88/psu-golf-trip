// All trip trash-talk / personality copy lives here in one place, so new
// lines can be dropped in later without hunting through render code.
// Tasteful ribbing only — nothing genuinely mean, this is a screen people
// glance at during the round.

// Personal joke banks, keyed by each player's short display name (must match
// Player.name in lib/tripData.ts). Erik, Alex, and Ken intentionally have no
// entries yet — more lines (for them and others) will be added later.
export const PLAYER_LINES: Record<string, string[]> = {
  Jeff: [
    "Somewhere, Jeff just said \"ah nuts.\" Statistically likely.",
    "Hey fella, that swing needs some work.",
    "Jeff's getting 19 strokes today and still finding ways to need more.",
  ],
  Greg: [
    "Greg's already picking out his Tour card font.",
    "Careful — Q-School called, they want their scores back.",
    "Greg treats a Saturday scramble like the back nine at Augusta.",
  ],
  Corey: [
    "Corey's 3-wood is having an off day. RIP Corey's round.",
    "If the 3-wood's not working, Corey's playing with a putter and a prayer.",
  ],
  Dan: [
    "Dan, the blazer stays in the car, this is a public course.",
    "Someone tell Dan there's no member's-only grill at the turn here.",
  ],
  Ben: [
    "Ben spent years in scarlet and gray. We forgive. We don't forget.",
    "Ben would rather be doing donuts in the minivan than three-putting this green.",
  ],
  Chilla: [
    "Chilla was probably at a stranger's apartment playing beer pong at 2am. Swinging fine anyway.",
    "Reminder: Chilla once lost his glasses and birdied half the back nine. Someone hide his glasses again.",
  ],
  Shaun: [
    "Shaun's out here debugging his swing like a server outage.",
    "Shaun should stick to what he's good at — pouring a beer, not hitting one.",
  ],
  Stein: [
    "Wait, who invited this guy again?",
    "New guy Stein, still working on a trip nickname.",
  ],
  Ryan: [
    "Ryan should be running a spreadsheet instead of a scorecard.",
    "Ryan's from Alabama — we'll allow one Roll Tide-fueled shank per round.",
  ],
};

// Generic Saturday 2v2 match-status commentary, keyed by situation. A
// player-specific line (above) gets blended into the same random pool when
// one of the relevant players (trailing/leading team, as applicable) has one.
export const MATCH_COMMENTARY = {
  trailingBig: [
    "Might want to start the beer cart early on this one.",
    "This match is deader than someone's short game.",
    "Time to start workshopping your excuses for the clubhouse.",
  ],
  trailingSmall: [
    "Still time to turn this around. Probably not, but sure.",
    "Down, but mostly fine about it.",
  ],
  allSquare: [
    "Anyone's match. Choke count: TBD.",
    "Tighter than a nervous backswing.",
  ],
  leadChanged: [
    "And the tables have turned — comeback nobody saw coming, including them.",
  ],
  clinched: [
    "It's over. Losing team, see you at the 19th hole — you're buying.",
  ],
};

// Fixed italic subtitles shown under each leaderboard section header.
export const LEADERBOARD_FLAVOR = {
  gross: "Raw, unfiltered, no excuses.",
  net: "Where handicaps go to work miracles.",
  birdies: "The best of the best (and a few lucky ones).",
  mullies: "Hall of shame.",
};

// Empty-state copy.
export const EMPTY_STATES = {
  mullies: "Nobody's shotgunned anything yet. Cowards.",
  leaderboard: "No scores yet. Suspicious.",
};

export const LAST_PLACE_LABEL = "Bringing up the rear";

// Picks one random line from the generic pool for `category`, blended with
// any personal lines belonging to `relevantPlayers` who have a joke bank.
export function pickMatchCommentary(category: keyof typeof MATCH_COMMENTARY, relevantPlayers: string[]): string {
  const pool: string[] = [...MATCH_COMMENTARY[category]];
  relevantPlayers.forEach((name) => {
    const lines = PLAYER_LINES[name];
    if (lines && lines.length) pool.push(...lines);
  });
  if (!pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

// One random personal line for a single player, or null if they have none yet.
export function pickPlayerLine(name: string): string | null {
  const lines = PLAYER_LINES[name];
  if (!lines || !lines.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

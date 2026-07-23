// All trip trash-talk / personality copy lives here in one place, so new
// lines can be dropped in later without hunting through render code.
// Tasteful ribbing only — nothing genuinely mean, this is a screen people
// glance at during the round.

// Personal joke banks, keyed by each player's short display name (must match
// Player.name in lib/tripData.ts). Ken intentionally has no entries yet —
// more lines (for him and others) may be added later.
//
// Erik's lines lean on appearance jokes on purpose — that's specific to Erik
// only. Don't reuse that style of joke for any other player.
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
  Alex: [
    "Today's not a golf day for you, Alex — maybe more of a vibes guy today, pal.",
    "Alex, your kids miss you. Also your swing right now.",
    "3 kids at home and Alex chose this. Bold.",
    "Some days Alex shows up. Today Alex showed up to vibe.",
  ],
  Erik: [
    "Erik's about to explain his \"strategy\" after a triple bogey.",
    "Confidence: 10/10. Handicap: also basically 10/10 too high for that confidence.",
    "Somewhere, Erik is convinced this is the round he \"figures it out.\"",
    "Erik plays like he's got a scratch handicap and a YouTube swing tutorial. Neither is working today.",
    "Erik's swing isn't the only rough thing about him.",
    "That's a bogey and, frankly, a face only a mother could love.",
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

// ---- automatic feed posts triggered by live scoring events ----
// Everything about the "⛳ Live Update" system-authored posts — which
// triggers are on, the point thresholds, and the message wording — lives
// here so any of it can be tweaked later without touching the trigger
// logic in app/page.tsx. Saturday (AM + PM) only; Friday is intentionally
// excluded from all of these in this batch.
export const AUTO_POST_CONFIG = {
  authorName: '⛳ Live Update',
  enabled: {
    birdie: true,
    eagle: true,
    matchClinched: true,
    bigLeadMilestone: true,
    lunchCallout: true,
    blowupHole: true,
  },
  // Lead (in holes) a team must reach for the "pulling away" milestone —
  // fires once per match, the first time a lead reaches this size.
  bigLeadThreshold: 3,
  // A hole score this many-or-more strokes over par counts as a "blow up"
  // (a quad bogey is exactly +4) — see checkBirdieEagleAutoPost().
  blowupThreshold: 4,
  templates: {
    birdie: (player: string, hole: number) => `🐦 ${player} birdies hole ${hole}!`,
    eagle: (player: string, hole: number) => `🦅 ${player} EAGLE on hole ${hole}!!`,
    blowupHole: (player: string, hole: number, overPar: number) => `💥 ${player} implodes on hole ${hole} (+${overPar}).`,
    matchClinched: (winningTeam: string, losingTeam: string, margin: number, holesRemaining: number) =>
      holesRemaining > 0
        ? `🏆 ${winningTeam} close it out, ${margin} and ${holesRemaining} over ${losingTeam}.`
        : `🏆 ${winningTeam} close it out, ${margin} UP over ${losingTeam}.`,
    bigLeadMilestone: (leadingTeam: string, trailingTeam: string, margin: number) =>
      `📈 ${leadingTeam} pulling away, now ${margin} UP on ${trailingTeam}.`,
    // Friday 5pm lunch-order cutoff callout — one or the other, never both.
    lunchCalloutMissing: (names: string[]) => {
      const list = names.length===1 ? names[0]
        : names.slice(0,-1).join(', ') + ', and ' + names[names.length-1];
      return `🌭 Lunch orders are closed. ${list} apparently don't eat. Enjoy watching everyone else at 12:30.`;
    },
    lunchCalloutAllIn: () => `🌭 Lunch orders closed — everyone's in. Miracle.`,
  },
};

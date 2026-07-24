// All trip trash-talk / personality copy lives here in one place, so new
// lines can be dropped in later without hunting through render code.
// Tasteful ribbing only — nothing genuinely mean, this is a screen people
// glance at during the round.
//
// Player-specific insult lines are NOT stored here — there is exactly one
// source for those in the whole app: the admin-editable "Quad Bogey
// Insults" tool (state.customQuadBogeyLines in app/page.tsx, seeded once
// from lib/tripData.ts's DEFAULT_CUSTOM_QUAD_BOGEY_LINES). Only
// non-player-specific, generic commentary pools live in this file.

// Generic Saturday 2v2 match-status commentary, keyed by situation. A
// player-specific line from the single admin-editable source gets blended
// into the same random pool when relevant (Score page only — see
// pickMatchCommentaryLine() in app/page.tsx; the Leaders page never blends
// personal lines in).
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

// ---- automatic feed posts triggered by live scoring events ----
// Everything about the "⛳ Live Update" system-authored posts — which
// triggers are on, the point thresholds, and the message wording — lives
// here so any of it can be tweaked later without touching the trigger
// logic in app/page.tsx. birdie/eagle/matchClinched/bigLeadMilestone are
// Saturday (AM + PM) only, scoped to the tournament leaderboard/2v2 match
// play that don't exist on Friday. blowupHole has no such scope and fires
// on every round, Friday included — see checkBirdieEagleAutoPost().
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
    // Quad-bogey-or-worse feed post is two parts: a fixed-format header
    // (no player name — just the event/hole/number) rendered as a
    // visually highlighted line, followed by a body line that's either
    // the player's own admin-editable insult or, if they have none, this
    // plain named fallback (see checkBirdieEagleAutoPost()).
    blowupHoleHeader: (hole: number, overPar: number) => `💥 BLOWUP HOLE — Hole ${hole} (+${overPar}) 💥`,
    blowupHoleFallback: (player: string) => `${player} takes a beating out there.`,
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

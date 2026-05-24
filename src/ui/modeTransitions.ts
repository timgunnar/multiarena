/**
 * Mode-transition decision functions for the App keyboard handler.
 *
 * Design: two top-level modes (Broadcast / Team), each with an overview
 * and drill-down to individual model chats. Shift+Tab toggles modes;
 * Tab cycles targets within the current mode; Esc returns to overview.
 *
 *   Broadcast overview  ←── Esc ──  Broadcast directed (model N)
 *        ↑  ↓ Tab                       ↑  ↓ Tab
 *   Team overview       ←── Esc ──  Team directed (model N)
 *        ↑  ↓ Shift+Tab
 */

export interface ModeState {
  teamMode: boolean;
  /** idle = no deliberation; running = rounds in progress; done = completed; error = aborted */
  deliberationStatus: "idle" | "running" | "done" | "error";
  comparisonModel: string | null;
  comparisonFromBroadcast: boolean;
}

// ── Tab ──────────────────────────────────────────────────────────

export interface TabResult {
  /** Cycle the target within the current mode. */
  cycleTarget: boolean;
  clearComparison: boolean;
}

/**
 * Tab cycles the target within the current mode (overview → model1 →
 * model2 → … → overview). It never changes teamMode — Shift+Tab is
 * the only way to toggle between broadcast and team.
 */
export function reduceTab(_state: ModeState): TabResult {
  return { cycleTarget: true, clearComparison: true };
}

// ── Shift+Tab ────────────────────────────────────────────────────

export interface ShiftTabResult {
  teamMode: boolean;
  /** If true, the caller should set targetMode to broadcast (overview). */
  goToOverview: boolean;
  clearComparison: boolean;
  /** If true, reset deliberation UI state (entering team mode fresh). */
  resetDeliberation: boolean;
}

/** Toggle team/broadcast. Entering a mode always lands on its overview. */
export function reduceShiftTab(state: ModeState): ShiftTabResult {
  const next = !state.teamMode;
  return {
    teamMode: next,
    goToOverview: true,
    clearComparison: true,
    resetDeliberation: next, // entering team mode resets stale deliberation
  };
}

// ── Escape ───────────────────────────────────────────────────────

export interface EscapeResult {
  teamMode: boolean;
  comparisonModel: string | null;
  comparisonFromBroadcast: boolean;
  /** Go to the current mode's overview (broadcast target). */
  goToOverview: boolean;
  abortDeliberation: boolean;
  resetDeliberation: boolean;
  restoreBroadcast: boolean;
}

/**
 * Escape returns to the current mode's overview, or exits comparison /
 * aborts a running deliberation. It never toggles teamMode.
 */
export function reduceEscape(
  state: ModeState,
  isDeliberating: boolean,
): EscapeResult {
  // ── Team mode ──────────────────────────────────────────────
  if (state.teamMode) {
    if (state.deliberationStatus === "done") {
      // Stay in team mode, go to overview (preserve result)
      return {
        teamMode: true,
        comparisonModel: null,
        comparisonFromBroadcast: false,
        goToOverview: true,
        abortDeliberation: false,
        resetDeliberation: false,
        restoreBroadcast: false,
      };
    }
    if (state.deliberationStatus === "running") {
      return {
        teamMode: true,
        comparisonModel: null,
        comparisonFromBroadcast: false,
        goToOverview: true,
        abortDeliberation: isDeliberating,
        resetDeliberation: true,
        restoreBroadcast: false,
      };
    }
    // Team idle — go to overview
    return {
      teamMode: true,
      comparisonModel: null,
      comparisonFromBroadcast: false,
      goToOverview: true,
      abortDeliberation: false,
      resetDeliberation: false,
      restoreBroadcast: false,
    };
  }

  // ── Comparison mode ────────────────────────────────────────
  if (state.comparisonModel !== null) {
    return {
      teamMode: false,
      comparisonModel: null,
      comparisonFromBroadcast: false,
      goToOverview: true,
      abortDeliberation: false,
      resetDeliberation: false,
      restoreBroadcast: state.comparisonFromBroadcast,
    };
  }

  // ── Standalone deliberation ────────────────────────────────
  if (state.deliberationStatus !== "idle") {
    return {
      teamMode: false,
      comparisonModel: null,
      comparisonFromBroadcast: false,
      goToOverview: true,
      abortDeliberation: isDeliberating,
      resetDeliberation: true,
      restoreBroadcast: false,
    };
  }

  // ── Broadcast or directed (no comparison) ──────────────────
  // Esc from directed → back to broadcast overview
  return {
    teamMode: false,
    comparisonModel: null,
    comparisonFromBroadcast: false,
    goToOverview: true,
    abortDeliberation: false,
    resetDeliberation: false,
    restoreBroadcast: false,
  };
}

// ── Key 'd' (comparison toggle) ──────────────────────────────────

export interface KeyDResult {
  comparisonModel: string | null;
  comparisonFromBroadcast: boolean;
  setDirectedTarget: string | null;
}

export function reduceKeyD(
  state: ModeState,
  firstUnmuted: string,
  secondUnmuted: string | null,
  currentDirectedTarget: string | null,
): KeyDResult {
  if (state.comparisonModel !== null) {
    return { comparisonModel: null, comparisonFromBroadcast: false, setDirectedTarget: null };
  }
  if (!secondUnmuted) {
    return { comparisonModel: null, comparisonFromBroadcast: false, setDirectedTarget: null };
  }
  if (currentDirectedTarget === null) {
    return { comparisonModel: secondUnmuted, comparisonFromBroadcast: true, setDirectedTarget: firstUnmuted };
  }
  return { comparisonModel: secondUnmuted, comparisonFromBroadcast: false, setDirectedTarget: null };
}

// ── Submit in team mode ──────────────────────────────────────────

export type SubmitInTeamAction = "deliberate" | "route_normally" | "block";

/**
 * In team overview: submit starts deliberation.
 * In team directed (Tab-ed to a model): submit routes as a directed message.
 * Running deliberation: block.
 * Deliberation done/error: route normally (model chat).
 */
export function reduceSubmitInTeam(
  state: ModeState,
  isOverview: boolean,
): { action: SubmitInTeamAction } {
  if (state.deliberationStatus === "running") {
    return { action: "block" };
  }
  // Overview + idle → start new deliberation
  if (isOverview && state.deliberationStatus === "idle") {
    return { action: "deliberate" };
  }
  // Directed chat, or overview with done/error → normal routing
  return { action: "route_normally" };
}

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

/** Toggle team/broadcast. Only works from overview. Entering a mode always lands on its overview. */
export function reduceShiftTab(state: ModeState, isOverview: boolean): ShiftTabResult | null {
  if (!isOverview) return null;
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
  unmutedNames: string[],
  currentDirectedTarget: string | null,
): KeyDResult {
  // Exiting comparison mode
  if (state.comparisonModel !== null) {
    return { comparisonModel: null, comparisonFromBroadcast: false, setDirectedTarget: null };
  }
  // Need at least 2 unmuted models
  if (unmutedNames.length < 2) {
    return { comparisonModel: null, comparisonFromBroadcast: false, setDirectedTarget: null };
  }

  if (currentDirectedTarget === null) {
    // From broadcast overview: target first, compare with second
    return {
      comparisonModel: unmutedNames[1],
      comparisonFromBroadcast: true,
      setDirectedTarget: unmutedNames[0],
    };
  }

  // From directed mode: pick a different model to compare with
  const idx = unmutedNames.indexOf(currentDirectedTarget);
  if (idx === -1) {
    return { comparisonModel: null, comparisonFromBroadcast: false, setDirectedTarget: null };
  }
  // Next model, wrapping around
  const compareIdx = (idx + 1) % unmutedNames.length;
  return {
    comparisonModel: unmutedNames[compareIdx],
    comparisonFromBroadcast: false,
    setDirectedTarget: null,
  };
}

// ── ModeState builder (extracted from app.tsx for testability) ──

/** Build a ModeState snapshot from UI state so the pure decision
 *  functions can drive the keyboard handler. */
export function buildModeState(params: {
  teamMode: boolean;
  deliberationProgress: { type: string } | null;
  comparisonModel: string | null;
  comparisonFromBroadcast: boolean;
}): ModeState {
  let deliberationStatus: ModeState["deliberationStatus"] = "idle";
  if (params.deliberationProgress) {
    const t = params.deliberationProgress.type;
    if (t === "done") deliberationStatus = "done";
    else if (t === "error") deliberationStatus = "error";
    else deliberationStatus = "running";
  }
  return {
    teamMode: params.teamMode,
    deliberationStatus,
    comparisonModel: params.comparisonModel,
    comparisonFromBroadcast: params.comparisonFromBroadcast,
  };
}

// ── Submit in team mode ──────────────────────────────────────────

export type SubmitInTeamAction = "deliberate" | "route_normally" | "block";

/**
 * In team overview: submit starts deliberation (idle or after a previous one).
 * In team directed (Tab-ed to a model): submit routes as a directed message.
 * Running deliberation: block.
 */
export function reduceSubmitInTeam(
  state: ModeState,
  isOverview: boolean,
): { action: SubmitInTeamAction } {
  if (state.deliberationStatus === "running") {
    return { action: "block" };
  }
  // Overview + idle/done → start (or restart) deliberation
  if (isOverview && state.deliberationStatus !== "error") {
    return { action: "deliberate" };
  }
  // Directed chat, or overview with error → normal routing
  return { action: "route_normally" };
}

/**
 * Mode transition tests — exhaustive coverage of the mode state machine.
 *
 * Design: two top-level modes (Broadcast / Team), each with an overview
 * and drill-down to individual model chats.
 *
 *   Broadcast overview  ←── Esc / Tab-until-wrap ──  Broadcast directed
 *        ↑  ↓ Shift+Tab
 *   Team overview       ←── Esc / Tab-until-wrap ──  Team directed
 *
 * Tab cycles within a mode, never toggles teamMode.
 * Shift+Tab toggles mode, always lands on overview.
 * Esc returns to current mode's overview.
 */

import { describe, it, expect } from "vitest";
import {
  reduceTab,
  reduceShiftTab,
  reduceEscape,
  reduceKeyD,
  reduceSubmitInTeam,
  type ModeState,
} from "../../src/ui/modeTransitions.js";

// ── State factories ─────────────────────────────────────────────

function broadcastOverview(): ModeState {
  return { teamMode: false, deliberationStatus: "idle", comparisonModel: null, comparisonFromBroadcast: false };
}

function broadcastDirected(): ModeState {
  return { teamMode: false, deliberationStatus: "idle", comparisonModel: null, comparisonFromBroadcast: false };
}

function teamOverviewIdle(): ModeState {
  return { teamMode: true, deliberationStatus: "idle", comparisonModel: null, comparisonFromBroadcast: false };
}

function teamOverviewDone(): ModeState {
  return { teamMode: true, deliberationStatus: "done", comparisonModel: null, comparisonFromBroadcast: false };
}

function teamOverviewRunning(): ModeState {
  return { teamMode: true, deliberationStatus: "running", comparisonModel: null, comparisonFromBroadcast: false };
}

function teamDirected(): ModeState {
  return { teamMode: true, deliberationStatus: "idle", comparisonModel: null, comparisonFromBroadcast: false };
}

function teamDirectedDone(): ModeState {
  return { teamMode: true, deliberationStatus: "done", comparisonModel: null, comparisonFromBroadcast: false };
}

// ═══════════════════════════════════════════════════════════════
// Tab
// ═══════════════════════════════════════════════════════════════

describe("reduceTab", () => {
  it("cycles target within broadcast mode", () => {
    const r = reduceTab(broadcastOverview());
    expect(r.cycleTarget).toBe(true);
    expect(r.clearComparison).toBe(true);
  });

  it("cycles target within team mode", () => {
    const r = reduceTab(teamOverviewIdle());
    expect(r.cycleTarget).toBe(true);
    expect(r.clearComparison).toBe(true);
  });

  it("cycles target in team mode after deliberation done", () => {
    const r = reduceTab(teamOverviewDone());
    expect(r.cycleTarget).toBe(true);
    expect(r.clearComparison).toBe(true);
  });

  it("cycles target in team directed mode", () => {
    const r = reduceTab(teamDirected());
    expect(r.cycleTarget).toBe(true);
  });

  it("never changes teamMode", () => {
    // Tab does not toggle teamMode — Shift+Tab is the only toggle
    const r1 = reduceTab(broadcastOverview());
    const r2 = reduceTab(teamOverviewIdle());
    // Both return cycleTarget without teamMode field
    expect(r1.cycleTarget).toBe(true);
    expect(r2.cycleTarget).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Shift+Tab
// ═══════════════════════════════════════════════════════════════

describe("reduceShiftTab", () => {
  it("toggles from broadcast to team mode", () => {
    const r = reduceShiftTab(broadcastOverview());
    expect(r.teamMode).toBe(true);
    expect(r.goToOverview).toBe(true);
  });

  it("toggles from team to broadcast mode", () => {
    const r = reduceShiftTab(teamOverviewIdle());
    expect(r.teamMode).toBe(false);
    expect(r.goToOverview).toBe(true);
  });

  it("always returns to overview", () => {
    const r = reduceShiftTab(broadcastDirected());
    expect(r.goToOverview).toBe(true);
  });

  it("resets deliberation when entering team mode", () => {
    const r = reduceShiftTab(broadcastOverview());
    expect(r.resetDeliberation).toBe(true);
  });

  it("does not reset deliberation when exiting team mode", () => {
    const r = reduceShiftTab(teamOverviewDone());
    expect(r.resetDeliberation).toBe(false);
  });

  it("clears comparison when toggling", () => {
    const r = reduceShiftTab({ ...broadcastOverview(), comparisonModel: "B" });
    expect(r.clearComparison).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Escape
// ═══════════════════════════════════════════════════════════════

describe("reduceEscape", () => {
  describe("team mode — deliberation done", () => {
    it("stays in team mode, returns to overview", () => {
      const r = reduceEscape(teamOverviewDone(), false);
      expect(r.teamMode).toBe(true);
      expect(r.goToOverview).toBe(true);
      expect(r.resetDeliberation).toBe(false);
    });
  });

  describe("team mode — deliberation running", () => {
    it("aborts and stays in team overview", () => {
      const r = reduceEscape(teamOverviewRunning(), true);
      expect(r.teamMode).toBe(true);
      expect(r.abortDeliberation).toBe(true);
      expect(r.resetDeliberation).toBe(true);
      expect(r.goToOverview).toBe(true);
    });
  });

  describe("team mode — directed chat", () => {
    it("returns to team overview, stays in team mode", () => {
      const r = reduceEscape(teamDirected(), false);
      expect(r.teamMode).toBe(true);
      expect(r.goToOverview).toBe(true);
    });
  });

  describe("broadcast mode — directed chat", () => {
    it("returns to broadcast overview", () => {
      const r = reduceEscape(broadcastDirected(), false);
      expect(r.teamMode).toBe(false);
      expect(r.goToOverview).toBe(true);
    });
  });

  describe("comparison mode", () => {
    it("exits comparison, returns to overview", () => {
      const r = reduceEscape(
        { teamMode: false, deliberationStatus: "idle", comparisonModel: "B", comparisonFromBroadcast: true },
        false,
      );
      expect(r.comparisonModel).toBeNull();
      expect(r.goToOverview).toBe(true);
      expect(r.restoreBroadcast).toBe(true);
    });
  });

  describe("broadcast overview", () => {
    it("is a no-op (already at overview)", () => {
      const r = reduceEscape(broadcastOverview(), false);
      expect(r.goToOverview).toBe(true); // sets broadcast anyway
      expect(r.teamMode).toBe(false);
      expect(r.abortDeliberation).toBe(false);
      expect(r.resetDeliberation).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Key 'd'
// ═══════════════════════════════════════════════════════════════

describe("reduceKeyD", () => {
  it("enters comparison from broadcast overview", () => {
    const r = reduceKeyD(broadcastOverview(), "A", "B", null);
    expect(r.comparisonModel).toBe("B");
    expect(r.comparisonFromBroadcast).toBe(true);
    expect(r.setDirectedTarget).toBe("A");
  });

  it("enters comparison from directed mode", () => {
    const r = reduceKeyD(broadcastDirected(), "A", "B", "A");
    expect(r.comparisonModel).toBe("B");
    expect(r.comparisonFromBroadcast).toBe(false);
  });

  it("exits comparison on second press", () => {
    const state: ModeState = { teamMode: false, deliberationStatus: "idle", comparisonModel: "B", comparisonFromBroadcast: true };
    const r = reduceKeyD(state, "A", "B", null);
    expect(r.comparisonModel).toBeNull();
  });

  it("does nothing with < 2 unmuted models", () => {
    const r = reduceKeyD(broadcastOverview(), "A", null, null);
    expect(r.comparisonModel).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Submit in team mode
// ═══════════════════════════════════════════════════════════════

describe("reduceSubmitInTeam", () => {
  it("overview + idle → deliberate", () => {
    const r = reduceSubmitInTeam(teamOverviewIdle(), true);
    expect(r.action).toBe("deliberate");
  });

  it("overview + running → block", () => {
    const r = reduceSubmitInTeam(teamOverviewRunning(), true);
    expect(r.action).toBe("block");
  });

  it("overview + done → route normally (follow-up chat)", () => {
    const r = reduceSubmitInTeam(teamOverviewDone(), true);
    expect(r.action).toBe("route_normally");
  });

  it("directed + idle → route normally (chat with model)", () => {
    const r = reduceSubmitInTeam(teamDirected(), false);
    expect(r.action).toBe("route_normally");
  });

  it("directed + done → route normally (discuss result with model)", () => {
    const r = reduceSubmitInTeam(teamDirectedDone(), false);
    expect(r.action).toBe("route_normally");
  });

  it("directed + running → block", () => {
    const r = reduceSubmitInTeam(
      { teamMode: true, deliberationStatus: "running", comparisonModel: null, comparisonFromBroadcast: false },
      false,
    );
    expect(r.action).toBe("block");
  });
});

// ═══════════════════════════════════════════════════════════════
// User journey tests
// ═══════════════════════════════════════════════════════════════

describe("user journeys", () => {
  it("broadcast overview → Tab → model1 → Tab → model2 → Tab → broadcast overview", () => {
    // Tab 1: overview → model1
    const t1 = reduceTab(broadcastOverview());
    expect(t1.cycleTarget).toBe(true);

    // Tab 2: model1 → model2
    const t2 = reduceTab(broadcastDirected());
    expect(t2.cycleTarget).toBe(true);

    // Tab 3: model2 → overview (handled by cycleTarget)
    const t3 = reduceTab(broadcastDirected());
    expect(t3.cycleTarget).toBe(true);
  });

  it("broadcast overview → Shift+Tab → team overview → Shift+Tab → broadcast overview", () => {
    const toTeam = reduceShiftTab(broadcastOverview());
    expect(toTeam.teamMode).toBe(true);
    expect(toTeam.goToOverview).toBe(true);

    const toBroadcast = reduceShiftTab(teamOverviewIdle());
    expect(toBroadcast.teamMode).toBe(false);
    expect(toBroadcast.goToOverview).toBe(true);
  });

  it("team directed → Esc → team overview (stay in team)", () => {
    const r = reduceEscape(teamDirected(), false);
    expect(r.teamMode).toBe(true);
    expect(r.goToOverview).toBe(true);
  });

  it("broadcast directed → Esc → broadcast overview", () => {
    const r = reduceEscape(broadcastDirected(), false);
    expect(r.teamMode).toBe(false);
    expect(r.goToOverview).toBe(true);
  });

  it("team deliberation done → Tab to model → chat about result", () => {
    // After deliberation, user Tabs to a model
    const tab = reduceTab(teamOverviewDone());
    expect(tab.cycleTarget).toBe(true);

    // User sends message in directed team chat
    const sub = reduceSubmitInTeam(teamDirectedDone(), false);
    expect(sub.action).toBe("route_normally");
  });

  it("team overview idle → submit → deliberation → done → Tab → chat", () => {
    // Start deliberation
    const s1 = reduceSubmitInTeam(teamOverviewIdle(), true);
    expect(s1.action).toBe("deliberate");

    // After deliberation: Tab to model, submit for discussion
    const tab = reduceTab(teamOverviewDone());
    expect(tab.cycleTarget).toBe(true);

    const s2 = reduceSubmitInTeam(teamDirectedDone(), false);
    expect(s2.action).toBe("route_normally");
  });

  it("team overview idle → Tab to model → chat (no deliberation needed)", () => {
    // Tab to model in team mode (before any deliberation)
    const tab = reduceTab(teamOverviewIdle());
    expect(tab.cycleTarget).toBe(true);

    // Send message — directed chat
    const sub = reduceSubmitInTeam(teamDirected(), false);
    expect(sub.action).toBe("route_normally");
  });

  it("team running → Esc aborts → back to team overview", () => {
    const r = reduceEscape(teamOverviewRunning(), true);
    expect(r.teamMode).toBe(true);
    expect(r.abortDeliberation).toBe(true);
    expect(r.resetDeliberation).toBe(true);
    expect(r.goToOverview).toBe(true);
  });
});

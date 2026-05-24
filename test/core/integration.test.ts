/**
 * Integration tests: cross-module interactions.
 *
 * Tests the flow from user keypress → mode decision → session mutation,
 * simulating full keyboard workflows at the logic level.
 */
import { describe, it, expect } from "vitest";
import { Session } from "../../src/core/session.js";
import { ArenaConfig } from "../../src/config/types.js";
import {
  reduceTab,
  reduceShiftTab,
  reduceEscape,
  reduceKeyD,
  reduceSubmitInTeam,
  buildModeState,
} from "../../src/ui/modeTransitions.js";

function mockConfig(active: string[] = ["claude", "gpt", "minimax"]): ArenaConfig {
  const models: Record<string, any> = {};
  for (const name of active) {
    models[name] = { provider: "openai", model: `mock-${name}` };
  }
  return { models, defaults: { active, broadcast: true } };
}

/** Simulates the React-state → ModeState step in the keyboard handler. */
function snapshot(session: Session, teamMode: boolean, deliberationType: string | null = null, comparisonModel: string | null = null): ReturnType<typeof buildModeState> {
  return buildModeState({
    teamMode,
    deliberationProgress: deliberationType ? { type: deliberationType } as any : null,
    comparisonModel,
    comparisonFromBroadcast: false,
  });
}

describe("Tab cycling integration", () => {
  it("Tab in broadcast: reduceTab → session.cycleTarget", () => {
    const s = new Session(mockConfig(), "/tmp");
    const r = reduceTab(snapshot(s, false));
    expect(r.cycleTarget).toBe(true);

    // cycleTarget rotates: broadcast → claude → gpt → minimax → broadcast
    expect(s.cycleTarget()).toEqual({ type: "directed", modelName: "claude" });
    expect(s.cycleTarget()).toEqual({ type: "directed", modelName: "gpt" });
    expect(s.cycleTarget()).toEqual({ type: "directed", modelName: "minimax" });
    expect(s.cycleTarget()).toEqual({ type: "broadcast" });
  });

  it("Tab in directed: reduceTab → session.cycleTarget clears comparison", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    const r = reduceTab(snapshot(s, false, null, "gpt"));
    expect(r.clearComparison).toBe(true);
  });

  it("Tab never changes teamMode", () => {
    const s = new Session(mockConfig(), "/tmp");
    // In team mode, Tab still only cycles target
    const r = reduceTab(snapshot(s, true));
    expect(r.cycleTarget).toBe(true);
    // The decision function reports cycleTarget, not a teamMode change
    expect((r as any).teamMode).toBeUndefined();
  });
});

describe("Shift+Tab integration", () => {
  it("toggles from broadcast to team via overview", () => {
    const s = new Session(mockConfig(), "/tmp");
    // isOverview = true (targetMode.type === "broadcast")
    const r = reduceShiftTab(snapshot(s, false), true);
    expect(r).not.toBeNull();
    expect(r!.teamMode).toBe(true);
    expect(r!.goToOverview).toBe(true);
    expect(r!.resetDeliberation).toBe(true);
  });

  it("toggles from team to broadcast via overview", () => {
    const s = new Session(mockConfig(), "/tmp");
    const r = reduceShiftTab(snapshot(s, true), true);
    expect(r).not.toBeNull();
    expect(r!.teamMode).toBe(false);
    expect(r!.resetDeliberation).toBe(false);
  });

  it("refuses from directed mode", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    // isOverview = false
    const r = reduceShiftTab(snapshot(s, false), false);
    expect(r).toBeNull();
  });
});

describe("Escape integration", () => {
  it("returns to broadcast overview from directed mode", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    const r = reduceEscape(snapshot(s, false), false);
    expect(r.goToOverview).toBe(true);
    expect(r.teamMode).toBe(false);
  });

  it("returns to team overview from team directed mode", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    const r = reduceEscape(snapshot(s, true), false);
    expect(r.goToOverview).toBe(true);
    expect(r.teamMode).toBe(true);
  });

  it("aborts running deliberation", () => {
    const r = reduceEscape(snapshot(new Session(mockConfig(), "/tmp"), true, "round_start"), true);
    expect(r.abortDeliberation).toBe(true);
    expect(r.resetDeliberation).toBe(true);
    expect(r.goToOverview).toBe(true);
  });

  it("exits comparison mode", () => {
    const r = reduceEscape(
      buildModeState({ teamMode: false, deliberationProgress: null, comparisonModel: "gpt", comparisonFromBroadcast: true }),
      false,
    );
    expect(r.comparisonModel).toBeNull();
    expect(r.goToOverview).toBe(true);
  });
});

describe("Comparison integration", () => {
  it("d key from broadcast overview enters comparison", () => {
    const s = new Session(mockConfig(), "/tmp");
    const unmutedNames = s.models.filter(m => !m.muted).map(m => m.name);
    const r = reduceKeyD(snapshot(s, false), unmutedNames, null);
    expect(r.comparisonModel).toBe(unmutedNames[1]);
    expect(r.setDirectedTarget).toBe(unmutedNames[0]);
    expect(r.comparisonFromBroadcast).toBe(true);
  });

  it("d key from directed mode picks next model", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    const unmutedNames = s.models.filter(m => !m.muted).map(m => m.name);
    const r = reduceKeyD(snapshot(s, false), unmutedNames, "claude");
    expect(r.comparisonModel).toBe("gpt"); // next after claude
    expect(r.comparisonFromBroadcast).toBe(false);
  });

  it("d key toggles comparison off on second press", () => {
    const unmutedNames = ["claude", "gpt", "minimax"];
    const r = reduceKeyD(
      buildModeState({ teamMode: false, deliberationProgress: null, comparisonModel: "gpt", comparisonFromBroadcast: false }),
      unmutedNames,
      null,
    );
    expect(r.comparisonModel).toBeNull();
  });
});

describe("Team submit integration", () => {
  it("overview idle → submit starts deliberation", () => {
    const s = new Session(mockConfig(), "/tmp");
    const r = reduceSubmitInTeam(snapshot(s, true), true);
    expect(r.action).toBe("deliberate");
  });

  it("overview running → submit is blocked", () => {
    const r = reduceSubmitInTeam(snapshot(new Session(mockConfig(), "/tmp"), true, "round_start"), true);
    expect(r.action).toBe("block");
  });

  it("overview done → submit restarts deliberation", () => {
    const r = reduceSubmitInTeam(snapshot(new Session(mockConfig(), "/tmp"), true, "done"), true);
    expect(r.action).toBe("deliberate");
  });

  it("directed mode → submit routes normally", () => {
    const s = new Session(mockConfig(), "/tmp");
    s.jumpToModel("claude");
    const r = reduceSubmitInTeam(snapshot(s, true), false);
    expect(r.action).toBe("route_normally");
  });
});

describe("Full user workflow", () => {
  it("broadcast → Tab → directed → Tab → broadcast → Shift+Tab → team → Esc → broadcast", () => {
    const s = new Session(mockConfig(), "/tmp");

    // Start: broadcast overview
    expect(s.targetMode.type).toBe("broadcast");

    // Tab → model1
    const tab1 = reduceTab(snapshot(s, false));
    expect(tab1.cycleTarget).toBe(true);
    s.cycleTarget();
    expect(s.targetMode).toEqual({ type: "directed", modelName: "claude" });

    // Tab → model2
    s.cycleTarget();
    expect(s.targetMode).toEqual({ type: "directed", modelName: "gpt" });

    // Tab → model3
    s.cycleTarget();
    expect(s.targetMode).toEqual({ type: "directed", modelName: "minimax" });

    // Tab → broadcast overview (wrap around)
    s.cycleTarget();
    expect(s.targetMode).toEqual({ type: "broadcast" });

    // Shift+Tab → team mode
    const st = reduceShiftTab(snapshot(s, false), true);
    expect(st!.teamMode).toBe(true);
    expect(st!.goToOverview).toBe(true);

    // Esc → stays in team, goes to overview
    const esc = reduceEscape(snapshot(s, true), false);
    expect(esc.teamMode).toBe(true);
    expect(esc.goToOverview).toBe(true);

    // Shift+Tab → back to broadcast
    const st2 = reduceShiftTab(snapshot(s, true), true);
    expect(st2!.teamMode).toBe(false);
  });

  it("team deliberation lifecycle", () => {
    const s = new Session(mockConfig(), "/tmp");

    // Start deliberation (submit from team overview)
    const submit = reduceSubmitInTeam(snapshot(s, true), true);
    expect(submit.action).toBe("deliberate");

    // During deliberation: Esc aborts
    const esc = reduceEscape(snapshot(s, true, "round_start"), true);
    expect(esc.abortDeliberation).toBe(true);
    expect(esc.resetDeliberation).toBe(true);

    // After deliberation done: submit restarts
    const submit2 = reduceSubmitInTeam(snapshot(s, true, "done"), true);
    expect(submit2.action).toBe("deliberate");

    // After deliberation: Tab to model for discussion
    const tab = reduceTab(snapshot(s, true, "done"));
    expect(tab.cycleTarget).toBe(true);
  });
});

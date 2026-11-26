let editorMode = $state(false);
let scenarioPanelOpen = $state(false);

export const editorModeState = {
  get active() { return editorMode; },
  get scenarioPanelOpen() { return scenarioPanelOpen; },
  set(active: boolean) {
    if (editorMode !== active) scenarioPanelOpen = false;
    editorMode = active;
  },
  toggleScenarioPanel() {
    scenarioPanelOpen = !scenarioPanelOpen;
    return scenarioPanelOpen;
  },
  closeScenarioPanel() { scenarioPanelOpen = false; },
  toggle() {
    editorMode = !editorMode;
    scenarioPanelOpen = false;
    return editorMode;
  }
};

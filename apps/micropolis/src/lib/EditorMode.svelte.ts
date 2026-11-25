let editorMode = $state(false);

export const editorModeState = {
  get active() {
    return editorMode;
  },
  set(active: boolean) {
    editorMode = active;
  },
  toggle() {
    editorMode = !editorMode;
    return editorMode;
  }
};

let scenarioDialogOpen = $state(false);

export const scenarioDialogState = {
  get open() { return scenarioDialogOpen; },
  set(open: boolean) { scenarioDialogOpen = open; },
  toggle() { scenarioDialogOpen = !scenarioDialogOpen; return scenarioDialogOpen; }
};

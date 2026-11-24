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

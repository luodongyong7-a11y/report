export const DESIGNER_CSS = `
:host {
  display: block;
  height: 100%;
  min-height: 520px;
  font: 12px/1.4 Arial, "Microsoft YaHei", sans-serif;
  color: #222;
  --line: #d8d8d8;
  --bg: #f3f3f3;
  --paper-shadow: 0 1px 8px rgba(0,0,0,.12);
  --sel: #1677ff;
}
* { box-sizing: border-box; }
button, select, input, textarea { font: inherit; }
.nd {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  outline: none;
}
.nd-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}
.nd-bar button, .nd-bar select, .nd-bar input[type=number] {
  height: 26px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  padding: 0 6px;
}
.nd-bar button:hover { border-color: #999; }
.nd-bar label { display: inline-flex; align-items: center; gap: 4px; }
.nd-body { display: flex; flex: 1; min-height: 0; }
.nd-side {
  width: 240px;
  min-width: 200px;
  background: #fff;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.nd-side.right { border-right: 0; border-left: 1px solid var(--line); }
.nd-tabs { display: flex; border-bottom: 1px solid var(--line); }
.nd-tabs button {
  flex: 1;
  height: 32px;
  border: 0;
  background: transparent;
  border-bottom: 2px solid transparent;
}
.nd-tabs button.on { border-bottom-color: var(--sel); color: var(--sel); }
.nd-pane { flex: 1; overflow: auto; padding: 8px; }
.nd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #eee;
  margin-bottom: 6px;
  cursor: grab;
  background: #fafafa;
}
.nd-item:hover { border-color: #ccc; }
.nd-group { margin: 10px 0 4px; color: #666; }
.nd-canvas-wrap {
  flex: 1;
  overflow: auto;
  padding: 24px;
  min-width: 0;
}
.nd-paper {
  position: relative;
  background: #fff;
  box-shadow: var(--paper-shadow);
  transform-origin: top left;
}
.nd-guide {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed #eb2f96;
  cursor: ns-resize;
  z-index: 4;
}
.nd-guide span {
  position: absolute;
  left: 4px;
  top: -14px;
  font-size: 10px;
  color: #eb2f96;
  background: rgba(255,255,255,.85);
  pointer-events: none;
}
.nd-el {
  position: absolute;
  overflow: hidden;
  box-sizing: border-box;
  user-select: none;
}
.nd-el.is-sel { outline: 1px solid var(--sel); z-index: 3; }
.nd-el.is-text, .nd-el.is-data {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 1px;
}
.nd-el.is-rect { }
.nd-el.is-image img { width: 100%; height: 100%; object-fit: contain; display: block; }
.nd-el.is-image .ph, .nd-el .ph { color: #999; font-size: 11px; padding: 4px; }
.nd-handle {
  position: absolute;
  width: 7px;
  height: 7px;
  background: #fff;
  border: 1px solid var(--sel);
  z-index: 5;
}
.nd-handle.nw { left: -4px; top: -4px; cursor: nwse-resize; }
.nd-handle.n { left: calc(50% - 4px); top: -4px; cursor: ns-resize; }
.nd-handle.ne { right: -4px; top: -4px; cursor: nesw-resize; }
.nd-handle.e { right: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.nd-handle.se { right: -4px; bottom: -4px; cursor: nwse-resize; }
.nd-handle.s { left: calc(50% - 4px); bottom: -4px; cursor: ns-resize; }
.nd-handle.sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.nd-handle.w { left: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.nd-marquee {
  position: absolute;
  border: 1px dashed var(--sel);
  background: rgba(22,119,255,.08);
  pointer-events: none;
  z-index: 6;
}
.nd-prop { display: grid; grid-template-columns: 64px 1fr; gap: 6px 8px; align-items: center; }
.nd-prop label { color: #666; }
.nd-prop input, .nd-prop select, .nd-prop textarea { width: 100%; border: 1px solid #ccc; padding: 3px 4px; }
.nd-prop textarea { min-height: 56px; resize: vertical; }
.nd-prop .span { grid-column: 1 / -1; }
.nd-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.nd-chips button { border: 1px solid #ddd; background: #f7f7f7; padding: 2px 6px; border-radius: 3px; cursor: pointer; }
.nd-hint { color: #888; margin: 0 0 8px; }
.nd-bar i { width: 1px; height: 16px; background: #ddd; display: inline-block; }
`

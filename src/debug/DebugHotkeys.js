// Flip this to true for local debugging. Keep false for release builds.
export const DEBUG_HOTKEYS_ENABLED = true;

export function isTypingInTextField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function bindDebugHotkey(scene, key, handler, opts = {}) {
  if (!DEBUG_HOTKEYS_ENABLED) return null;
  const keyboard = scene?.input?.keyboard;
  if (!keyboard?.on || !keyboard?.off || typeof handler !== "function") return null;

  const rawKey = String(key || "").trim();
  if (!rawKey) return null;

  const eventName = rawKey.toLowerCase().startsWith("keydown-")
    ? `keydown-${rawKey.slice("keydown-".length).toUpperCase()}`
    : `keydown-${rawKey.toUpperCase()}`;
  const ignoreTyping = opts.ignoreTyping !== false;
  const wrappedHandler = (...args) => {
    if (ignoreTyping && isTypingInTextField()) return;
    handler(...args);
  };

  keyboard.on(eventName, wrappedHandler);
  return {
    eventName,
    handler: wrappedHandler,
    destroy() {
      keyboard.off(eventName, wrappedHandler);
    },
  };
}

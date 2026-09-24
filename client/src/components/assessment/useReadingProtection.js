import { useEffect } from "react";

export default function useReadingProtection(enabled, onPaste) {
  useEffect(() => {
    if (!enabled) return undefined;
    const block = (event) => {
      event.preventDefault();
      if (event.type === "paste") onPaste?.();
    };
    const events = ["copy", "cut", "paste", "contextmenu", "dragstart"];
    events.forEach((name) => document.addEventListener(name, block));
    return () => events.forEach((name) => document.removeEventListener(name, block));
  }, [enabled, onPaste]);
}

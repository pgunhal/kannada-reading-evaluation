import React from "react";
import { render } from "@testing-library/react";
import useReadingProtection from "./useReadingProtection";
function Screen({ active, onPaste }) {
  useReadingProtection(active, onPaste);
  return <input aria-label="Answer" />;
}
test("blocks clipboard, context menu and drag only while reading/quiz is mounted", () => {
  const onPaste = jest.fn();
  const fire = (type) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const { rerender, unmount } = render(<Screen active={false} onPaste={onPaste} />);
  expect(fire("paste")).toBe(false);
  rerender(<Screen active onPaste={onPaste} />);
  ["copy", "cut", "paste", "contextmenu", "dragstart"].forEach((type) => expect(fire(type)).toBe(true));
  expect(onPaste).toHaveBeenCalledTimes(1);
  rerender(<Screen active={false} onPaste={onPaste} />);
  expect(fire("paste")).toBe(false);
  rerender(<Screen active onPaste={onPaste} />);
  unmount();
  ["copy", "cut", "paste", "contextmenu", "dragstart"].forEach((type) => expect(fire(type)).toBe(false));
});

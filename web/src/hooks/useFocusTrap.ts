import { useEffect, useRef } from "react";

/**
 * Accessible modal-dialog behavior for an open overlay (WCAG 2.1.2 No Keyboard
 * Trap done right, 2.4.3 Focus Order). While `active` is true this hook, bound to
 * the dialog container ref it returns:
 *
 * - traps Tab / Shift+Tab within the dialog's focusable elements (wrapping at the
 *   ends) so keyboard focus can't leak to the inert page behind the overlay;
 * - closes the dialog on Escape via `onClose`;
 * - restores focus to whatever element was focused before the dialog opened when
 *   it closes, so keyboard users aren't dumped at the top of the document.
 *
 * Initial focus is left to the dialog itself (e.g. an `autoFocus` close button),
 * matching the existing markup.
 *
 * @param active   whether the dialog is currently open
 * @param onClose  invoked when Escape is pressed
 * @returns a ref to attach to the dialog container element
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  // Capture the trigger element so focus can be returned to it on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        // Nothing focusable inside — keep focus on the container itself.
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Return focus to the trigger when the dialog closes/unmounts.
      previouslyFocused.current?.focus?.();
    };
  }, [active, onClose]);

  return containerRef;
}

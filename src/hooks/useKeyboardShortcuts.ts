import { useEffect } from 'react';
import { hasPrimaryModifier } from '../lib/platform';

interface ShortcutActions {
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleFocus: () => void;
  exitFocus: () => void;
  findInPdf: () => void;
  focusSearch: () => void;
}

/**
 * Registers OS-adaptive layout shortcuts, preserving text editing and IME composition.
 * @param actions Layout actions; memoize callbacks to avoid unnecessary rebinding.
 * @returns Nothing; removes the listener on unmount.
 */
export function useKeyboardShortcuts(actions: ShortcutActions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if(document.querySelector('[aria-modal="true"]'))return;
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if(hasPrimaryModifier(event)&&!event.altKey&&!event.shiftKey&&event.code==='KeyK'){event.preventDefault();actions.focusSearch();return;}
      if(hasPrimaryModifier(event)&&!event.altKey&&!event.shiftKey&&event.code==='KeyF'){event.preventDefault();actions.findInPdf();return;}
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      if (event.key === 'F11' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault(); actions.toggleFocus();
      } else if (event.key === 'Escape') {
        actions.exitFocus();
      } else if (hasPrimaryModifier(event) && !event.altKey && event.code === 'KeyB') {
        event.preventDefault();
        if (event.shiftKey) actions.toggleRight(); else actions.toggleLeft();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}

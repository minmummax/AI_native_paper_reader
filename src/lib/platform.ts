/** @returns Whether the host reports an Apple desktop/mobile platform. */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

/**
 * Matches the platform's primary shortcut modifier without accepting the other modifier.
 * @param event Keyboard event to inspect.
 * @returns Cmd on Apple platforms, Ctrl on Windows/Linux.
 */
export function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return isApplePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** @returns Human-readable primary shortcut modifier for the current platform. */
export function primaryModifierLabel(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl';
}

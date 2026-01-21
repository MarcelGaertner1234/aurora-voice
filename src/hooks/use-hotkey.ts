'use client';

import { useEffect, useCallback, useRef } from 'react';

interface UseHotkeyOptions {
  enabled?: boolean;
}

export function useHotkey(
  key: string,
  callback: () => void,
  options: UseHotkeyOptions = {}
) {
  const { enabled = true } = options;

  // Fix H22: Use ref for callback to avoid recreating event listener when callback changes
  const callbackRef = useRef(callback);

  // Update callback ref in useEffect to avoid ref access during render
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Fix M20: Parse key configuration once and store in ref
  const keyConfigRef = useRef({
    parts: key.toLowerCase().split('+'),
    modifiers: key.toLowerCase().split('+').slice(0, -1),
    mainKey: key.toLowerCase().split('+').pop() || '',
  });

  // Update key config when key changes
  useEffect(() => {
    const parts = key.toLowerCase().split('+');
    keyConfigRef.current = {
      parts,
      modifiers: parts.slice(0, -1),
      mainKey: parts[parts.length - 1],
    };
  }, [key]);

  // Fix H22: Use stable callback that reads from refs
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const { modifiers, mainKey } = keyConfigRef.current;

      // Check modifiers
      const needsCmd =
        modifiers.includes('commandorcontrol') ||
        modifiers.includes('cmd') ||
        modifiers.includes('command') ||
        modifiers.includes('ctrl') ||
        modifiers.includes('control');
      const needsShift = modifiers.includes('shift');
      const needsAlt = modifiers.includes('alt') || modifiers.includes('option');

      const hasCmd = event.metaKey || event.ctrlKey;
      const hasShift = event.shiftKey;
      const hasAlt = event.altKey;

      // Fix M20: Normalize special keys like 'space', 'enter', etc.
      if (!event.key) return;
      let pressedKey = event.key.toLowerCase();
      if (event.code === 'Space') pressedKey = 'space';
      if (event.code === 'Enter') pressedKey = 'enter';
      if (event.code === 'Escape') pressedKey = 'escape';

      if (
        (needsCmd === hasCmd) &&
        (needsShift === hasShift) &&
        (needsAlt === hasAlt) &&
        pressedKey === mainKey
      ) {
        event.preventDefault();
        callbackRef.current();
      }
    },
    [enabled] // Fix H22: Only enabled as dependency, callback is in ref
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

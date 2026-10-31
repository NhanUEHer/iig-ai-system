import { useCallback, useState } from 'react';

export function useControllableState({ value, defaultValue, onChange }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;
  const setValue = useCallback(next => {
    const resolved = typeof next === 'function' ? next(currentValue) : next;
    if (!controlled) setInternalValue(resolved);
    onChange?.(resolved);
  }, [controlled, currentValue, onChange]);
  return [currentValue, setValue];
}

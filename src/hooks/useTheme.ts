import { useCallback } from 'react';
import { useApp } from '../context/AppContext';

export function useTheme() {
  const { state, updateSettings } = useApp();
  const theme = state.settings.theme || 'light';

  const toggleTheme = useCallback(() => {
    updateSettings({ ...state.settings, theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, state.settings, updateSettings]);

  return { theme, toggleTheme };
}

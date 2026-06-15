// store/themeStore.ts — Dark/light theme toggle with persistence

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeStore {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (t: 'dark' | 'light') => void;
}

function applyTheme(t: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () =>
        set((s) => {
          const next = s.theme === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          return { theme: next };
        }),
      setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
      },
    }),
    { name: 'cdss-theme', onRehydrateStorage: () => (s) => s && applyTheme(s.theme) },
  ),
);

import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { Project, AppConfig } from '../types/electron';
import { loadProjects, saveProjects, loadConfig, saveConfig } from '../utils/storage';

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  settings: AppConfig;
  activePage: string;
  loaded: boolean;
}

interface AppActions {
  addProject: (project: Project) => Promise<void>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  updateSettings: (settings: AppConfig) => Promise<void>;
  setActivePage: (page: string) => void;
}

type AppContextValue = { state: AppState } & AppActions;

type Action =
  | { type: 'SET_LOADED' }
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_CURRENT_PROJECT'; payload: string | null }
  | { type: 'SET_SETTINGS'; payload: AppConfig }
  | { type: 'SET_ACTIVE_PAGE'; payload: string };

const AppContext = createContext<AppContextValue | null>(null);

const initialState: AppState = {
  projects: [],
  currentProjectId: null,
  settings: { theme: 'light', claudeCliPath: 'claude', dataDir: '', windowWidth: 1200, windowHeight: 800, windowX: 0, windowY: 0, lastPage: 'info', uiFontSize: 14, editorFontSize: 13, terminalFontSize: 14, treeFontSize: 13 },
  activePage: 'info',
  loaded: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LOADED':
      return { ...state, loaded: true };
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'UPDATE_PROJECT': {
      const projects = state.projects.map((p: Project) => p.id === action.payload.id ? action.payload : p);
      return { ...state, projects };
    }
    case 'DELETE_PROJECT':
      return { ...state, projects: state.projects.filter((p: Project) => p.id !== action.payload) };
    case 'SET_CURRENT_PROJECT':
      return { ...state, currentProjectId: action.payload, activePage: 'info' };
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    case 'SET_ACTIVE_PAGE':
      return { ...state, activePage: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children, initialProjectId }: { children: ReactNode; initialProjectId?: string }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    currentProjectId: initialProjectId || null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const doOpenProject = useCallback(async (id: string) => {
    const projects = stateRef.current.projects;
    const p = projects.find((proj: Project) => proj.id === id);
    if (p) {
      const updated = { ...p, lastOpenedAt: new Date().toISOString() };
      dispatch({ type: 'UPDATE_PROJECT', payload: updated });
      const all = await loadProjects();
      await saveProjects(all.map((pp: Project) => pp.id === id ? updated : pp));
    }
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: id });
  }, []);

  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      const projects = await loadProjects();
      dispatch({ type: 'SET_SETTINGS', payload: config });
      dispatch({ type: 'SET_PROJECTS', payload: projects });
      dispatch({ type: 'SET_LOADED' });
      document.body.className = config.theme === 'dark' ? 'theme-dark' : '';

      // Set initial project and update lastOpenedAt
      if (initialProjectId) {
        const p = projects.find((proj: Project) => proj.id === initialProjectId);
        if (p) {
          const updated = { ...p, lastOpenedAt: new Date().toISOString() };
          dispatch({ type: 'UPDATE_PROJECT', payload: updated });
          dispatch({ type: 'SET_CURRENT_PROJECT', payload: initialProjectId });
          await saveProjects(projects.map((pp: Project) => pp.id === initialProjectId ? updated : pp));
        } else {
          dispatch({ type: 'SET_CURRENT_PROJECT', payload: initialProjectId });
        }
      }
    })();
  }, [initialProjectId]);

  const actions: AppActions = {
    addProject: async (project: Project) => {
      dispatch({ type: 'ADD_PROJECT', payload: project });
      const all = await loadProjects();
      all.push(project);
      await saveProjects(all);
    },
    updateProject: async (project: Project) => {
      dispatch({ type: 'UPDATE_PROJECT', payload: project });
      const all = await loadProjects();
      const updated = all.map((p: Project) => p.id === project.id ? project : p);
      await saveProjects(updated);
    },
    deleteProject: async (id: string) => {
      dispatch({ type: 'DELETE_PROJECT', payload: id });
      const all = await loadProjects();
      await saveProjects(all.filter((p: Project) => p.id !== id));
    },
    openProject: doOpenProject,
    closeProject: () => dispatch({ type: 'SET_CURRENT_PROJECT', payload: null }),
    updateSettings: async (settings: AppConfig) => {
      dispatch({ type: 'SET_SETTINGS', payload: settings });
      await saveConfig(settings);
      document.body.className = settings.theme === 'dark' ? 'theme-dark' : '';
    },
    setActivePage: (page: string) => dispatch({ type: 'SET_ACTIVE_PAGE', payload: page }),
  };

  return (
    <AppContext.Provider value={{ state, ...actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

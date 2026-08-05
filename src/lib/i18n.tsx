import { createContext, useContext, useEffect, ReactNode } from "react";

/**
 * English-only site.
 * The previous RU→EN runtime translation layer has been removed — all copy is
 * authored in English directly in the components.
 */
export type Lang = "en";

const LS_KEY = "neocast.lang";

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; toggle: () => void }
const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, toggle: () => {} });

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
    if (typeof document !== "undefined") document.documentElement.lang = "en";
  }, []);

  return <Ctx.Provider value={{ lang: "en", setLang: () => {}, toggle: () => {} }}>{children}</Ctx.Provider>;
};

export const useLanguage = () => useContext(Ctx);

/** Kept as a no-op so legacy imports keep working. */
export const LanguageToggle = (_props: { className?: string }) => null;
export const LegacyLanguageToggle = LanguageToggle;

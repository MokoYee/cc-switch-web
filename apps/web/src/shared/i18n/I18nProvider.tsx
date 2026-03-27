import type { LocaleCode } from "@cc-switch-web/shared";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import { messages } from "./messages.js";
import type { I18nContextValue, TranslationKey } from "./types.js";

const STORAGE_KEY = "ai-cli-switch.locale";
const DEFAULT_LOCALE: LocaleCode = "zh-CN";

const I18nContext = createContext<I18nContextValue | null>(null);

const readBrowserLocale = (): LocaleCode => {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") {
    return stored;
  }

  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("zh") ? "zh-CN" : "en-US";
};

const resolveMessage = (locale: LocaleCode, key: TranslationKey): string => {
  const keySegments = key.split(".");
  let currentValue: unknown = messages[locale];

  for (const segment of keySegments) {
    if (typeof currentValue !== "object" || currentValue === null || !(segment in currentValue)) {
      return key;
    }
    currentValue = (currentValue as Record<string, unknown>)[segment];
  }

  return typeof currentValue === "string" ? currentValue : key;
};

export const I18nProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [locale, setLocale] = useState<LocaleCode>(readBrowserLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: TranslationKey) => resolveMessage(locale, key)
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);

  if (context === null) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
};

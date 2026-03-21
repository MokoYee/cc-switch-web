import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messages } from "./messages.js";
const STORAGE_KEY = "ai-cli-switch.locale";
const DEFAULT_LOCALE = "zh-CN";
const I18nContext = createContext(null);
const readBrowserLocale = () => {
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
const resolveMessage = (locale, key) => {
    const keySegments = key.split(".");
    let currentValue = messages[locale];
    for (const segment of keySegments) {
        if (typeof currentValue !== "object" || currentValue === null || !(segment in currentValue)) {
            return key;
        }
        currentValue = currentValue[segment];
    }
    return typeof currentValue === "string" ? currentValue : key;
};
export const I18nProvider = ({ children }) => {
    const [locale, setLocale] = useState(readBrowserLocale);
    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, locale);
        document.documentElement.lang = locale;
    }, [locale]);
    const value = useMemo(() => ({
        locale,
        setLocale,
        t: (key) => resolveMessage(locale, key)
    }), [locale]);
    return _jsx(I18nContext.Provider, { value: value, children: children });
};
export const useI18n = () => {
    const context = useContext(I18nContext);
    if (context === null) {
        throw new Error("useI18n must be used within I18nProvider");
    }
    return context;
};
//# sourceMappingURL=I18nProvider.js.map
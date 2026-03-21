import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useI18n } from "../i18n/I18nProvider.js";
const localeOptions = [
    { value: "zh-CN", label: "中文" },
    { value: "en-US", label: "English" }
];
export const LanguageSwitcher = () => {
    const { locale, setLocale, t } = useI18n();
    return (_jsxs("label", { className: "language-switcher", children: [_jsx("span", { children: t("app.languageLabel") }), _jsx("select", { "aria-label": t("app.languageLabel"), value: locale, onChange: (event) => setLocale(event.target.value), children: localeOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }));
};
//# sourceMappingURL=LanguageSwitcher.js.map
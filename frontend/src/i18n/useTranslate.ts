import { useContext } from 'react';
import { LanguageContext } from './languageContext';
import { translations } from './translations';

export const useTranslate = () => {
    const { language } = useContext(LanguageContext);
    const t = (keyStr: string): string => {
        const keys = keyStr.split('.');
        let val: unknown = translations[language as keyof typeof translations];
        for (const k of keys) {
            if (val == null || typeof val !== 'object') break;
            val = (val as Record<string, unknown>)[k];
        }
        return (typeof val === 'string' ? val : keyStr);
    }
    return t;
};

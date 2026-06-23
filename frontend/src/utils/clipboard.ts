export const selectTextInput = (input: HTMLInputElement | HTMLTextAreaElement | null): boolean => {
    if (!input) return false;

    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, input.value.length);
    return true;
};

const copyWithSelection = (text: string): boolean => {
    if (typeof document === 'undefined' || !document.body) return false;

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selection = document.getSelection();
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.padding = '0';
    textarea.style.border = '0';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    selectTextInput(textarea);

    try {
        return document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
        if (selectedRange && selection) {
            selection.removeAllRanges();
            selection.addRange(selectedRange);
        }
        activeElement?.focus({ preventScroll: true });
    }
};

export const copyTextToClipboard = async (text: string): Promise<void> => {
    if (!text) {
        throw new Error('Nothing to copy');
    }

    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall through to the selection-based path for browsers that expose
            // the API but deny it because of permissions or page context.
        }
    }

    if (copyWithSelection(text)) return;

    throw new Error('Clipboard copy failed');
};

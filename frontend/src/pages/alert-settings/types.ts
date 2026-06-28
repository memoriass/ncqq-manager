export interface QqBotTarget {
    msg_type: string;
    target_id: string;
}

export interface QqNotifyForm {
    monitorNames: string[];
    selectedNames: string[];
    msg_type: string;
    target_id: string;
    apiFallbackEnabled: boolean;
}

export interface ApiFallbackForm {
    api_url: string;
}

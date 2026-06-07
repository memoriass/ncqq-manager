export interface BotManagerProps {
    name: string;
    node_id: string;
}

export type GlassStyle = Record<string, unknown>;

export interface GroupItem {
    group_id: number;
    group_name: string;
    member_count: number;
    max_member_count: number;
}

export interface GroupMember {
    user_id: number;
    nickname: string;
    card: string;
    role: 'owner' | 'admin' | 'member';
    join_time: number;
    last_sent_time: number;
}

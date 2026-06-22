export interface Container {
    id: string;
    name: string;
    status: string;
    image: string;
    created: string;
    node_id: string;
    uin?: string;
    bot_online?: boolean;
    bot_heartbeat_ts?: number;
}

export interface ContainerStats {
    status: string;
    created: string;
    cpu_percent: number;
    mem_usage: number;
    mem_limit: number;
    uin: string;
    version: string;
    webui_token: string;
    webui_port: number;
    platform: string;
    uptime_formatted: string;
    net_rx_bytes?: number;
    net_tx_bytes?: number;
    network_endpoints: {
        http: number;
        ws: number;
        http_client: number;
        ws_client: number;
    };
}

export interface Node {
    id: string;
    name: string;
    address: string;
    api_key?: string; // 列表接口不下发；管理员节点详情接口用于编辑弹窗展示
    status?: string;
    container_count?: number;
    ping?: number;
    system?: {
        cpu_percent: number;
        mem_percent: number;
        platform: string;
        python_version: string;
        app_version?: string;
    };
    instances?: {
        total: number;
        running: number;
    };
    chart?: {
        cpu: number[];
        mem: number[];
    };
}

export interface InstanceRef {
    node_id: string;
    container_name: string;
}

export interface User {
    uuid: string;
    userName: string;
    permission: number;
    hasApiKey?: boolean; // 列表接口仅返回是否已配置，不返回明文
    instances?: InstanceRef[];
}

export interface AuthUser {
    uuid: string;
    userName: string;
    permission: number;
}

export type {
    OperationLog,
    OperationLogsQuery,
    OperationLogsResponse,
} from '../operationLogs';

export interface FileItem {
    name: string;
    size: number;
    mtime: number;
}

export interface FolderItem {
    name: string;
}

export interface ClusterConfig {
    docker_image: string;
    webui_base_port: number;
    http_base_port: number;
    ws_base_port: number;
    data_dir: string;
    api_key: string;
    has_api_key?: boolean;
}

export interface ClusterConfigResponse {
    status: string;
    config: ClusterConfig;
    system?: {
        cpu_percent: number;
        mem_percent: number;
        platform: string;
        python_version: string;
        app_version?: string;
    };
}

export interface CreateContainerRequest {
    name: string;
    node_id?: string;
    docker_image?: string;
    webui_port?: number;
    http_port?: number;
    ws_port?: number;
    memory_limit?: number;
    restart_policy?: string;
    network_mode?: string;
    env_vars?: string[];
}

export interface UserEditPayload {
    userName?: string;
    passWord?: string;
    permission?: number;
}

export interface DockerImage {
    id: string;
    tags: string[];
    size: number;
    created: string;
}

export interface AlertRule {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    config: Record<string, unknown>;
    webhook_url: string;
    created_at: number;
}


export interface AlertSettings {
    status: string;
    allow_local_webhook: boolean;
    webhook_base_url: string;
    smtp_enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_username: string;
    smtp_password_set: boolean;
    smtp_auth_mode: string;
    smtp_sender: string;
    smtp_sender_name: string;
    smtp_reply_to: string;
    smtp_recipients: string;
    smtp_use_ssl: boolean;
    smtp_use_tls: boolean;
    smtp_verify_tls: boolean;
    smtp_timeout_sec: number;
    smtp_qrcode: boolean;
    smtp_subject_prefix: string;
}

export interface AlertHistory {
    id: number;
    rule_id: string;
    message: string;
    level: string;
    created_at: number;
}

export interface SetupStatus {
    status: string;
    initialized: boolean;
    local_ip: string;
    default_data_dir: string;
    default_port: number;
}

export interface SetupRequest {
    admin_username: string;
    admin_password: string;
    host: string;
    port: number;
    data_dir?: string;
    manager_host?: string;
}

export interface BSActivationConnection {
    id: string;
    name: string;
    enabled: boolean;
    client_status: string;
    ws_alive: boolean;
    has_manager_endpoint: boolean;
    ws_registered: boolean;
    self_id: number | string | null;
    last_seen: number;
}

export interface BSActivationStatus {
    enabled: boolean;
    running: boolean;
    status: string;
    connected: boolean;
    source: string;
    last_error: string;
    last_check_at: number;
    total_connections: number;
    managed_connections: number;
    active_connections: number;
    injected_connections: number;
    missing_endpoints: string[];
    connections: BSActivationConnection[];
}




export interface BotShepherdStatus {
    installed: boolean;
    initialized: boolean;
    running: boolean;
    port: number;
    pid: number | null;
    auto_start: boolean;
    dir: string;
    webui_port: number | null;
    activation?: BSActivationStatus;
}

export interface BSConnectionStatus {
    enabled: boolean;
    client_status: 'disabled' | 'starting' | 'listening' | 'connected' | 'error';
    client_endpoint: string;
    target_statuses: Record<string, unknown>;
    error: string | null;
    client_address?: string;
    self_id?: number | null;
}

export interface BSConnection {
    name?: string;
    description?: string;
    enabled?: boolean;
    client_endpoint?: string;
    target_endpoints?: string[];
    group?: string;
    status?: BSConnectionStatus;
}

export interface BSConnectionsResponse {
    source: 'api' | 'file';
    connections: Record<string, BSConnection>;
}

export interface BSAccount {
    name?: string;
    description?: string;
    enabled?: boolean;
    aliases?: Record<string, string[]>;
    last_receive_time?: string;
    last_send_time?: string;
}

export interface BSAccountsResponse {
    source: 'api' | 'file';
    accounts: Record<string, BSAccount>;
}

/** Bot 后端端点库条目 */
export interface BackendEndpoint {
    alias: string;       // 别名（唯一标识，用于 inject-by-alias 调用）
    url: string;         // ws:// 地址
    token: string;       // 可选 Bearer token
}

export interface NetworkEndpointConfig {
    name?: string;
    enable?: boolean;
    // HTTP 服务器 / SSE 服务器
    host?: string;
    port?: number;
    // HTTP 客户端 / WS 客户端
    url?: string;
    token?: string;
    // 通用
    reportSelfMessage?: boolean;
    messagePostFormat?: 'string' | 'array';
    debug?: boolean;
    heartInterval?: number;
    reconnectInterval?: number;
    // HTTP 服务器额外字段
    enableCors?: boolean;
    enableWebsocket?: boolean;
}

export interface InjectNetworkConfigRequest {
    uin?: string;
    node_id?: string;
    network: {
        httpServers?:       NetworkEndpointConfig[];
        httpClients?:       NetworkEndpointConfig[];
        httpSseServers?:    NetworkEndpointConfig[];
        websocketServers?:  NetworkEndpointConfig[];
        websocketClients?:  NetworkEndpointConfig[];
    };
}

export interface BotStatusItem {
    name: string;
    uin: string;
    nickname: string;
    connected: boolean;
    last_seen: number;
}

export interface BotMessage {
    time: number;
    message_id: number;
    message_type: 'private' | 'group';
    user_id: number;
    self_id?: number;
    sender?: { nickname?: string; card?: string; user_id?: number };
    raw_message: string;
    group_id?: number | string;
    sub_type?: string;
}

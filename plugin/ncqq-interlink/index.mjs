/**
 * NapCat Manager 互联插件 — WS 持久链接版本
 *
 * 功能：与 Manager /ws/plugin/{name} 建立持久 WebSocket，实时推送 login/logout/heartbeat。
 * 配置来源优先级：containerName 环境变量优先，其余字段插件配置优先 > 环境变量降级
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

let _config = { managerUrl: '', internalKey: '', containerName: '' };
let _ctx = null;
let _ws = null;
let _wsReconnectTimer = null;
let _wsReconnectDelay = 5000; // 初始重连间隔 5s，递增 5s，上限 60s
let _wsPingTimer = null;
let _loginCheckTimer = null;
let _healthTimer = null;
let _hbWatchTimer = null;
let _lastHbTs = 0;
let _botOnline = false;
let _msgSent = 0;
let _msgReceived = 0;

const _HB_TIMEOUT_MS = 45000; // 45s 无 NapCat 心跳判定离线（NapCat 默认 30s/次）
const _HB_CHECK_INTERVAL = 15000; // 15s 检查一次
const _LOGIN_GRACE_MS = 60000; // 启动后 60s 内不报 login_failed（给快速登录/扫码留时间）

let _initTs = 0; // 插件初始化时间戳
let _loginFailReported = false; // 是否已上报过 login_failed

function getEnv(key, fallback = '') {
  return process.env[key] || fallback;
}

function _readConfigFile(configPath) {
  try {
    if (configPath && existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function resolveConfig(savedConfig) {
  return {
    // managerUrl / internalKey: 插件配置优先，环境变量降级
    managerUrl: (savedConfig?.managerUrl || getEnv('NCQQ_MANAGER_URL')).replace(/\/$/, ''),
    internalKey: savedConfig?.internalKey || getEnv('NCQQ_INTERNAL_KEY'),
    // containerName: 环境变量优先 —— Manager 注入的值是权威值，防止 qq_data 复用时读到旧容器名
    containerName: getEnv('NCQQ_CONTAINER_NAME') || savedConfig?.containerName,
  };
}

async function postLoginEvent(event, uin, nickname = '') {
  const sent = sendWS({ type: event === 'login' ? 'login' : 'logout', uin, nickname });
  if (!sent) console.log(`[ManagerLink] WS not ready, ${event} uin=${uin} dropped`);
}

async function checkAndReportLogin() {
  if (!_ctx || !_config.managerUrl) return;
  try {
    const info = await _ctx.actions.call(
      'get_login_info', {}, _ctx.adapterName, _ctx.pluginManager.config
    );
    const uid = String(info?.user_id || '');
    if (uid && uid !== '0') {
      sendWS({ type: 'login', uin: uid, nickname: info.nickname || '' });
      _botOnline = true;
      _loginFailReported = false;
      _lastHbTs = Date.now(); // 启动超时检测基线
      console.log(`[ManagerLink] 上报登录 uin=${uid}`);
    }
  } catch (e) {
    console.log(`[ManagerLink] login check failed: ${e.message}`);
  }
}

// ---------- WebSocket 连接管理 ----------

async function _getWSClass() {
  // Node.js 21+ 原生 WebSocket
  if (typeof WebSocket !== 'undefined') return WebSocket;
  // 降级：尝试 ws 包（NapCat node_modules 中通常存在）
  try {
    const mod = await import('ws');
    return mod.default || mod.WebSocket;
  } catch { /* ignore */ }
  return null;
}

function sendWS(data) {
  if (_ws && _ws.readyState === 1 /* OPEN */) {
    try { _ws.send(JSON.stringify(data)); return true; } catch { /* ignore */ }
  }
  return false;
}

async function connectWS() {
  const { managerUrl, internalKey, containerName } = _config;
  if (!managerUrl || !containerName) return;

  const WSClass = await _getWSClass();
  if (!WSClass) {
    console.log('[ManagerLink] 无可用 WebSocket 实现，无法建立插件链路');
    return;
  }

  const wsUrl = `${managerUrl.replace(/^http/, 'ws')}/ws/plugin/${containerName}?key=${encodeURIComponent(internalKey)}`;

  try {
    _ws = new WSClass(wsUrl);

    _ws.onopen = () => {
      console.log(`[ManagerLink] WS 已连接 ${wsUrl}`);
      _wsReconnectDelay = 5000; // 连接成功，重置重连间隔
      // 30s ping 保活，防止 idle timeout 断连
      if (_wsPingTimer) clearInterval(_wsPingTimer);
      _wsPingTimer = setInterval(() => sendWS({ type: 'ping' }), 30000);
      // 连接后 1s 上报当前登录状态
      setTimeout(() => checkAndReportLogin(), 1000);
    };

    _ws.onclose = (evt) => {
      _ws = null;
      if (_wsPingTimer) { clearInterval(_wsPingTimer); _wsPingTimer = null; }
      console.log(`[ManagerLink] WS 断开 (code=${evt?.code ?? '?'})，${_wsReconnectDelay / 1000}s 后重连`);
      if (_wsReconnectTimer) clearTimeout(_wsReconnectTimer);
      _wsReconnectTimer = setTimeout(() => connectWS(), _wsReconnectDelay);
      _wsReconnectDelay = Math.min(_wsReconnectDelay + 5000, 60000);
    };

    _ws.onerror = (e) => {
      console.log(`[ManagerLink] WS 错误: ${e.message || e}`);
      // 兜底重连：某些 WebSocket 实现在握手失败时只触发 onerror 不触发 onclose
      if (_ws && _ws.readyState === 3 /* CLOSED */ && !_wsReconnectTimer) {
        _ws = null;
        if (_wsPingTimer) { clearInterval(_wsPingTimer); _wsPingTimer = null; }
        _wsReconnectTimer = setTimeout(() => connectWS(), _wsReconnectDelay);
        _wsReconnectDelay = Math.min(_wsReconnectDelay + 5000, 60000);
      }
    };

    _ws.onmessage = () => { /* 仅接收 ping，忽略下行消息 */ };

  } catch (e) {
    console.log(`[ManagerLink] WS 连接失败: ${e.message}，${_wsReconnectDelay / 1000}s 后重连`);
    if (_wsReconnectTimer) clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = setTimeout(() => connectWS(), _wsReconnectDelay);
    _wsReconnectDelay = Math.min(_wsReconnectDelay + 5000, 60000);
  }
}

// ============ 生命周期 ============

export const plugin_config_ui = [
  {
    key: 'managerUrl',
    label: 'Manager URL',
    type: 'string',
    default: '',
    placeholder: 'http://host.docker.internal:8080',
    description: 'NCQQ Manager 地址（留空则读取环境变量 NCQQ_MANAGER_URL）',
  },
  {
    key: 'internalKey',
    label: 'Internal API Key',
    type: 'string',
    default: '',
    placeholder: '',
    description: '内部通信密钥（留空则读取环境变量 NCQQ_INTERNAL_KEY）',
  },
  {
    key: 'containerName',
    label: '容器名称',
    type: 'string',
    default: '',
    placeholder: '',
    description: '当前容器名（环境变量 NCQQ_CONTAINER_NAME 优先，此处为降级配置）',
  },
];

// 自定义配置读取：从 ctx.configPath 读 JSON 文件
export const plugin_get_config = (ctx) => {
  return _readConfigFile(ctx.configPath) || {};
};

// 自定义配置保存：写入 ctx.configPath，并热更新运行时配置 + 重连 WS
export const plugin_set_config = (ctx, config) => {
  try {
    writeFileSync(ctx.configPath, JSON.stringify(config, null, 2), 'utf-8');
    _config = resolveConfig(config);
    console.log(`[ManagerLink] config updated: name=${_config.containerName}`);
    // 配置变更后重建 WS 连接
    _wsReconnectDelay = 5000; // 重置重连间隔
    if (_ws) {
      _ws.onclose = null; // 防止触发重连定时器
      try { _ws.close(); } catch { /* ignore */ }
      _ws = null;
    }
    if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
    connectWS();
  } catch (e) {
    console.log(`[ManagerLink] save config failed: ${e.message}`);
  }
};

export const plugin_init = async (ctx) => {
  _ctx = ctx;
  _initTs = Date.now();
  _loginFailReported = false;
  let savedConfig = _readConfigFile(ctx.configPath);
  // 降级：ctx.configPath 可能是框架分配的目录路径，尝试已知固定位置
  if (!savedConfig) {
    savedConfig = _readConfigFile('/app/napcat/config/ncqq-interlink.json');
  }
  _config = resolveConfig(savedConfig);
  console.log(`[ManagerLink] init: url=${_config.managerUrl} name=${_config.containerName} configPath=${ctx.configPath}`);

  // 建立持久 WS 连接（连接后会自动上报登录状态）
  await connectWS();

  // 心跳超时监控 + 未登录检测
  _hbWatchTimer = setInterval(async () => {
    // 场景1：已在线但心跳超时 → 二次确认后推送 logout
    if (_botOnline && _lastHbTs > 0 && (Date.now() - _lastHbTs) > _HB_TIMEOUT_MS) {
      try {
        const info = await _ctx.actions.call(
          'get_login_info', {}, _ctx.adapterName, _ctx.pluginManager.config
        );
        const uid = String(info?.user_id || '');
        if (uid && uid !== '0') {
          _lastHbTs = Date.now();
          return;
        }
      } catch { /* API 失败视为离线 */ }
      _botOnline = false;
      _loginFailReported = false;
      sendWS({ type: 'logout', uin: '', reason: 'heartbeat_timeout' });
      console.log('[ManagerLink] heartbeat timeout → offline');
    }

    // 场景2：从未登录成功，超过宽限期 → 上报 login_failed
    if (!_botOnline && !_loginFailReported && (Date.now() - _initTs) > _LOGIN_GRACE_MS) {
      // 主动确认一次
      try {
        const info = await _ctx.actions.call(
          'get_login_info', {}, _ctx.adapterName, _ctx.pluginManager.config
        );
        const uid = String(info?.user_id || '');
        if (uid && uid !== '0') {
          // 实际已登录，补报 login
          _botOnline = true;
          _lastHbTs = Date.now();
          sendWS({ type: 'login', uin: uid, nickname: info.nickname || '' });
          console.log(`[ManagerLink] late login detected uin=${uid}`);
          return;
        }
      } catch { /* ignore */ }
      _loginFailReported = true;
      sendWS({ type: 'logout', uin: '', reason: 'login_failed' });
      console.log('[ManagerLink] login grace expired, reported login_failed');
    }
  }, _HB_CHECK_INTERVAL);

  // 每分钟健康日志
  _healthTimer = setInterval(() => {
    const wsState = _ws && _ws.readyState === 1 ? 'connected' : 'disconnected';
    console.log(`[ManagerLink] health: ws=${wsState} sent=${_msgSent} recv=${_msgReceived}`);
  }, 60000);
};

export const plugin_onevent = async (ctx, event) => {
  if (!_config.managerUrl) return;

  // 消息计数
  if (event.post_type === 'message') {
    if (event.message_type === 'private' || event.message_type === 'group') {
      _msgReceived++;
    }
  }
  if (event.post_type === 'message_sent') {
    _msgSent++;
  }

  // lifecycle.connect — NapCat 连接成功，检查登录状态
  if (event.post_type === 'meta_event' && event.meta_event_type === 'lifecycle') {
    if (event.sub_type === 'connect') {
      setTimeout(() => checkAndReportLogin(), 2000);
    }
  }

  // OB11 心跳事件 → 通过 WS 转发心跳给 Manager
  if (event.post_type === 'meta_event' && event.meta_event_type === 'heartbeat') {
    _lastHbTs = Date.now();
    if (!_botOnline) {
      _botOnline = true;
      console.log('[ManagerLink] NapCat heartbeat resumed, bot online');
    }
    sendWS({ type: 'heartbeat', message_sent: _msgSent, message_received: _msgReceived });
  }

  // 登录成功事件（部分 NapCat 版本会发送 notice.login）
  if (event.post_type === 'notice' && event.notice_type === 'bot_online') {
    const uid = String(event.self_id || '');
    if (uid && uid !== '0') {
      await postLoginEvent('login', uid);
    }
  }

  // 掉线/登出事件
  if (event.post_type === 'notice' &&
      (event.notice_type === 'bot_offline' || event.sub_type === 'bot_offline')) {
    const uid = String(event.self_id || '');
    await postLoginEvent('logout', uid);
  }
};

export const plugin_cleanup = (ctx) => {
  if (_healthTimer) {
    clearInterval(_healthTimer);
    _healthTimer = null;
  }
  if (_hbWatchTimer) {
    clearInterval(_hbWatchTimer);
    _hbWatchTimer = null;
  }
  if (_wsPingTimer) {
    clearInterval(_wsPingTimer);
    _wsPingTimer = null;
  }
  if (_loginCheckTimer) {
    clearTimeout(_loginCheckTimer);
    _loginCheckTimer = null;
  }
  if (_wsReconnectTimer) {
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = null;
  }
  if (_ws) {
    _ws.onclose = null; // 防止触发重连
    try { _ws.close(); } catch { /* ignore */ }
    _ws = null;
  }
  _ctx = null;
  console.log('[ManagerLink] cleanup');
};
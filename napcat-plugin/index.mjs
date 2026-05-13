/**
 * NapCat Manager 互联插件
 *
 * 功能：监听 QQ 登录/登出事件，实时推送到 Manager 的 /api/internal/login-event 端点。
 * 配置来源优先级：containerName 环境变量优先，其余字段插件配置优先 > 环境变量降级
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

let _config = { managerUrl: '', internalKey: '', containerName: '' };
let _ctx = null;
let _loginCheckTimer = null;
let _heartbeatTimer = null;
let _msgSent = 0;
let _msgReceived = 0;

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
  const { managerUrl, internalKey, containerName } = _config;
  if (!managerUrl || !containerName) return;
  const url = `${managerUrl}/api/internal/login-event`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({ name: containerName, event, uin, nickname }),
    });
    if (_ctx) _ctx.logger.log(`[ManagerLink] POST ${event} uin=${uin} -> ${resp.status}`);
  } catch (e) {
    if (_ctx) _ctx.logger.log(`[ManagerLink] POST ${event} failed: ${e.message}`);
  }
}

async function checkAndReportLogin() {
  if (!_ctx || !_config.managerUrl) return;
  try {
    const info = await _ctx.actions.call(
      'get_login_info', {}, _ctx.adapterName, _ctx.pluginManager.config
    );
    const uid = String(info?.user_id || '');
    if (uid && uid !== '0') {
      await postLoginEvent('login', uid, info.nickname || '');
    }
  } catch (e) {
    if (_ctx) _ctx.logger.log(`[ManagerLink] login check failed: ${e.message}`);
  }
}

async function postHeartbeat() {
  const { managerUrl, internalKey, containerName } = _config;
  if (!managerUrl || !containerName || !_ctx) return;
  try {
    const payload = { name: containerName, message_sent: _msgSent, message_received: _msgReceived };
    const resp = await fetch(`${managerUrl}/api/internal/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey },
      body: JSON.stringify(payload),
    });
    if (_ctx) _ctx.logger.log(`[ManagerLink] heartbeat -> ${resp.status}`);
  } catch (e) {
    if (_ctx) _ctx.logger.log(`[ManagerLink] heartbeat failed: ${e.message}`);
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

// 自定义配置保存：写入 ctx.configPath，并热更新运行时配置
export const plugin_set_config = (ctx, config) => {
  try {
    writeFileSync(ctx.configPath, JSON.stringify(config, null, 2), 'utf-8');
    _config = resolveConfig(config);
    if (ctx) ctx.logger.log(`[ManagerLink] config updated: name=${_config.containerName}`);
  } catch (e) {
    if (ctx) ctx.logger.log(`[ManagerLink] save config failed: ${e.message}`);
  }
};

export const plugin_init = async (ctx) => {
  _ctx = ctx;
  const savedConfig = _readConfigFile(ctx.configPath);
  _config = resolveConfig(savedConfig);
  ctx.logger.log(`[ManagerLink] init: url=${_config.managerUrl} name=${_config.containerName}`);

  // 延迟 5s 后首次检测登录状态并上报（NapCat 启动后可能已自动登录）
  _loginCheckTimer = setTimeout(() => checkAndReportLogin(), 5000);

  // 每 30s 上报心跳
  _heartbeatTimer = setInterval(() => postHeartbeat(), 30000);
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
      // 延迟 2s 等待登录完成
      setTimeout(() => checkAndReportLogin(), 2000);
    }
  }

  // 心跳中检测 self_id 变化（换号检测）
  if (event.post_type === 'meta_event' && event.meta_event_type === 'heartbeat') {
    const uid = String(event.self_id || '');
    if (uid && uid !== '0') {
      // 心跳携带有效 self_id，说明已登录（轻量级，不额外 POST，由 lifecycle 触发）
    }
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
  if (_loginCheckTimer) {
    clearTimeout(_loginCheckTimer);
    _loginCheckTimer = null;
  }
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  _ctx = null;
  ctx.logger.log('[ManagerLink] cleanup');
};
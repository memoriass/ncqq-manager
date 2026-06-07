import { admin } from './zh/admin';
import { imageManager } from './zh/imageManager';
import { monitor } from './zh/monitor';
import { alerts } from './zh/alerts';
import { backup } from './zh/backup';
import { scheduler } from './zh/scheduler';
import { config } from './zh/config';
import { network } from './zh/network';
import { user } from './zh/user';
import { login } from './zh/login';
import { setup } from './zh/setup';
import { nodePanel } from './zh/nodePanel';
import { userMgmt } from './zh/userMgmt';
import { opLogs } from './zh/opLogs';
import { basicInfo } from './zh/basicInfo';
import { clusterConfig } from './zh/clusterConfig';
import { botManager } from './zh/botManager';
import { botshepherd } from './zh/botshepherd';
import { botBackend } from './zh/botBackend';

export const zh = {
    admin,
    imageManager,
    monitor,
    alerts,
    backup,
    scheduler,
    config,
    network,
    user,
    login,
    setup,
    nodePanel,
    userMgmt,
    opLogs,
    basicInfo,
    clusterConfig,
    botManager,
    botshepherd,
    botBackend,
} as const;

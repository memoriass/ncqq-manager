import { admin } from './en/admin';
import { imageManager } from './en/imageManager';
import { monitor } from './en/monitor';
import { alerts } from './en/alerts';
import { backup } from './en/backup';
import { scheduler } from './en/scheduler';
import { config } from './en/config';
import { network } from './en/network';
import { user } from './en/user';
import { login } from './en/login';
import { setup } from './en/setup';
import { nodePanel } from './en/nodePanel';
import { userMgmt } from './en/userMgmt';
import { opLogs } from './en/opLogs';
import { basicInfo } from './en/basicInfo';
import { clusterConfig } from './en/clusterConfig';
import { botManager } from './en/botManager';
import { botshepherd } from './en/botshepherd';
import { botBackend } from './en/botBackend';

export const en = {
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

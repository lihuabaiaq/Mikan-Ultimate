let ws = null;
let wsUrl = '';
let clientId = '';
let targetId = '';
let wrongAnswerCount = 0;
let channelStrength = { A: 0, B: 0 };
let softLimits = { A: 0, B: 0 };

let lastSubmitTime = 0;
let strengthBeforePunishment = { A: 0, B: 0 };
let isInPunishment = false;
let punishmentTimeout = null;
let hasRewardBeenAppliedThisPage = false; 

// 默认配置
const DEFAULT_CONFIG = {
    interval: 30,
    baseIncrease: 2,
    extraIncreaseFirst6: 3,
    punishLevels: [
        { strength: 20, duration: 3 },
        { strength: 25, duration: 5 },
        { strength: 30, duration: 8 },
        { strength: 40, duration: 10 },
        { strength: 50, duration: 15 }
    ],
    punishSubmitFail: {
        strength: 50,
        duration: 15
    },
    punishPostIncrease: 20,
    initialStrength: 0,
    rewardAmount: 20, 
    rewardOncePerProblem: false, 
    pauseButtonEnabled: true,
    resetOnSuccess: true,
    ratioA: 1.0,
    randomA: false,
    ratioB: 1.0,
    randomB: false
};

let config = { ...DEFAULT_CONFIG };

const waveData = {
    "1": `["0A0A0A0A00000000","0A0A0A0A0A0A0A0A","0A0A0A0A14141414","0A0A0A0A1E1E1E1E","0A0A0A0A28282828","0A0A0A0A32323232","0A0A0A0A3C3C3C3C","0A0A0A0A46464646","0A0A0A0A50505050","0A0A0A0A5A5A5A5A","0A0A0A0A64646464"]`,
    "2": `["0D0D0D0D0F0F0F0F","101010101E1E1E1E","1313131332323232","1616161641414141","1A1A1A1A50505050","1D1D1D1D64646464","202020205A5A5A5A","2323232350505050","262626264B4B4B4B","2A2A2A2A41414141"]`,
    "3": `["4A4A4A4A64646464","4545454564646464","4040404064646464","3B3B3B3B64646464","3636363664646464","3232323264646464","2D2D2D2D64646464","2828282864646464","2323232364646464","1E1E1E1E64646464","1A1A1A1A64646464"]`
};

let channelWaves = {
    A: "1",
    B: "1"
};

let isPulsing = false;

function loadConfig() {
    chrome.storage.local.get('config', (data) => {
        config = { ...DEFAULT_CONFIG, ...data.config };
        if (!config.punishLevels || config.punishLevels.length < 5) {
            config.punishLevels = DEFAULT_CONFIG.punishLevels;
        }
        console.log('[Background] 配置已加载:', config);
    });
}

function setStrength(strengthA, strengthB) {
    channelStrength.A = Math.min(strengthA, softLimits.A || 100);
    channelStrength.B = Math.min(strengthB, softLimits.B || 100);

    channelStrength.A = Math.max(channelStrength.A, 0);
    channelStrength.B = Math.max(channelStrength.B, 0);

    const strengthMsgA = {
        type: 4,
        message: `strength-1+2+${channelStrength.A}`
    };
    sendWsMessage(strengthMsgA);

    const strengthMsgB = {
        type: 4,
        message: `strength-2+2+${channelStrength.B}`
    };
    sendWsMessage(strengthMsgB);

    broadcastStatus();
}

function clearPunishment() {
    if (isInPunishment) {
        isInPunishment = false;
    }
    if (punishmentTimeout) {
        clearTimeout(punishmentTimeout);
        punishmentTimeout = null;
    }
}

// (*** 函数已修改 ***)
// 统一的状态重置逻辑
function resetState() {
    console.log('[Background] 执行状态重置 (刷新、新页面或 API 请求)');
    
    hasRewardBeenAppliedThisPage = false; 

    if (config.resetOnSuccess) {
        console.log('[Background] 重置错误计数');
        wrongAnswerCount = 0;
    }
    
    clearPunishment();
    
    console.log(`[Background] 设置初始强度: ${config.initialStrength}`);
    setStrength(config.initialStrength, config.initialStrength);
    
    // (*** 关键修复：新增 ***)
    // 通知所有 content.js 脚本重置它们的计时器
    chrome.tabs.query({}, function (tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'STATE_RESET'
            }).catch(() => { });
        });
    });
}

function applyPunishmentLogic(levelConfig) {
    if (isInPunishment) {
        console.log('[Background] 已经在惩罚中，跳过');
        return;
    }
    isInPunishment = true;
    if (punishmentTimeout) {
        clearTimeout(punishmentTimeout);
    }

    console.log('[Background] 当前惩罚配置:', levelConfig);

    strengthBeforePunishment.A = channelStrength.A;
    strengthBeforePunishment.B = channelStrength.B;

    const { amountA, amountB } = calculateRatios(levelConfig.strength);
    
    console.log(`[Background] 临时增加强度: A+${amountA}, B+${amountB}`);
    setStrength(strengthBeforePunishment.A + amountA, strengthBeforePunishment.B + amountB);

    const durationMs = levelConfig.duration * 1000;
    punishmentTimeout = setTimeout(() => {
        const postIncrease = config.punishPostIncrease;
        console.log(`[Background] 惩罚持续时间结束，将在 (${strengthBeforePunishment.A}, ${strengthBeforePunishment.B}) 基础上永久增加 ${postIncrease}`);
        
        const { amountA: postAmountA, amountB: postAmountB } = calculateRatios(postIncrease);
        console.log(`[Background] 永久增加: A+${postAmountA}, B+${postAmountB}`);
        setStrength(strengthBeforePunishment.A + postAmountA, strengthBeforePunishment.B + postAmountB);
        
        isInPunishment = false;
        punishmentTimeout = null;
    }, durationMs);
}

function executePunishment() {
    console.log('[Background] 开始执行运行失败惩罚（会计数）');
    wrongAnswerCount++;
    const maxLevel = config.punishLevels.length;
    const levelIndex = Math.min(wrongAnswerCount, maxLevel) - 1;
    const levelConfig = config.punishLevels[levelIndex];
    
    console.log(`[Background] 错误次数: ${wrongAnswerCount}, 等级: ${levelIndex + 1}`);
    applyPunishmentLogic(levelConfig);
}

function executePunishmentLevel5() {
    console.log('[Background] 开始执行提交失败惩罚 (独立于计数器)');
    const levelConfig = config.punishSubmitFail;
    applyPunishmentLogic(levelConfig);
}

function calculateRatios(baseAmount) {
    let ratioA = config.ratioA;
    let ratioB = config.ratioB;

    if (config.randomA) {
        ratioA = (Math.random() * 1.0) + 0.5; // 0.5 到 1.5
    }
    if (config.randomB) {
        ratioB = (Math.random() * 1.0) + 0.5; // 0.5 到 1.5
    }
    
    let amountA = Math.round(baseAmount * ratioA);
    let amountB = Math.round(baseAmount * ratioB);
    
    return { amountA, amountB };
}


function sendWsMessage(messageObj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    if (!targetId) {
        return;
    }
    messageObj.clientId = clientId;
    messageObj.targetId = targetId;
    if (!messageObj.hasOwnProperty('type')) {
        messageObj.type = "msg";
    }
    const finalMessage = JSON.stringify(messageObj);
    ws.send(finalMessage);
}

chrome.storage.local.get(['clientId', 'targetId'], function (result) {
    if (result.clientId) clientId = result.clientId;
    if (result.targetId) targetId = result.targetId;
});

function connectWebSocket() {
    if (!wsUrl) {
        console.log('[WebSocket] 未设置WebSocket地址，无法连接');
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (ws) {
        ws.close();
        ws = null;
    }
    ws = new WebSocket(wsUrl);
    ws.onopen = function () {
        console.log('[WebSocket] 连接成功建立');
        broadcastStatus();
    };
    ws.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'bind') {
                clientId = data.clientId;
                targetId = data.targetId;
                chrome.storage.local.set({
                    clientId: clientId,
                    targetId: targetId
                });
                broadcastStatus();
            }
            else if (data.type === 'msg' && data.message.startsWith('strength-')) {
                const [cmd, params] = data.message.split('-');
                const [strengthA, strengthB, softLimitA, softLimitB] = params.split('+').map(Number);
                
                if (!isInPunishment) {
                    channelStrength.A = strengthA;
                    channelStrength.B = strengthB;
                }
                softLimits.A = softLimitA;
                softLimits.B = softLimitB;
                broadcastStatus();
            }
        } catch (e) {
            console.error('[WebSocket] 解析消息失败:', e);
        }
    };
    ws.onclose = function () {
        console.log('[WebSocket] 连接已关闭');
        ws = null;
        setTimeout(connectWebSocket, 3000);
        broadcastStatus();
    };
    ws.onerror = function (error) {
        console.error('[WebSocket] 错误:', error);
        broadcastStatus();
    };
}

function broadcastStatus() {
    const status = {
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        clientId: clientId,
        targetId: targetId,
        channelStrength: channelStrength,
        softLimits: softLimits,
        channelWaves: channelWaves,
        isPulsing: isPulsing
    };

    // 向 popup 广播
    chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        status: status
    }).catch(() => { });

    // 向 content script (所有tab) 广播完整的状态
    chrome.tabs.query({}, function (tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'STATUS_UPDATE',
                status: status 
            }).catch(() => { });
        });
    });
}

console.log('[Background] Service Worker 启动');
loadConfig(); 

chrome.storage.local.get(['wsUrl'], function (result) {
    if (result.wsUrl) {
        wsUrl = result.wsUrl;
        console.log('[Background] 从storage加载WebSocket地址:', wsUrl);
        connectWebSocket();
    } else {
        console.log('[Background] 未找到保存的WebSocket地址，等待用户设置');
        broadcastStatus();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.config) {
        console.log('[Background] 检测到配置更新，重新加载...');
        loadConfig();
    }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] 收到消息:', message, '来自:', sender);

    if (message.type === 'GET_STATUS') {
        const status = {
            wsConnected: ws && ws.readyState === WebSocket.OPEN,
            clientId: clientId,
            targetId: targetId,
            channelStrength: channelStrength,
            softLimits: softLimits,
            channelWaves: channelWaves,
            isPulsing: isPulsing
        };
        sendResponse(status);
    }
    else if (message.type === 'OPEN_SETTINGS') {
        const url = chrome.runtime.getURL('settings.html');
        chrome.tabs.query({ url: url }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
            } else {
                chrome.tabs.create({ url: url });
            }
        });
    }
    else if (message.type === 'CONFIG_UPDATED') {
        loadConfig(); 
    }
    else if (message.type === 'RECONNECT') {
        connectWebSocket();
        sendResponse({ status: 'reconnecting' });
    }
    else if (message.type === 'UPDATE_WS_URL') {
        const newUrl = message.url;
        if (!newUrl) {
            sendResponse({ status: 'error', message: '地址不能为空' });
            return;
        }
        wsUrl = newUrl;
        if (ws) {
            ws.close();
            ws = null;
        }
        connectWebSocket();
        sendResponse({ status: 'url_updated' });
    }
    else if (message.type === 'SET_CHANNEL_STRENGTH') {
        const { channel, strength } = message;
        
        if (isInPunishment) {
            broadcastStatus();
            sendResponse({ status: 'ignored_during_punishment' });
            return;
        }

        channelStrength[channel] = strength;
        const strengthMsg = {
            type: 4,
            message: `strength-${channel === 'A' ? '1' : '2'}+2+${strength}`
        };
        sendWsMessage(strengthMsg);
        broadcastStatus();
        sendResponse({ status: 'strength_updated' });
    }
    else if (message.type === 'SET_STRENGTH_COMMAND') {
        if (isInPunishment) {
            broadcastStatus(); 
            sendResponse({ status: 'ignored_during_punishment' });
            return;
        }
        setStrength(message.A, message.B);
        sendResponse({ status: 'strength_set' });
    }
    else if (message.type === 'SET_CHANNEL_WAVE') {
        const { channel, wave } = message;
        channelWaves[channel] = wave;
        if (isPulsing) {
            const clearMsg = {
                type: 4,
                message: `clear-${channel === 'A' ? '1' : '2'}`
            };
            sendWsMessage(clearMsg);
            setTimeout(() => {
                const waveMsg = {
                    type: "clientMsg",
                    message: `${channel}:${waveData[wave]}`,
                    time: 60,
                    channel: channel
                };
                sendWsMessage(waveMsg);
            }, 100);
        }
        sendResponse({ status: 'wave_saved' });
    }
    else if (message.type === 'INCREASE_STRENGTH') {
        if (isInPunishment) {
            return;
        }
        
        const { amountA, amountB } = calculateRatios(message.amount);
        
        console.log(`[Background] 自动增长: 基础 ${message.amount}, A+${amountA}, B+${amountB}`);
        
        let newA = (amountA > 0) 
            ? Math.min(channelStrength.A + amountA, softLimits.A || 100) 
            : Math.max(channelStrength.A + amountA, 0);
            
        let newB = (amountB > 0) 
            ? Math.min(channelStrength.B + amountB, softLimits.B || 100) 
            : Math.max(channelStrength.B + amountB, 0);
    
        setStrength(newA, newB);
    }
    else if (message.type === 'START_PULSE') {
        isPulsing = true;
        broadcastStatus();
        setTimeout(() => {
            const waveDataA = {
                type: "clientMsg",
                message: `A:${waveData[channelWaves.A]}`,
                time: 60,
                channel: "A"
            };
            sendWsMessage(waveDataA);
            const waveDataB = {
                type: "clientMsg",
                message: `B:${waveData[channelWaves.B]}`,
                time: 60,
                channel: "B"
            };
            sendWsMessage(waveDataB);
        }, 100);
    }
    else if (message.type === 'DISCONNECT') {
        isPulsing = false;
        if (ws) {
            ws.close();
            ws = null;
        }
        broadcastStatus();
    }
    return true;
});


let lastFetchTime = 0;
const FETCH_INTERVAL = 5000;

// 监听 "提交" 动作
chrome.webRequest.onCompleted.addListener(
    function(details) {
        if (details.method === "POST" && details.url.includes('/submit/')) {
            console.log('[Background] 检测到提交动作');
            lastSubmitTime = Date.now();
        }
    },
    {
        urls: ["https://leetcode.cn/problems/*/submit/"]
    }
);


// 监听 "检查" 动作
chrome.webRequest.onCompleted.addListener(
    function (details) {
        if (details.method === "GET" && details.url.includes('check')) {
            const now = Date.now();
            
            if (now - lastFetchTime < FETCH_INTERVAL) {
                console.log('[Background] 忽略5秒内的重复检查');
                return;
            }
            lastFetchTime = now;
            
            function checkSubmission() {
                fetch(details.url)
                    .then(response => response.json())
                    .then(data => {
                        console.log('[Background] 检查结果:', data);
                        
                        if (data.state === "STARTED" || data.state === "PENDING") {
                            console.log('[Background] 提交仍在进行中，1秒后重试');
                            setTimeout(checkSubmission, 1000);
                            return;
                        }

                        const isRecentSubmit = (Date.now() - lastSubmitTime < 3000);
                        let notificationType = null;

                        if (data.run_success === false) {
                            if (isRecentSubmit) {
                                console.log('[Background] 检测到提交失败，进行惩罚');
                                executePunishmentLevel5();
                            } else {
                                console.log('[Background] 检测到运行失败 ，惩罚');
                                executePunishment();
                            }
                            notificationType = 'PUNISHMENT';

                        } else if (data.run_success === true) {
                            if (isRecentSubmit) {
                                console.log('[Background] 检测到提交成功，重置状态');
                                resetState(); 
                            } else {
                                console.log('[Background] 检测到运行成功，正常奖励');
                                if (!isInPunishment) {
                                    
                                    if (config.rewardOncePerProblem && hasRewardBeenAppliedThisPage) {
                                        console.log('[Background] 奖励已在本页应用过，跳过');
                                    } else {
                                        const { amountA, amountB } = calculateRatios(-config.rewardAmount); // 使用配置值
                                        console.log(`[Background] 应用奖励: A${amountA}, B${amountB}`);
                                        let newA = Math.max(channelStrength.A + amountA, 0);
                                        let newB = Math.max(channelStrength.B + amountB, 0);
                                        setStrength(newA, newB);
                                        hasRewardBeenAppliedThisPage = true; // 标记已应用
                                    }
                                }
                            }
                            notificationType = 'REWARD';
                        }

                        if (notificationType) {
                            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                                if (tabs[0]) {
                                    chrome.tabs.sendMessage(tabs[0].id, { 
                                        type: 'SHOW_NOTIFICATION',
                                        notificationType: notificationType,
                                    });
                                }
                            });
                        }
                    })
                    .catch(e => {
                        console.error('[Background] 解析响应失败:', e);
                    });
            }
            checkSubmission();
        }
    },
    {
        urls: ["https://leetcode.cn/submissions/detail/*/check/"]
    }
);

// 页面跳转/刷新时的逻辑
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0 && details.url.includes('leetcode.cn')) {
        // 导航到任何 leetcode 页面都会触发重置
        resetState();
    }
});

// 监听 Sentry (lingkou.xyz) API 请求
chrome.webRequest.onCompleted.addListener(
    function(details) {
        console.log('[Background] 检测到题目更换，执行状态重置');
        resetState();
    },
    {
        urls: ["https://sentry1.lingkou.xyz/api/2/envelope/*"]
    }
);
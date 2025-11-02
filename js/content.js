console.log('[Content] 脚本开始加载');

// 状态变量
let strengthIncreaseTimeout = null;
let displayTimerInterval = null;
let isPaused = false;
let strengthBeforePause = { A: 0, B: 0 };
let globalStartTime = 0;
let pauseStartTime = 0;
let totalPausedTime = 0;
let strengthCycleStartTime = 0;
let strengthCycleTimeRemaining = 0;
let intervalCount = 0;
let lastIncreaseNotify = 0;
let isUIConnected = false; 

// 默认配置，修复启动时的竞态条件
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

let config = { ...DEFAULT_CONFIG }; // 立即使用默认值初始化

let recentMessages = [];
let lastUpdate = {
    A: { time: 0, actualValue: 0 },
    B: { time: 0, actualValue: 0 }
};
const UPDATE_THROTTLE = 500;

const PUNISHMENT_MESSAGES = [
    "哼哼～这点惩罚可不够呢～想要更多吗？",
    "啊～又做错了呢，该好好惩罚一下了～",
    "诶嘿～这就是错误的代价哦～",
    "呜呜～怎么又错了，要加倍惩罚才行呢～",
    "笨笨的～这样下去会被玩坏的哦～",
    "嘻嘻～这么喜欢被惩罚吗？",
    "啊啦啦～看来还需要更多管教呢～",
    "不乖的孩子就要接受惩罚哦～",
    "真是个小笨蛋呢，这么简单都能错～",
    "呐呐～这样的惩罚还受得了吗？",
    "哎呀～又要惩罚你了呢～",
    "这么喜欢犯错的话，人家就不客气了哦～"
];
const REWARD_MESSAGES = [
    "真棒呢～这次就稍微奖励一下吧～",
    "啊～太厉害了呢～",
    "诶嘿～做得好棒，要给奖励哦～",
    "呜呜～好厉害，让人家好感动～",
    "真是个天才呢～这题都能做对～",
    "嘻嘻～乖孩子就要给糖吃哦～",
    "啊啦啦～看来进步了呢～",
    "好孩子值得奖励呢～",
    "真是太聪明了，这么快就做对了～",
    "呐呐～这样的奖励喜欢吗？",
    "做得不错呢～让人家好开心～",
    "真是个优秀的孩子呢～"
];
const STRENGTH_INCREASE_MESSAGES = [
    "哼哼～强度要上升了哦～",
    "啊啦～变得更强了呢～还能继续吗？",
    "还不够呢～让人家继续加强吧～",
    "这样的强度还不够呢～再增加一点～",
    "乖巧的孩子要接受更多惩罚呢～",
    "感受到了吗？人家在慢慢加重哦～",
    "这点程度应该还可以继续吧？",
    "嘻嘻～让我们再增加一点点～",
    "呐呐～强度又要提升了呢～",
    "人家温柔地增加强度中～",
    "时间越久越舒服对吧～",
    "让人家帮你调高一点呢～"
];

function getRandomMessage(type) {
    let messages;
    switch(type) {
        case 'punishment':
            messages = PUNISHMENT_MESSAGES;
            break;
        case 'reward':
            messages = REWARD_MESSAGES;
            break;
        case 'increase':
            messages = STRENGTH_INCREASE_MESSAGES;
            break;
    }
    return messages[Math.floor(Math.random() * messages.length)];
}


// 新增：拖动 和 最小化
function createStrengthDisplay() {
    const display = document.createElement('div');
    display.id = 'strength-display';
    display.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(253, 242, 248, 0.95);
        color: #abb2bf;
        padding: 15px 20px;
        border-radius: 15px;
        z-index: 10000;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 15px rgba(255, 182, 193, 0.2);
        backdrop-filter: blur(5px);
        border: 1px solid rgba(255, 182, 193, 0.3);
        min-width: 200px;
        transition: all 0.3s ease;
    `;

    // 注入拖动和最小化的 CSS
    const style = document.createElement('style');
    style.textContent = `
        .strength-display-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 192, 203, 0.3);
            padding-bottom: 8px;
        }
        /* (*** 修复 ***) 仅在未最小化时才给body加 margin-bottom */
        #strength-display:not(.minimized) .strength-display-header {
            margin-bottom: 10px;
        }
        .strength-display-header-title {
            font-weight: 600;
            color: #ff6b8b;
            font-size: 15px;
            letter-spacing: 1px;
            cursor: grab;
            flex-grow: 1;
            user-select: none;
        }
        .strength-display-header-title:active {
            cursor: grabbing;
        }
        #strength-minimize-btn {
            background: none;
            border: none;
            color: #ff8fa3;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            padding: 0 5px;
            line-height: 1;
        }
        /* (*** 关键修复 ***) */
        /* 隐藏新的 "body" 容器，而不是所有子元素 */
        #strength-display.minimized > #strength-display-body {
            display: none;
        }
    `;
    document.head.appendChild(style);

    // 创建新的可拖动标题栏
    const header = document.createElement('div');
    header.className = 'strength-display-header';

    const title = document.createElement('span');
    title.className = 'strength-display-header-title';
    title.innerHTML = '💗 状态 💗';
    
    const minimizeBtn = document.createElement('button');
    minimizeBtn.id = 'strength-minimize-btn';
    minimizeBtn.innerHTML = '—'; // 最小化按钮

    header.appendChild(title);
    header.appendChild(minimizeBtn);
    display.appendChild(header);
    

    // 创建“魔法口袋”（body 容器）
    const bodyContainer = document.createElement('div');
    bodyContainer.id = 'strength-display-body';
    
    // 最小化逻辑
    minimizeBtn.onclick = (e) => {
        e.stopPropagation(); // 防止触发拖动
        const isMinimized = display.classList.toggle('minimized');
        minimizeBtn.innerHTML = isMinimized ? '＋' : '—';
    };

    // 拖动逻辑
    let isDragging = false;
    let offsetX, offsetY;
    let hasMoved = false; 

    title.onmousedown = (e) => {
        isDragging = true;
        hasMoved = false; 
        
        if (display.style.right) {
            display.style.left = `${display.offsetLeft}px`;
            display.style.right = ''; 
        }
        
        offsetX = e.clientX - display.getBoundingClientRect().left;
        offsetY = e.clientY - display.getBoundingClientRect().top;
        title.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        document.onmousemove = (moveEvent) => {
            if (!isDragging) return;
            hasMoved = true;
            
            let newX = moveEvent.clientX - offsetX;
            let newY = moveEvent.clientY - offsetY;

            newX = Math.max(0, Math.min(newX, window.innerWidth - display.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - display.offsetHeight));

            display.style.left = `${newX}px`;
            display.style.top = `${newY}px`;
        };

        document.onmouseup = () => {
            isDragging = false;
            title.style.cursor = 'grab';
            document.body.style.userSelect = '';
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
    
    // 初始显示“未连接”，并将其放入 body 容器
    const disconnectedNotice = document.createElement('div');
    disconnectedNotice.id = 'connection-status-overlay';
    disconnectedNotice.textContent = '🔌 未连接...';
    disconnectedNotice.style.cssText = `
        color: #e53e3e;
        font-weight: 500;
        text-align: center;
        padding: 10px 0;
    `;
    bodyContainer.appendChild(disconnectedNotice); // <-- 放入 body 容器

    display.appendChild(bodyContainer); // <-- 将 body 容器放入 display
    document.body.appendChild(display);

    display.onmouseover = () => {
        if (isDragging) return;
        display.style.transform = 'translateY(2px)';
        display.style.boxShadow = '0 6px 20px rgba(255, 182, 193, 0.3)';
    };
    display.onmouseout = () => {
        if (isDragging) return;
        display.style.transform = 'translateY(0)';
        display.style.boxShadow = '0 4px 15px rgba(255, 182, 193, 0.2)';
    };
}


// 当连接时，构建完整的UI
function buildConnectedUI() {

    // 找到 body 容器，而不是 display
    const bodyContainer = document.getElementById('strength-display-body');
    if (!bodyContainer) return;

    // 清空 body 容器 (移除“未连接”提示)
    bodyContainer.innerHTML = '';

    // 创建所有组件
    const channelA = createChannelDisplay('A通道', 'strength-a');
    const channelB = createChannelDisplay('B通道', 'strength-b');
    const timer = createTimerDisplay();
    
    // 将所有组件添加到 body 容器
    bodyContainer.appendChild(channelA);
    bodyContainer.appendChild(channelB);
    bodyContainer.appendChild(timer);

    if (config.pauseButtonEnabled) {
        const pauseButton = document.createElement('button');
        pauseButton.id = 'pause-button';
        pauseButton.textContent = '停止';
        pauseButton.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            margin-top: 10px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
            background: #ff8fa3;
            color: white;
            font-size: 14px;
        `;
        
        pauseButton.onmouseover = () => {
            if (!isPaused) {
                pauseButton.style.background = '#ff6b8b'; 
            } else {
                pauseButton.style.background = '#98c379'; 
            }
        };
        pauseButton.onmouseout = () => {
            if (!isPaused) {
                pauseButton.style.background = '#ff8fa3'; 
            } else {
                pauseButton.style.background = '#b5e895'; 
            }
        };
        
        pauseButton.onclick = () => {
            if (isPaused) {
                resumeTimers();
            } else {
                pauseTimers();
            }
        };
        bodyContainer.appendChild(pauseButton); // <-- 放入 body 容器
    }
    
    isUIConnected = true;
}

// (*** 函数已修改 ***)
// 当断开连接时，销毁UI，显示“未连接”
function destroyConnectedUI() {
    // (*** 修改 ***)
    // 找到 body 容器
    const bodyContainer = document.getElementById('strength-display-body');
    if (!bodyContainer) return;

    // (*** 修改 ***)
    // 清空 body 容器
    bodyContainer.innerHTML = '';

    // 添加“未连接”提示
    const disconnectedNotice = document.createElement('div');
    disconnectedNotice.id = 'connection-status-overlay';
    disconnectedNotice.textContent = '🔌 未连接...';
    disconnectedNotice.style.cssText = `
        color: #e53e3e;
        font-weight: 500;
        text-align: center;
        padding: 10px 0;
    `;
    bodyContainer.appendChild(disconnectedNotice); // <-- 放入 body 容器
    
    isUIConnected = false;
}


function createChannelDisplay(label, id) {
    const container = document.createElement('div');
    //添加 ID 以便销毁
    container.id = id + '-container'; 
    container.style.cssText = `
        margin: 8px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    const labelSpan = document.createElement('span');
    if (label === 'A通道') {
        labelSpan.innerHTML = '🌸 A通道强度';
    } else {
        labelSpan.innerHTML = '🌺 B通道强度';
    }
    labelSpan.style.color = '#98c379';

    const valueSpan = document.createElement('span');
    valueSpan.id = id;
    valueSpan.textContent = '0';
    valueSpan.style.cssText = `
        font-weight: 600;
        color: #e06c75;
        min-width: 30px;
        text-align: right;
        transition: all 0.3s ease;
        position: relative;
        display: inline-block;
    `;

    container.appendChild(labelSpan);
    container.appendChild(valueSpan);
    return container;
}

function createTimerDisplay() {
    const container = document.createElement('div');
    // 添加 ID 以便销毁
    container.id = 'timer-container';
    container.style.cssText = `
        margin-top: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 8px;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.innerHTML = '⏰ 该题已经使用';
    labelSpan.style.color = '#98c379';

    const timeContainer = document.createElement('div');
    timeContainer.style.display = 'flex';
    timeContainer.style.alignItems = 'center';

    const valueSpan = document.createElement('span');
    valueSpan.id = 'time-elapsed';
    valueSpan.textContent = '0';
    valueSpan.style.cssText = `
        font-weight: 600;
        color: #61afef;
        min-width: 30px;
        text-align: right;
        margin-right: 3px;
    `;

    const unitSpan = document.createElement('span');
    unitSpan.textContent = '秒';
    unitSpan.style.color = '#61afef';

    timeContainer.appendChild(valueSpan);
    timeContainer.appendChild(unitSpan);

    container.appendChild(labelSpan);
    container.appendChild(timeContainer);
    return container;
}

function calculateStrengthIncrease(elapsed) {
    const minutes = elapsed / 60000;
    let increase;
    if (minutes <= 5) {
        increase = minutes * 2;
    } else if (minutes <= 15) {
        increase = 10 + (minutes - 5) * 3;
    } else {
        increase = 40 + Math.pow(minutes - 15, 1.5) * 2;
    }
    return Math.min(Math.round(increase), 100);
}

// ----------------------------------------------------------------
// (*** 计时器核心逻辑 ***)

function pauseTimers() {
    if (isPaused) return;
    isPaused = true;
    console.log('[Content] 计时器已暂停');

    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) {
        pauseButton.textContent = '恢复';
        pauseButton.style.background = '#b5e895'; // 绿色
    }

    strengthBeforePause.A = lastUpdate.A.actualValue;
    strengthBeforePause.B = lastUpdate.B.actualValue;

    chrome.runtime.sendMessage({ type: 'SET_STRENGTH_COMMAND', A: 0, B: 0 });

    clearInterval(displayTimerInterval);
    displayTimerInterval = null;

    clearTimeout(strengthIncreaseTimeout); 
    strengthIncreaseTimeout = null;

    pauseStartTime = Date.now();
    
    let timeElapsedInCycle = pauseStartTime - strengthCycleStartTime;
    strengthCycleTimeRemaining = ((config.interval || 30) * 1000) - timeElapsedInCycle;
    
    console.log(`[Content] 暂停。加S周期还剩: ${strengthCycleTimeRemaining}ms`);
}

function resumeTimers() {
    if (!isPaused) return;
    isPaused = false;
    console.log('[Content] 计时器已恢复');

    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) {
        pauseButton.textContent = '停止';
        pauseButton.style.background = '#ff8fa3'; // 粉色
    }

    totalPausedTime += (Date.now() - pauseStartTime);
    pauseStartTime = 0;

    chrome.runtime.sendMessage({ type: 'SET_STRENGTH_COMMAND', A: strengthBeforePause.A, B: strengthBeforePause.B });

    startDisplayTimer();
    
    console.log(`[Content] 恢复。在 ${strengthCycleTimeRemaining}ms 后触发下一次加S`);
    strengthIncreaseTimeout = setTimeout(triggerStrengthIncrease, strengthCycleTimeRemaining);
}

function startDisplayTimer() {
    if (displayTimerInterval) clearInterval(displayTimerInterval);
    
    let timeDisplay = document.getElementById('time-elapsed');

    if (timeDisplay) {
        const elapsed = Date.now() - globalStartTime - totalPausedTime;
        timeDisplay.textContent = Math.floor(elapsed / 1000);
    }

    displayTimerInterval = setInterval(() => {
        if (!timeDisplay) {
            timeDisplay = document.getElementById('time-elapsed');
            if (!timeDisplay) return;
        }
        const elapsed = Date.now() - globalStartTime - totalPausedTime;
        timeDisplay.textContent = Math.floor(elapsed / 1000);
    }, 1000);
}

function triggerStrengthIncrease() {
    if (isPaused) return; 
    
    intervalCount++; 
    strengthCycleStartTime = Date.now();
    const elapsed = Date.now() - globalStartTime - totalPausedTime;

    const newIncrease = calculateStrengthIncrease(elapsed);
    if (newIncrease > lastIncreaseNotify) {
        const message = getRandomMessage('increase');
        showNotification('info', message);
        lastIncreaseNotify = newIncrease;
    }

    let amountToIncrease = config.baseIncrease;
    if (intervalCount <= 6) {
        amountToIncrease += config.extraIncreaseFirst6;
    }

    if (typeof config.baseIncrease === 'undefined' || typeof config.extraIncreaseFirst6 === 'undefined') {
        console.error('[Content] 配置未加载就触发了计时器! 使用默认值 2+3');
        amountToIncrease = 2 + (intervalCount <= 6 ? 3 : 0);
    }

    console.log(`[Content] 触发自动增长: 第 ${intervalCount} 次, 基础 ${config.baseIncrease}, 额外 ${intervalCount <= 6 ? config.extraIncreaseFirst6 : 0}, 总 ${amountToIncrease}`);

    chrome.runtime.sendMessage({ 
        type: 'INCREASE_STRENGTH',
        amount: amountToIncrease
    });
    
    const intervalMs = (config.interval || 30) * 1000;
    strengthIncreaseTimeout = setTimeout(triggerStrengthIncrease, intervalMs);
}


function stopAndResetAllTimers() {
    console.log('[Content] 停止并重置所有计时器和计数器...');
    
    clearInterval(displayTimerInterval);
    clearTimeout(strengthIncreaseTimeout);
    displayTimerInterval = null;
    strengthIncreaseTimeout = null;

    globalStartTime = 0;
    pauseStartTime = 0;
    totalPausedTime = 0;
    strengthCycleStartTime = 0;
    strengthCycleTimeRemaining = 0;
    
    intervalCount = 0;
    lastIncreaseNotify = 0;
    
    isPaused = false;
    
    const timeDisplay = document.getElementById('time-elapsed');
    if (timeDisplay) {
        timeDisplay.textContent = '0';
    }
}

function initializeTimers() {
    if (globalStartTime > 0) {
        console.log('[Content] 计时器已在运行，跳过初始化');
        return; 
    }

    globalStartTime = Date.now();
    strengthCycleStartTime = Date.now(); 

    startDisplayTimer();
    
    const intervalMs = (config.interval || 30) * 1000;
    console.log(`[Content] 调度第一次强度增长 (在 ${intervalMs}ms 后)`);
    strengthIncreaseTimeout = setTimeout(triggerStrengthIncrease, intervalMs);

    chrome.runtime.sendMessage({ 
        type: 'START_PULSE'
    });
    setInterval(() => {
        if (isPaused) return; 
        chrome.runtime.sendMessage({ 
            type: 'START_PULSE'
        });
    }, 60000);
}
// ----------------------------------------------------------------

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === 'STATUS_UPDATE') {
        const status = message.status;
        const isFullyConnected = status.wsConnected && status.clientId && status.targetId;

        if (isFullyConnected) {
            // 已连接
            if (!isUIConnected) {
                // 刚连接上：构建UI并启动计时器
                console.log('[Content] 状态变为已连接, 构建UI并启动计时器');
                buildConnectedUI();
                initializeTimers();
            }
            // 持续连接：更新强度
            const strengthAElement = document.getElementById('strength-a');
            const strengthBElement = document.getElementById('strength-b');
            if (strengthAElement && strengthBElement) {
                updateStrengthWithAnimation(strengthAElement, status.channelStrength.A || 0);
                updateStrengthWithAnimation(strengthBElement, status.channelStrength.B || 0);
            }
        } else {
            // 未连接
            if (isUIConnected) {
                // 刚断开：销毁UI并停止计时器
                console.log('[Content] 状态变为未连接, 销毁UI并停止计时器');
                destroyConnectedUI();
                stopAndResetAllTimers();
            }
        }
    }
    else if (message.type === 'SHOW_NOTIFICATION') {
        if (message.notificationType === 'PUNISHMENT') {
            showPunishmentMessage();
        } else if (message.notificationType === 'REWARD') {
            showRewardMessage();
        }
    }
    else if (message.type === 'STATE_RESET') {
        console.log('[Content] 收到 STATE_RESET 命令，重启计时器...');
        // 只有在UI已经连接的情况下才执行重置
        if (isUIConnected) {
            stopAndResetAllTimers(); // 停止并清零所有计数器
            initializeTimers();    // 重新从0开始
        }
    }
});

function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 20px;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10001;
        animation: notification-slide-in 0.3s ease-out, notification-slide-out 0.3s ease-in 2.7s;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        backdrop-filter: blur(5px);
    `;

    if (type === 'success') {
        notification.style.background = 'rgba(255, 241, 242, 0.95)';
        notification.style.border = '1px solid #fecdd3';
        notification.style.color = '#e11d48';
        message = `✨ ${message}`;
    } else if (type === 'error') {
        notification.style.background = 'rgba(253, 242, 248, 0.95)';
        notification.style.border = '1px solid #fbcfe8';
        notification.style.color = '#be185d';
        message = `💕 ${message}`;
    } else if (type === 'info') {
        notification.style.background = 'rgba(243, 244, 246, 0.95)';
        notification.style.border = '1px solid #e5e7eb';
        notification.style.color = '#ff6b8b';
        message = `💝 ${message}`;
    }

    notification.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes notification-slide-in {
            from {
                transform: translate(-50%, -100%);
                opacity: 0;
            }
            to {
                transform: translate(-50%, 0);
                opacity: 1;
            }
        }
        @keyframes notification-slide-out {
            from {
                transform: translate(-50%, 0);
                opacity: 1;
            }
            to {
                transform: translate(-50%, -100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);
    setTimeout(() => notification.style.opacity = '1', 0);
    setTimeout(() => notification.remove(), 3000);
}

function updateStrengthWithAnimation(element, newValue) {
    if (!element) return;
    
    const channel = element.id === 'strength-a' ? 'A' : 'B';
    const now = Date.now();

    lastUpdate[channel].actualValue = newValue;

    if (isPaused && newValue !== 0) {
        strengthBeforePause[channel] = newValue;
    }

    if (now - lastUpdate[channel].time < UPDATE_THROTTLE) {
        if (!lastUpdate[channel].timeoutId) {
            lastUpdate[channel].timeoutId = setTimeout(() => {
                lastUpdate[channel].timeoutId = null;
                const displayValue = parseInt(element.textContent);
                if (displayValue !== lastUpdate[channel].actualValue) {
                    updateStrengthWithAnimation(element, lastUpdate[channel].actualValue);
                }
            }, UPDATE_THROTTLE);
        }
        return;
    }

    const oldValue = parseInt(element.textContent);
    if (oldValue === newValue) return;

    lastUpdate[channel].time = now;

    element.style.transform = 'scale(1.2)';
    setTimeout(() => element.style.transform = 'scale(1)', 300);

    if (newValue > oldValue) {
        element.style.color = '#f43f5e';
        element.style.textShadow = '0 0 8px rgba(244, 63, 94, 0.5)';
    } else if (newValue < oldValue) {
        element.style.color = '#22c55e';
        element.style.textShadow = '0 0 8px rgba(34, 197, 94, 0.5)';
    }

    setTimeout(() => {
        element.style.color = '#e06c75';
        element.style.textShadow = 'none';
    }, 300);

    element.textContent = newValue;

    const ripple = document.createElement('span');
    ripple.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 20px;
        height: 20px;
        background: currentColor;
        border-radius: 50%;
        opacity: 0.5;
        pointer-events: none;
        animation: ripple 0.6s ease-out;
    `;

    if (!document.querySelector('#ripple-style')) {
        const style = document.createElement('style');
        style.id = 'ripple-style';
        style.textContent = `
            @keyframes ripple {
                from {
                    transform: translate(-50%, -50%) scale(0);
                    opacity: 0.5;
                }
                to {
                    transform: translate(-50%, -50%) scale(2);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    element.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

function initialize() {
    console.log('[Content] 开始初始化');
    
    chrome.storage.local.get('config', (data) => {
        config = { ...DEFAULT_CONFIG, ...data.config }; 
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeAfterLoad);
        } else {
            initializeAfterLoad();
        }
    });
}

function initializeAfterLoad() {
    console.log('[Content] DOM已加载，开始创建UI');
    
    if (window.location.pathname.includes('/problems/')) {
        console.log('[Content] 检测到题目页面');
        if (!document.getElementById('strength-display')) {
            createStrengthDisplay();
        }
        // 不再立即启动计时器。
        // 等待来自 background.js 的第一个 'STATUS_UPDATE' 消息。
    } else {
        console.log('[Content] 不是题目页面，跳过初始化');
    }
}

function showPunishmentMessage() {
    const message = getRandomMessage('punishment');
    showNotification('error', message);
}

function showRewardMessage() {
    const message = getRandomMessage('reward');
    showNotification('success', message);
}

initialize();
// (*** 默认配置已修改 ***)
const DEFAULT_CONFIG = {
    interval: 30,
    baseIncrease: 2,
    extraIncreaseFirst6: 3,
    
    // 运行失败惩罚 (5级)
    punishLevels: [
        { strength: 20, duration: 3 },
        { strength: 25, duration: 5 },
        { strength: 30, duration: 8 },
        { strength: 40, duration: 10 },
        { strength: 50, duration: 15 }
    ],
    
    // "提交失败" 惩罚
    punishSubmitFail: {
        strength: 50,
        duration: 15
    },
    
    // 惩罚后效
    punishPostIncrease: 20,
    
    // 其他
    initialStrength: 0,
    rewardAmount: 20, 
    rewardOncePerProblem: false, 
    pauseButtonEnabled: true,
    resetOnSuccess: true,
    
    // 比率
    ratioA: 1.0,
    randomA: false,
    ratioB: 1.0,
    randomB: false
};

// 页面加载时载入设置
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('cancelBtn').addEventListener('click', () => window.close());
});

// 从 chrome.storage 加载设置并填充表单
function loadSettings() {
    chrome.storage.local.get('config', (data) => {
        const config = { ...DEFAULT_CONFIG, ...data.config };

        // 自动增长
        document.getElementById('interval').value = config.interval;
        document.getElementById('baseIncrease').value = config.baseIncrease;
        document.getElementById('extraIncreaseFirst6').value = config.extraIncreaseFirst6;

        // 常规失败惩罚
        config.punishLevels.forEach((level, index) => {
            document.getElementById(`punishL${index + 1}Strength`).value = level.strength;
            document.getElementById(`punishL${index + 1}Duration`).value = level.duration;
        });

        // 特殊惩罚
        document.getElementById('punishSubmitFailStrength').value = config.punishSubmitFail.strength;
        document.getElementById('punishSubmitFailDuration').value = config.punishSubmitFail.duration;
        document.getElementById('punishPostIncrease').value = config.punishPostIncrease;

        // 其他
        document.getElementById('initialStrength').value = config.initialStrength;
        document.getElementById('rewardAmount').value = config.rewardAmount; // (*** 新增 ***)
        document.getElementById('rewardOncePerProblem').checked = config.rewardOncePerProblem; // (*** 新增 ***)
        document.getElementById('pauseButtonEnabled').checked = config.pauseButtonEnabled;
        document.getElementById('resetOnSuccess').checked = config.resetOnSuccess;

        // 比率
        document.getElementById('ratioA').value = config.ratioA;
        document.getElementById('randomA').checked = config.randomA;
        document.getElementById('ratioB').value = config.ratioB;
        document.getElementById('randomB').checked = config.randomB;
    });
}

// 保存设置到 chrome.storage
function saveSettings() {
    const newConfig = {
        punishLevels: [],
        punishSubmitFail: {}
    };

    // 自动增长
    newConfig.interval = document.getElementById('interval').valueAsNumber;
    newConfig.baseIncrease = document.getElementById('baseIncrease').valueAsNumber;
    newConfig.extraIncreaseFirst6 = document.getElementById('extraIncreaseFirst6').valueAsNumber;

    // 常规失败惩罚
    for (let i = 0; i < 5; i++) {
        newConfig.punishLevels.push({
            strength: document.getElementById(`punishL${i + 1}Strength`).valueAsNumber,
            duration: document.getElementById(`punishL${i + 1}Duration`).valueAsNumber
        });
    }

    // 特殊惩罚
    newConfig.punishSubmitFail.strength = document.getElementById('punishSubmitFailStrength').valueAsNumber;
    newConfig.punishSubmitFail.duration = document.getElementById('punishSubmitFailDuration').valueAsNumber;
    newConfig.punishPostIncrease = document.getElementById('punishPostIncrease').valueAsNumber;

    // 其他
    newConfig.initialStrength = document.getElementById('initialStrength').valueAsNumber;
    newConfig.rewardAmount = document.getElementById('rewardAmount').valueAsNumber; // (*** 新增 ***)
    newConfig.rewardOncePerProblem = document.getElementById('rewardOncePerProblem').checked; // (*** 新增 ***)
    newConfig.pauseButtonEnabled = document.getElementById('pauseButtonEnabled').checked;
    newConfig.resetOnSuccess = document.getElementById('resetOnSuccess').checked;

    // 比率
    newConfig.ratioA = document.getElementById('ratioA').valueAsNumber;
    newConfig.randomA = document.getElementById('randomA').checked;
    newConfig.ratioB = document.getElementById('ratioB').valueAsNumber;
    newConfig.randomB = document.getElementById('randomB').checked;

    chrome.storage.local.set({ config: newConfig }, () => {
        console.log('设置已保存');
        // 通知 background.js 重新加载配置
        chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
        alert('设置已保存！');
        window.close();
    });
}
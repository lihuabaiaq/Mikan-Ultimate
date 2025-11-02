document.addEventListener('DOMContentLoaded', function() {
    const wsStatusDiv = document.getElementById('wsStatus');
    const deviceStatusDiv = document.getElementById('deviceStatus');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const qrcodeContainer = document.getElementById('qrcodeContainer');
    const wsUrlInput = document.getElementById('wsUrl');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const stopPulseBtn = document.getElementById('stopPulseBtn');
    const settingsBtn = document.getElementById('settingsBtn'); // (*** 新增 ***)
    let qrcode = null;

    // 加载保存的WebSocket地址
    chrome.storage.local.get(['wsUrl'], function(result) {
        if (result.wsUrl) {
            wsUrlInput.value = result.wsUrl;
        }
    });

    // 保存设置
    saveSettingsBtn.addEventListener('click', function() {
        const newWsUrl = wsUrlInput.value;
        chrome.storage.local.set({ wsUrl: newWsUrl }, function() {
            chrome.runtime.sendMessage({ 
                type: 'UPDATE_WS_URL', 
                url: newWsUrl 
            }, function() {
                alert('设置已保存，将重新连接WebSocket');
            });
        });
    });

    // 替换原来的应用通道设置
    document.getElementById('strengthA').addEventListener('change', function() {
        const strength = parseInt(this.value);
        setChannelStrength('A', strength);
    });

    document.getElementById('strengthB').addEventListener('change', function() {
        const strength = parseInt(this.value);
        setChannelStrength('B', strength);
    });

    // 波形设置单独处理
    document.getElementById('waveA').addEventListener('change', function() {
        const wave = this.value;
        setChannelWave('A', wave);
    });

    document.getElementById('waveB').addEventListener('change', function() {
        const wave = this.value;
        setChannelWave('B', wave);
    });

    function setChannelStrength(channel, strength) {
        chrome.runtime.sendMessage({
            type: 'SET_CHANNEL_STRENGTH',
            channel: channel,
            strength: strength
        }, function(response) {
            console.log(`${channel}通道强度已设置:`, response);
        });
    }

    function setChannelWave(channel, wave) {
        chrome.runtime.sendMessage({
            type: 'SET_CHANNEL_WAVE',
            channel: channel,
            wave: wave
        }, function(response) {
            console.log(`${channel}通道波形已应用:`, response);
        });
    }

    // 更新状态显示
    function updateStatus(status) {
        const wsConnected = status.wsConnected;
        wsStatusDiv.textContent = 'WebSocket状态: ' + 
            (wsConnected ? '已连接' : '未连接');
        wsStatusDiv.className = 'status ' + 
            (wsConnected ? 'connected' : 'disconnected');

        const deviceConnected = status.clientId && status.targetId;
        deviceStatusDiv.textContent = '设备状态: ' + 
            (deviceConnected ? '已连接' : '未连接');
        deviceStatusDiv.className = 'status ' + 
            (deviceConnected ? 'connected' : 'disconnected');

        if (status.clientId && !status.targetId) {
            if (!qrcode) {
                qrcodeContainer.style.display = 'block';
                qrcode = new QRCode(document.getElementById("qrcode"), {
                    width: 128,
                    height: 128
                });
            }
            const qrContent = "https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#" + 
                            wsUrlInput.value + "/" + status.clientId;
            qrcode.makeCode(qrContent);
        } else {
            qrcodeContainer.style.display = 'none';
        }

        if (status.channelStrength) {
            document.getElementById('strengthA').value = status.channelStrength.A || 0;
            document.getElementById('strengthB').value = status.channelStrength.B || 0;
        }
        if (status.softLimits) {
            document.getElementById('softLimitA').textContent = status.softLimits.A || 0;
            document.getElementById('softLimitB').textContent = status.softLimits.B || 0;
        }

        // 更新波形选择
        if (status.channelWaves) {
            document.getElementById('waveA').value = status.channelWaves.A || "1";
            document.getElementById('waveB').value = status.channelWaves.B || "1";
        }

        // 更新断开连接按钮状态
        if (status.wsConnected) {
            stopPulseBtn.removeAttribute('disabled');
            stopPulseBtn.classList.add('active');
        } else {
            stopPulseBtn.setAttribute('disabled', 'disabled');
            stopPulseBtn.classList.remove('active');
        }
    }

    // 监听状态更新
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Popup] 收到消息:', message);
        if (message.type === 'STATUS_UPDATE') {
            updateStatus(message.status);
        }
        return true;  // 保持消息通道开放
    });

    // 初始检查状态
    console.log('[Popup] 开始初始状态检查');
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function(response) {
        console.log('[Popup] 收到状态响应:', response);
        if (response) {
            updateStatus(response);
        } else {
            console.error('[Popup] 未收到响应或响应为空');
            // 如果没有收到响应，5s后重试
            setTimeout(() => {
                console.log('[Popup] 重试获取状态');
                chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function(retryResponse) {
                    if (retryResponse) {
                        updateStatus(retryResponse);
                    } else {
                        console.error('[Popup] 重试仍然失败');
                    }
                });
            }, 5000);
        }
    });

    // 重连按钮点击事件
    reconnectBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ type: 'RECONNECT' }, function(response) {
            console.log('正在尝试重新连接...');
        });
    });

    // (*** 新增 ***)
    // 设置按钮点击事件
    settingsBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
    });

    // 修改按钮点击处理
    stopPulseBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ type: 'DISCONNECT' });
    });
});
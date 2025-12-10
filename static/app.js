class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.requestCount = 0;
        this.startTime = null;
        
        this.initElements();
        this.initWebSocket();
        this.initAudio();
        this.bindEvents();
        this.startAnimations();
    }

    initElements() {
        this.statusDot = document.getElementById('status').querySelector('.status-dot');
        this.statusText = document.getElementById('status').querySelector('.status-text');
        this.messages = document.getElementById('messages');
        this.recordBtn = document.getElementById('recordBtn');
        this.recordStatus = document.getElementById('recordStatus');
        this.visualizer = document.getElementById('visualizer');
        this.requestCountEl = document.getElementById('requestCount');
        this.responseTimeEl = document.getElementById('responseTime');
        this.serverStatusEl = document.getElementById('serverStatus');
        this.clearChatBtn = document.getElementById('clearChat');
    }

    startAnimations() {
        // Добавляем анимацию появления элементов
        const elements = document.querySelectorAll('.hero, .chat-section, .voice-section, .stats-section');
        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            setTimeout(() => {
                el.style.transition = 'all 0.6s ease';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, index * 200);
        });
    }

    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.connectWebSocket(wsUrl);
    }

    connectWebSocket(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.updateStatus('online', 'Подключено');
            this.serverStatusEl.textContent = 'Online';
            this.addMessage('assistant', '✅ Подключение установлено! Можно начинать разговор.');
            
            // Запускаем ping для поддержания соединения
            this.startPing();
        };
        
        this.ws.onclose = (event) => {
            this.updateStatus('offline', 'Отключено');
            this.serverStatusEl.textContent = 'Offline';
            
            // Останавливаем ping
            this.stopPing();
            
            // Автоматическое переподключение через 3 секунды
            if (!event.wasClean) {
                this.addMessage('assistant', '🔄 Соединение потеряно. Переподключение через 3 секунды...');
                setTimeout(() => {
                    this.connectWebSocket(wsUrl);
                }, 3000);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('offline', 'Ошибка');
            this.serverStatusEl.textContent = 'Error';
        };
        
        this.ws.onmessage = (event) => {
            if (event.data === 'pong') {
                // Игнорируем pong сообщения
                return;
            }
            
            const responseTime = Date.now() - this.startTime;
            this.responseTimeEl.textContent = `${responseTime}ms`;
            
            this.addMessage('assistant', event.data);
            this.recordStatus.textContent = 'Нажмите и говорите';
            this.visualizer.classList.remove('active');
        };
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ping');
            }
        }, 30000); // Ping каждые 30 секунд
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    async initAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processAudio();
            };
            
        } catch (error) {
            console.error('Ошибка доступа к микрофону:', error);
            this.addMessage('system', '❌ Не удалось получить доступ к микрофону. Проверьте разрешения.');
        }
    }

    bindEvents() {
        this.recordBtn.addEventListener('mousedown', () => this.startRecording());
        this.recordBtn.addEventListener('mouseup', () => this.stopRecording());
        this.recordBtn.addEventListener('mouseleave', () => this.stopRecording());
        
        // Touch events for mobile
        this.recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        this.recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Clear chat button
        this.clearChatBtn.addEventListener('click', () => this.clearChat());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isRecording) {
                e.preventDefault();
                this.startRecording();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isRecording) {
                e.preventDefault();
                this.stopRecording();
            }
        });

        // Закрываем соединение при закрытии страницы
        window.addEventListener('beforeunload', () => {
            this.stopPing();
            if (this.ws) {
                this.ws.close(1000, 'Page unload');
            }
        });
    }

    clearChat() {
        // Очищаем интерфейс
        this.messages.innerHTML = `
            <div class="message assistant welcome">
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        <p>🧹 Очищаю память и начинаю новый разговор...</p>
                    </div>
                    <div class="message-time">${this.getCurrentTime()}</div>
                </div>
            </div>
        `;
        
        // Отправляем команду очистки контекста на сервер
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('clear_context');
        }
        
        this.requestCount = 0;
        this.requestCountEl.textContent = '0';
        this.responseTimeEl.textContent = '-';
    }

    getCurrentTime() {
        return new Date().toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    startRecording() {
        if (!this.mediaRecorder || this.isRecording) return;
        
        this.isRecording = true;
        this.audioChunks = [];
        this.recordBtn.classList.add('recording');
        this.recordStatus.textContent = '🎙️ Запись...';
        this.visualizer.classList.add('active');
        
        this.mediaRecorder.start(100); // Collect data every 100ms
        
        this.addMessage('user', '🎤 Запись голосового сообщения...');
    }

    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');
        this.recordStatus.textContent = 'Обработка...';
        
        this.mediaRecorder.stop();
    }

    async processAudio() {
        if (this.audioChunks.length === 0) return;
        
        try {
            // Convert webm to wav
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to PCM 16-bit
            const pcmData = this.audioBufferToPCM(audioBuffer);
            
            // Send to server
            this.startTime = Date.now();
            this.requestCount++;
            this.requestCountEl.textContent = this.requestCount;
            
            this.ws.send(pcmData);
            this.ws.send(new TextEncoder().encode('END_STREAM'));
            
            // Update last user message
            const userMessages = this.messages.querySelectorAll('.message.user');
            const lastUserMessage = userMessages[userMessages.length - 1];
            if (lastUserMessage) {
                lastUserMessage.querySelector('.message-content p').textContent = '🎤 Голосовое сообщение отправлено';
            }
            
        } catch (error) {
            console.error('Ошибка обработки аудио:', error);
            this.recordStatus.textContent = 'Ошибка обработки аудио';
            this.addMessage('system', '❌ Ошибка обработки аудио. Попробуйте еще раз.');
        }
    }

    audioBufferToPCM(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const pcmData = new Int16Array(channelData.length);
        
        for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        
        return pcmData.buffer;
    }

    updateStatus(status, text) {
        this.statusDot.className = `status-dot ${status}`;
        this.statusText.textContent = text;
    }

    addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        // Avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        const avatarIcon = document.createElement('i');
        avatarIcon.className = type === 'user' ? 'fas fa-user' : 'fas fa-robot';
        avatarDiv.appendChild(avatarIcon);
        
        // Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        
        const p = document.createElement('p');
        p.textContent = content;
        bubbleDiv.appendChild(p);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = this.getCurrentTime();
        
        contentDiv.appendChild(bubbleDiv);
        contentDiv.appendChild(timeDiv);
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        
        this.messages.appendChild(messageDiv);
        this.messages.scrollTop = this.messages.scrollHeight;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});

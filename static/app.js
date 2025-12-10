class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isProcessing = false;
        this.requestCount = 0;
        this.totalRequests = 0;
        this.responseTimes = [];
        this.startTime = null;
        this.lastRequestTime = 0;
        
        this.initElements();
        this.loadStats();
        this.initWebSocket();
        this.initAudio();
        this.bindEvents();
        this.initDragAndDrop();
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
        this.statsGrid = document.getElementById('statsGrid');
        this.heroFeatures = document.getElementById('heroFeatures');
        
        // Text input elements
        this.voiceTab = document.getElementById('voiceTab');
        this.textTab = document.getElementById('textTab');
        this.voiceInput = document.getElementById('voiceInput');
        this.textInput = document.getElementById('textInput');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.charCounter = document.getElementById('charCounter');
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
            
            // Добавляем время ответа в массив для подсчета среднего
            this.responseTimes.push(responseTime);
            this.totalRequests++;
            
            // Вычисляем среднее время ответа
            const averageTime = Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length);
            
            // Обновляем статистику
            this.responseTimeEl.textContent = `${averageTime}ms`;
            this.requestCountEl.textContent = this.totalRequests;
            
            // Сохраняем статистику
            this.saveStats();
            
            this.addMessage('assistant', event.data);
            this.recordStatus.textContent = 'Нажмите и говорите';
            this.visualizer.classList.remove('active');
            
            // Разблокируем интерфейс
            this.isProcessing = false;
            this.recordBtn.disabled = false;
            this.updateCharCounter(); // Обновляем состояние кнопки отправки правильно
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





        // Закрываем соединение при закрытии страницы
        window.addEventListener('beforeunload', () => {
            this.stopPing();
            if (this.ws) {
                this.ws.close(1000, 'Page unload');
            }
        });

        // Tab switching
        this.voiceTab.addEventListener('click', () => this.switchTab('voice'));
        this.textTab.addEventListener('click', () => this.switchTab('text'));

        // Text input events
        this.sendBtn.addEventListener('click', () => this.sendTextMessage());
        this.messageInput.addEventListener('input', () => this.updateCharCounter());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });

        // Инициализируем состояние кнопки
        this.updateCharCounter();
    }

    switchTab(tab) {
        if (tab === 'voice') {
            this.voiceTab.classList.add('active');
            this.textTab.classList.remove('active');
            this.voiceInput.classList.add('active');
            this.textInput.classList.remove('active');
        } else {
            this.textTab.classList.add('active');
            this.voiceTab.classList.remove('active');
            this.textInput.classList.add('active');
            this.voiceInput.classList.remove('active');
        }
    }

    updateCharCounter() {
        const length = this.messageInput.value.length;
        this.charCounter.textContent = `${length}/500`;
        
        if (length > 450) {
            this.charCounter.style.color = '#ef4444';
        } else if (length > 400) {
            this.charCounter.style.color = '#f59e0b';
        } else {
            this.charCounter.style.color = '#6b7280';
        }

        // Кнопка активна если есть текст, не превышен лимит и не идет обработка
        this.sendBtn.disabled = length === 0 || length > 500 || this.isProcessing;
    }

    async sendTextMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.ws || this.ws.readyState !== WebSocket.OPEN || this.isProcessing) return;

        // Проверяем таймаут 5 секунд
        const now = Date.now();
        if (now - this.lastRequestTime < 5000) {
            const remaining = Math.ceil((5000 - (now - this.lastRequestTime)) / 1000);
            this.addMessage('assistant', `⏱️ Подождите ${remaining} секунд перед следующим запросом`);
            return;
        }

        this.isProcessing = true;
        this.lastRequestTime = now;

        // Добавляем сообщение пользователя
        this.addMessage('user', message);
        
        // Очищаем поле ввода
        this.messageInput.value = '';
        this.updateCharCounter();

        // Блокируем кнопки
        this.sendBtn.disabled = true;
        this.recordBtn.disabled = true;

        // Отправляем текст напрямую через WebSocket
        this.startTime = Date.now();

        // Отправляем как текстовое сообщение с префиксом
        this.ws.send(`text:${message}`);
    }

    loadStats() {
        const saved = localStorage.getItem('voiceAssistantStats');
        if (saved) {
            const stats = JSON.parse(saved);
            this.totalRequests = stats.totalRequests || 0;
            this.responseTimes = stats.responseTimes || [];
            
            // Обновляем интерфейс
            this.requestCountEl.textContent = this.totalRequests;
            if (this.responseTimes.length > 0) {
                const averageTime = Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length);
                this.responseTimeEl.textContent = `${averageTime}ms`;
            }
        }
        
        // Загружаем порядок карточек
        this.loadCardOrder();
    }

    saveStats() {
        const stats = {
            totalRequests: this.totalRequests,
            responseTimes: this.responseTimes
        };
        localStorage.setItem('voiceAssistantStats', JSON.stringify(stats));
    }

    loadCardOrder() {
        const statsOrder = localStorage.getItem('statsOrder');
        const featuresOrder = localStorage.getItem('featuresOrder');
        
        if (statsOrder) {
            this.reorderCards(this.statsGrid, JSON.parse(statsOrder));
        }
        
        if (featuresOrder) {
            this.reorderCards(this.heroFeatures, JSON.parse(featuresOrder));
        }
    }

    saveCardOrder(container, order) {
        const key = container.id === 'statsGrid' ? 'statsOrder' : 'featuresOrder';
        localStorage.setItem(key, JSON.stringify(order));
    }

    reorderCards(container, order) {
        const cards = Array.from(container.children);
        order.forEach(id => {
            const card = cards.find(c => c.dataset.id === id);
            if (card) {
                container.appendChild(card);
            }
        });
    }

    initDragAndDrop() {
        [this.statsGrid, this.heroFeatures].forEach(container => {
            this.setupDragAndDrop(container);
        });
    }

    setupDragAndDrop(container) {
        let draggedElement = null;
        let placeholder = null;

        container.addEventListener('dragstart', (e) => {
            draggedElement = e.target.closest('[draggable="true"]');
            if (draggedElement) {
                // Создаем placeholder
                placeholder = draggedElement.cloneNode(true);
                placeholder.classList.add('drag-placeholder');
                placeholder.removeAttribute('draggable');
                
                // Вставляем placeholder на место оригинала
                draggedElement.parentNode.insertBefore(placeholder, draggedElement);
                
                // Скрываем оригинал
                draggedElement.style.display = 'none';
                
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', '');
            }
        });

        container.addEventListener('dragend', (e) => {
            if (draggedElement) {
                // Показываем оригинал обратно
                draggedElement.style.display = '';
                
                // Удаляем placeholder
                if (placeholder && placeholder.parentNode) {
                    placeholder.parentNode.removeChild(placeholder);
                }
                
                // Очищаем все временные классы
                container.querySelectorAll('.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });
                
                draggedElement = null;
                placeholder = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (!draggedElement) return;
            
            const afterElement = this.getDragAfterElement(container, e.clientX, e.clientY);
            
            if (afterElement == null) {
                container.appendChild(placeholder);
            } else {
                container.insertBefore(placeholder, afterElement);
            }
        });

        container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            const target = e.target.closest('[draggable="true"]');
            if (target && target !== draggedElement) {
                target.classList.add('drag-over');
            }
        });

        container.addEventListener('dragleave', (e) => {
            const target = e.target.closest('[draggable="true"]');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            
            if (draggedElement && placeholder) {
                // Заменяем placeholder на оригинальный элемент
                placeholder.parentNode.insertBefore(draggedElement, placeholder);
                placeholder.parentNode.removeChild(placeholder);
                
                // Сохраняем новый порядок
                const order = Array.from(container.children)
                    .filter(card => card.dataset && card.dataset.id)
                    .map(card => card.dataset.id);
                this.saveCardOrder(container, order);
            }
        });
    }

    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            if (child === draggedElement) return closest;
            
            const box = child.getBoundingClientRect();
            
            // Для горизонтального расположения (hero features)
            if (container.id === 'heroFeatures') {
                const offset = x - box.left - box.width / 2;
                
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            } 
            // Для сетки (stats grid)
            else {
                const centerX = box.left + box.width / 2;
                const centerY = box.top + box.height / 2;
                
                // Определяем позицию относительно центра элемента
                const offsetX = x - centerX;
                const offsetY = y - centerY;
                
                if (offsetX < 0 && Math.abs(offsetX) > Math.abs(closest.offset)) {
                    return { offset: offsetX, element: child };
                } else {
                    return closest;
                }
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    getCurrentTime() {
        return new Date().toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    startRecording() {
        if (!this.mediaRecorder || this.isRecording || this.isProcessing) return;
        
        // Проверяем таймаут 5 секунд
        const now = Date.now();
        if (now - this.lastRequestTime < 5000) {
            const remaining = Math.ceil((5000 - (now - this.lastRequestTime)) / 1000);
            this.recordStatus.textContent = `Подождите ${remaining} сек.`;
            return;
        }
        
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

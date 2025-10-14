// Socket.io client connection
const socket = io();

// DOM elements
const timerDisplay = document.getElementById('timerDisplay');
const modeIndicator = document.getElementById('modeIndicator');
const modeText = document.getElementById('modeText');
const cycleCount = document.getElementById('cycleCount');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const workDurationInput = document.getElementById('workDuration');
const breakDurationInput = document.getElementById('breakDuration');
const applySettingsBtn = document.getElementById('applySettingsBtn');
const connectionStatus = document.getElementById('connectionStatus');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Train animation elements
const trainContainer = document.getElementById('trainContainer');
const train = document.getElementById('train');
const startStation = document.getElementById('startStation');
const endStation = document.getElementById('endStation');

// Audio elements
const trainWhistle = new Audio('choo-choo-train-whistle-sound-effect.mp3');
trainWhistle.preload = 'auto';
trainWhistle.volume = 0.7; // Set volume to 70%

// Connection status management
socket.on('connect', () => {
    updateConnectionStatus(true);
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
    console.log('Disconnected from server');
});

socket.on('connect_error', (error) => {
    updateConnectionStatus(false);
    console.error('Connection error:', error);
});

function updateConnectionStatus(connected) {
    if (connected) {
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected';
        connectionStatus.className = 'connection-status connected';
    } else {
        statusIndicator.className = 'status-indicator disconnected';
        statusText.textContent = 'Disconnected';
        connectionStatus.className = 'connection-status disconnected';
    }
}

// Timer state updates from server
socket.on('timer-update', (data) => {
    updateTimerDisplay(data);
    updateDocumentTitle(data.formattedTime, data.mode);
});

// Mode change notifications
socket.on('mode-changed', (data) => {
    showModeChangeNotification(data.mode, data.cycleCount);
});

function updateTimerDisplay(data) {
    timerDisplay.textContent = data.formattedTime;
    modeText.textContent = data.mode === 'work' ? 'Work' : 'Break';
    cycleCount.textContent = data.cycleCount;
    
    // Update mode indicator styling
    modeIndicator.className = `mode-indicator ${data.mode}`;
    
    // Update button states
    if (data.isRunning) {
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        startBtn.textContent = 'Running...';
    } else {
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        startBtn.textContent = 'Start';
    }
    
    // Update settings inputs to reflect current durations
    workDurationInput.value = Math.floor(data.workDuration / 60);
    breakDurationInput.value = Math.floor(data.breakDuration / 60);
    
    // Update train animation based on progress
    updateTrainProgress(data);
}

function updateDocumentTitle(time, mode) {
    const modeEmoji = mode === 'work' ? '🚂' : '☕';
    document.title = `${modeEmoji} ${time} - Pomodoro Express`;
}

// Train animation functions
function updateTrainProgress(data) {
    if (!trainContainer) return;
    
    const totalDuration = data.mode === 'work' ? data.workDuration : data.breakDuration;
    const elapsed = totalDuration - data.timeRemaining;
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    
    // Calculate train position (20px to window width - 140px)
    const trackWidth = window.innerWidth - 160; // Account for train width and margins
    const trainPosition = 20 + (progress * trackWidth);
    
    trainContainer.style.left = `${trainPosition}px`;
    
    // Update station indicators
    if (startStation && endStation) {
        if (progress < 0.1) {
            startStation.style.opacity = '1';
            endStation.style.opacity = '0.5';
        } else if (progress > 0.9) {
            startStation.style.opacity = '0.5';
            endStation.style.opacity = '1';
        } else {
            startStation.style.opacity = '0.7';
            endStation.style.opacity = '0.7';
        }
    }
    
    // Add chugging animation when running
    if (data.isRunning) {
        train.classList.add('chugging');
    } else {
        train.classList.remove('chugging');
    }
}

// Add chugging animation CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes chug {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-3px); }
    }
    
    .train-image.chugging {
        animation: chug 0.6s ease-in-out infinite;
    }
`;
document.head.appendChild(style);

// Audio functions
function playTrainWhistle() {
    try {
        // Reset audio to beginning and play
        trainWhistle.currentTime = 0;
        trainWhistle.play().catch(error => {
            console.log('Audio play failed:', error);
            // Fallback: try to play with user interaction
            document.addEventListener('click', () => {
                trainWhistle.play().catch(() => {});
            }, { once: true });
        });
    } catch (error) {
        console.log('Audio error:', error);
    }
}

function showModeChangeNotification(mode, cycleCount) {
    const message = mode === 'work' 
        ? `🚂 All Aboard! Work time begins - Cycle ${cycleCount}` 
        : `☕ Break Station! Time to rest - Cycle ${cycleCount}`;
    
    // Play train whistle sound effect
    playTrainWhistle();
    
    // Create temporary notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 4000);
    
    // Browser notification if permission granted
    if (Notification.permission === 'granted') {
        new Notification(message);
    }
    
    // Reset train to start position when mode changes
    if (trainContainer) {
        trainContainer.style.left = '20px';
    }
}

// Event listeners for control buttons
startBtn.addEventListener('click', () => {
    socket.emit('start-timer');
});

pauseBtn.addEventListener('click', () => {
    socket.emit('pause-timer');
});

resetBtn.addEventListener('click', () => {
    socket.emit('reset-timer');
});

// Settings management
applySettingsBtn.addEventListener('click', () => {
    const workDuration = parseInt(workDurationInput.value);
    const breakDuration = parseInt(breakDurationInput.value);
    
    if (workDuration && breakDuration) {
        socket.emit('update-settings', {
            workDuration: workDuration,
            breakDuration: breakDuration
        });
        
        // Visual feedback
        applySettingsBtn.textContent = 'Applied!';
        applySettingsBtn.disabled = true;
        
        setTimeout(() => {
            applySettingsBtn.textContent = 'Apply Settings';
            applySettingsBtn.disabled = false;
        }, 2000);
    }
});

// Request notification permission on page load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Enable audio playback on first user interaction
document.addEventListener('click', () => {
    // Preload and enable audio for future playback
    trainWhistle.load();
}, { once: true });

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Prevent shortcuts when typing in inputs
    if (event.target.tagName === 'INPUT') return;
    
    switch(event.code) {
        case 'Space':
            event.preventDefault();
            if (startBtn.disabled) {
                pauseBtn.click();
            } else {
                startBtn.click();
            }
            break;
        case 'KeyR':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                resetBtn.click();
            }
            break;
    }
});

// Add keyboard shortcut hints
document.addEventListener('DOMContentLoaded', () => {
    const shortcuts = document.createElement('div');
    shortcuts.className = 'keyboard-shortcuts';
    shortcuts.innerHTML = `
        <small>🚂 Keyboard shortcuts: Space (Start/Pause), Ctrl+R (Reset)</small>
    `;
    document.querySelector('footer').appendChild(shortcuts);
    
    // Initialize train position
    if (trainContainer) {
        trainContainer.style.left = '20px';
    }
});

// Handle window resize to adjust train track
window.addEventListener('resize', () => {
    // Trigger train position update if timer is running
    const currentData = {
        mode: modeText.textContent.toLowerCase(),
        timeRemaining: parseInt(timerDisplay.textContent.split(':')[0]) * 60 + parseInt(timerDisplay.textContent.split(':')[1]),
        workDuration: parseInt(workDurationInput.value) * 60,
        breakDuration: parseInt(breakDurationInput.value) * 60,
        isRunning: startBtn.disabled
    };
    updateTrainProgress(currentData);
});

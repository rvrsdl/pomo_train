const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Enable CORS for all routes
app.use(cors());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Global timer state
let timerState = {
  isRunning: false,
  timeRemaining: 1500, // 25 minutes in seconds
  mode: 'work', // 'work' or 'break'
  workDuration: 1500, // 25 minutes
  breakDuration: 300, // 5 minutes
  cycleCount: 0,
  pyramidMode: false
};

let timerInterval = null;

// Helper function to format time as MM:SS
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Helper function to get current user count
function getUserCount() {
  return io.engine.clientsCount || 0;
}

// Helper function to broadcast user count to all clients
function broadcastUserCount() {
  const count = getUserCount();
  io.emit('user-count-update', count);
}

// Helper function to calculate pyramid mode work duration
function getPyramidWorkDuration(cycleCount) {
  // Pyramid mode: 5, 10, 15, 20, 25, 30 (then stays at 30)
  const workMinutes = Math.min(30, 5 + (cycleCount * 5));
  return workMinutes * 60;
}

// Helper function to broadcast timer state to all clients
function broadcastTimerState() {
  io.emit('timer-update', {
    ...timerState,
    formattedTime: formatTime(timerState.timeRemaining)
  });
}

// Helper function to start the countdown
function startCountdown() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(() => {
    if (timerState.timeRemaining > 0) {
      timerState.timeRemaining--;
      broadcastTimerState();
    } else {
      // Timer reached 0, switch mode
      if (timerState.mode === 'work') {
        timerState.mode = 'break';
        timerState.timeRemaining = timerState.breakDuration;
        timerState.cycleCount++;
      } else {
        timerState.mode = 'work';
        // If pyramid mode is enabled, update work duration based on cycle count
        if (timerState.pyramidMode) {
          timerState.workDuration = getPyramidWorkDuration(timerState.cycleCount);
        }
        timerState.timeRemaining = timerState.workDuration;
      }
      
      // Auto-start the next session
      broadcastTimerState();
      io.emit('mode-changed', {
        mode: timerState.mode,
        cycleCount: timerState.cycleCount
      });
    }
  }, 1000);
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Broadcast updated user count to all clients
  broadcastUserCount();

  // Send current state to newly connected client
  socket.emit('timer-update', {
    ...timerState,
    formattedTime: formatTime(timerState.timeRemaining)
  });
  
  // Handle start timer event
  socket.on('start-timer', () => {
    if (!timerState.isRunning) {
      timerState.isRunning = true;
      startCountdown();
      broadcastTimerState();
      console.log('Timer started by:', socket.id);
    }
  });
  
  // Handle pause timer event
  socket.on('pause-timer', () => {
    if (timerState.isRunning) {
      timerState.isRunning = false;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      broadcastTimerState();
      console.log('Timer paused by:', socket.id);
    }
  });
  
  // Handle reset timer event
  socket.on('reset-timer', () => {
    timerState.isRunning = false;
    timerState.mode = 'work'; // Always reset to work mode
    timerState.cycleCount = 0;
    
    // If pyramid mode is enabled, reset to initial pyramid duration (5 min)
    if (timerState.pyramidMode) {
      timerState.workDuration = getPyramidWorkDuration(0);
    }
    
    timerState.timeRemaining = timerState.workDuration;
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    
    broadcastTimerState();
    console.log('Timer reset by:', socket.id);
  });
  
  // Handle settings update event
  socket.on('update-settings', (settings) => {
    const { workDuration, breakDuration, pyramidMode } = settings;
    
    // Update pyramid mode
    if (pyramidMode !== undefined) {
      timerState.pyramidMode = pyramidMode;
      
      // If enabling pyramid mode, set initial work duration to 5 min
      if (pyramidMode) {
        timerState.workDuration = getPyramidWorkDuration(timerState.cycleCount);
      }
    }
    
    // Only update durations if pyramid mode is off
    if (!timerState.pyramidMode) {
      // Validate durations (minimum 1 minute, maximum 60 minutes)
      const workMinutes = Math.max(1, Math.min(60, parseInt(workDuration) || 25));
      const breakMinutes = Math.max(1, Math.min(60, parseInt(breakDuration) || 5));
      
      timerState.workDuration = workMinutes * 60;
      timerState.breakDuration = breakMinutes * 60;
    } else {
      // In pyramid mode, only update break duration
      const breakMinutes = Math.max(1, Math.min(60, parseInt(breakDuration) || 5));
      timerState.breakDuration = breakMinutes * 60;
    }
    
    // Update current time remaining based on current mode
    timerState.timeRemaining = timerState.mode === 'work' ? timerState.workDuration : timerState.breakDuration;
    
    // If timer was running, restart it with new duration
    if (timerState.isRunning) {
      startCountdown();
    }
    
    broadcastTimerState();
    console.log('Settings updated by:', socket.id, 'Pyramid Mode:', timerState.pyramidMode, 'Work:', Math.floor(timerState.workDuration / 60), 'Break:', Math.floor(timerState.breakDuration / 60));
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Broadcast updated user count to remaining clients
    broadcastUserCount();
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the Pomodoro timer`);
});

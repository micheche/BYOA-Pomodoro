(function () {
  'use strict';

  const WORK_MINUTES = 25;
  const SHORT_BREAK_MINUTES = 5;
  const LONG_BREAK_MINUTES = 15;
  const SESSIONS_BEFORE_LONG_BREAK = 4;

  const phaseLabelElement = document.getElementById('phaseLabel');
  const timeDisplayElement = document.getElementById('timeDisplay');
  const startPauseButton = document.getElementById('startPauseBtn');
  const resetButton = document.getElementById('resetBtn');
  const skipButton = document.getElementById('skipBtn');
  const workModeButton = document.getElementById('workModeBtn');
  const restModeButton = document.getElementById('restModeBtn');
  const completedCountElement = document.getElementById('completedCount');
  const cycleCountElement = document.getElementById('cycleCount');
  const targetCyclesInput = document.getElementById('targetCycles');
  const setCyclesButton = document.getElementById('setCyclesBtn');
  const dailyMusingElement = document.getElementById('dailyMusing');
  const workMinutesInput = document.getElementById('workMinutes');
  const restMinutesInput = document.getElementById('restMinutes');
  const applySettingsButton = document.getElementById('applySettingsBtn');

  const Phase = Object.freeze({
    Work: 'work',
    ShortBreak: 'shortBreak',
    LongBreak: 'longBreak',
  });

  let currentPhase = Phase.Work;
  let completedWorkSessions = 0;
  let completedCycles = 0;
  let targetCycles = 4;
  let workMinutes = 25;
  let restMinutes = 5;
  let isRunning = false;
  let targetEpochMs = null;
  let remainingMs = minutesToMs(workMinutes);
  let intervalId = null;
  let alarmIntervalId = null;

  initializeUiFromState();
  attachEventListeners();
  updateProgressCssVar();

  function attachEventListeners() {
    startPauseButton.addEventListener('click', onStartPauseClicked);
    resetButton.addEventListener('click', onResetClicked);
    skipButton.addEventListener('click', onSkipClicked);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (workModeButton) workModeButton.addEventListener('click', onWorkModeClicked);
    if (restModeButton) restModeButton.addEventListener('click', onRestModeClicked);
    if (setCyclesButton) setCyclesButton.addEventListener('click', onSetCyclesClicked);
    if (applySettingsButton) applySettingsButton.addEventListener('click', onApplySettingsClicked);
    document.addEventListener('keydown', onKeyDown);
  }

  function onStartPauseClicked() {
    if (isRunning) {
      pauseTimer();
      return;
    }
    startTimer();
  }

  function onResetClicked() {
    pauseTimer();
    resetCurrentPhaseTime();
    // Reset cycles and sessions
    completedWorkSessions = 0;
    completedCycles = 0;
    // Clear any active alarm
    if (alarmIntervalId) {
      clearInterval(alarmIntervalId);
      alarmIntervalId = null;
      document.body.removeAttribute('data-alarm');
    }
    updateCycleDisplay();
    render();
  }

  function onSkipClicked() {
    pauseTimer();
    advancePhase();
    resetCurrentPhaseTime();
    render();
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    const target = event.target;
    const isTyping = target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
    if (isTyping) return;

    if (event.code === 'Space') {
      event.preventDefault();
      onStartPauseClicked();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      onResetClicked();
    } else if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      onSkipClicked();
    }
  }

  function onWorkModeClicked() {
    pauseTimer();
    currentPhase = Phase.Work;
    remainingMs = minutesToMs(workMinutes);
    targetEpochMs = null;
    updateModeButtonsState();
    render();
  }

  function onRestModeClicked() {
    pauseTimer();
    currentPhase = Phase.ShortBreak;
    remainingMs = minutesToMs(restMinutes);
    targetEpochMs = null;
    updateModeButtonsState();
    render();
  }

  function onSetCyclesClicked() {
    const newTarget = parseInt(targetCyclesInput.value);
    if (newTarget >= 1 && newTarget <= 20) {
      targetCycles = newTarget;
      // Reset timer when changing cycles
      pauseTimer();
      resetCurrentPhaseTime();
      completedWorkSessions = 0;
      completedCycles = 0;
      // Clear any active alarm
      if (alarmIntervalId) {
        clearInterval(alarmIntervalId);
        alarmIntervalId = null;
        document.body.removeAttribute('data-alarm');
      }
      updateCycleDisplay();
      render();
    }
  }

  function onApplySettingsClicked() {
    const newWorkMinutes = parseInt(workMinutesInput.value);
    const newRestMinutes = parseInt(restMinutesInput.value);
    
    if (newWorkMinutes >= 1 && newWorkMinutes <= 120 && 
        newRestMinutes >= 1 && newRestMinutes <= 60) {
      
      // Save to localStorage
      saveSettings(newWorkMinutes, newRestMinutes);
      
      // Update current values
      workMinutes = newWorkMinutes;
      restMinutes = newRestMinutes;
      
      // Reset timer with new durations
      pauseTimer();
      resetCurrentPhaseTime();
      completedWorkSessions = 0;
      completedCycles = 0;
      
      // Clear any active alarm
      if (alarmIntervalId) {
        clearInterval(alarmIntervalId);
        alarmIntervalId = null;
        document.body.removeAttribute('data-alarm');
      }
      
      updateCycleDisplay();
      render();
    }
  }

  function onVisibilityChange() {
    if (!isRunning || targetEpochMs === null) {
      return;
    }
    render();
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    startPauseButton.textContent = 'Pause';
    startPauseButton.setAttribute('aria-pressed', 'true');

    if (targetEpochMs === null) {
      targetEpochMs = Date.now() + remainingMs;
    }

    if (intervalId !== null) {
      clearInterval(intervalId);
    }
    intervalId = setInterval(tick, 250);
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    startPauseButton.textContent = 'Start';
    startPauseButton.setAttribute('aria-pressed', 'false');

    if (targetEpochMs !== null) {
      remainingMs = Math.max(0, targetEpochMs - Date.now());
    }
    clearInterval(intervalId);
    intervalId = null;
    document.title = buildDocumentTitle();
    updateProgressCssVar();
  }

  function tick() {
    if (!isRunning || targetEpochMs === null) return;

    const now = Date.now();
    const msLeft = Math.max(0, targetEpochMs - now);
    remainingMs = msLeft;
    timeDisplayElement.textContent = formatMsAsClock(msLeft);
    document.title = buildDocumentTitle();
    updateProgressCssVar();

    if (msLeft <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      isRunning = false;
      targetEpochMs = null;
      handlePhaseComplete();
    }
  }

  function handlePhaseComplete() {
    if (currentPhase === Phase.Work) {
      completedWorkSessions += 1;
      completedCountElement.textContent = String(completedWorkSessions);

      // Move to break and ring work completion alarm
      playChirpingAlarm();
      advancePhase();
      resetCurrentPhaseTime();
      render();

      // Auto-start rest timer immediately after work
      setTimeout(() => {
        if (!isRunning) {
          startTimer();
        }
      }, 750);
    } else {
      // Rest phase completed: this completes one Work+Rest cycle
      playRestAlarm3s();
      completedCycles += 1;
      updateCycleDisplay();

      // Move to next work phase
      advancePhase();
      resetCurrentPhaseTime();
      render();

      // If we still have cycles to go, auto-start next work
      if (completedCycles < targetCycles) {
        setTimeout(() => {
          if (!isRunning) {
            startTimer();
          }
        }, 750);
      }
    }
  }

  function advancePhase() {
    if (currentPhase === Phase.Work) {
      const shouldTakeLongBreak = completedWorkSessions > 0 && (completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK === 0);
      currentPhase = shouldTakeLongBreak ? Phase.LongBreak : Phase.ShortBreak;
    } else {
      currentPhase = Phase.Work;
    }
  }

  function resetCurrentPhaseTime() {
    targetEpochMs = null;
    if (currentPhase === Phase.Work) {
      remainingMs = minutesToMs(workMinutes);
    } else if (currentPhase === Phase.ShortBreak) {
      remainingMs = minutesToMs(restMinutes);
    } else {
      remainingMs = minutesToMs(LONG_BREAK_MINUTES);
    }
    updateProgressCssVar();
  }

  function initializeUiFromState() {
    // Load saved settings from localStorage
    loadSettings();
    
    // Recalculate remainingMs after loading settings to ensure alignment
    if (currentPhase === Phase.Work) {
      remainingMs = minutesToMs(workMinutes);
    } else if (currentPhase === Phase.ShortBreak) {
      remainingMs = minutesToMs(restMinutes);
    } else {
      remainingMs = minutesToMs(LONG_BREAK_MINUTES);
    }
    
    document.body.setAttribute('data-phase', currentPhase);
    phaseLabelElement.textContent = getPhaseLabel(currentPhase);
    completedCountElement.textContent = String(completedWorkSessions);
    targetCyclesInput.value = String(targetCycles);
    workMinutesInput.value = String(workMinutes);
    restMinutesInput.value = String(restMinutes);
    updateCycleDisplay();
    timeDisplayElement.textContent = formatMsAsClock(remainingMs);
    startPauseButton.textContent = 'Start';
    startPauseButton.setAttribute('aria-pressed', 'false');
    updateModeButtonsState();
    document.title = buildDocumentTitle();
    updateProgressCssVar();
    setDailyMusing();
  }

  function render() {
    document.body.setAttribute('data-phase', currentPhase);
    phaseLabelElement.textContent = getPhaseLabel(currentPhase);
    timeDisplayElement.textContent = formatMsAsClock(remainingMs);
    document.title = buildDocumentTitle();
    updateProgressCssVar();
  }

  function getCurrentPhaseDurationMs() {
    if (currentPhase === Phase.Work) return minutesToMs(workMinutes);
    if (currentPhase === Phase.ShortBreak) return minutesToMs(restMinutes);
    return minutesToMs(LONG_BREAK_MINUTES);
  }

  function updateProgressCssVar() {
    const duration = getCurrentPhaseDurationMs();
    const progress = Math.max(0, Math.min(1, 1 - (remainingMs / duration)));
    document.documentElement.style.setProperty('--progress', String(progress));
  }

  function updateModeButtonsState() {
    if (!workModeButton || !restModeButton) return;
    const isWork = currentPhase === Phase.Work;
    workModeButton.setAttribute('aria-pressed', isWork ? 'true' : 'false');
    restModeButton.setAttribute('aria-pressed', isWork ? 'false' : 'true');
  }

  function getPhaseLabel(phase) {
    if (phase === Phase.Work) return 'Work';
    if (phase === Phase.ShortBreak) return 'Short Break';
    return 'Long Break';
  }

  function formatMsAsClock(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    return `${m}:${s}`;
  }

  function minutesToMs(minutes) {
    return Math.round(minutes * 60 * 1000);
  }

  function buildDocumentTitle() {
    const prefix = formatMsAsClock(remainingMs);
    const label = getPhaseLabel(currentPhase);
    return `${prefix} • ${label}`;
  }

  function playBeep() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const durationMs = 300;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = currentPhase === Phase.Work ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + durationMs / 1000);
      oscillator.onended = () => audioContext.close();
    } catch (e) {
      // no audio available
    }
  }

  function playChirpingAlarm() {
    // Clear any existing alarm
    if (alarmIntervalId) {
      clearInterval(alarmIntervalId);
    }

    // Add alarm animation state
    document.body.setAttribute('data-alarm', 'true');

    let chirpCount = 0;
    const maxChirps = 6; // 3 seconds with 500ms intervals

    const playChirp = () => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 800 + (chirpCount * 50); // Ascending pitch
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        oscillator.onended = () => audioContext.close();

        chirpCount++;
        if (chirpCount >= maxChirps) {
          clearInterval(alarmIntervalId);
          alarmIntervalId = null;
          document.body.removeAttribute('data-alarm');
        }
      } catch (e) {
        // no audio available
      }
    };

    // Play first chirp immediately, then every 500ms
    playChirp();
    alarmIntervalId = setInterval(playChirp, 500);
  }

  function playRestAlarm3s() {
    // Clear any existing alarm
    if (alarmIntervalId) {
      clearInterval(alarmIntervalId);
    }

    document.body.setAttribute('data-alarm', 'true');

    let count = 0;
    const max = 6; // 6 tones over ~3s

    const playTone = () => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = 'triangle';
        // Alternate two lower tones for a different sound signature
        oscillator.frequency.value = (count % 2 === 0) ? 520 : 440;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.25);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.25);
        oscillator.onended = () => audioContext.close();

        count++;
        if (count >= max) {
          clearInterval(alarmIntervalId);
          alarmIntervalId = null;
          document.body.removeAttribute('data-alarm');
        }
      } catch (e) {
        // no audio available
      }
    };

    playTone();
    alarmIntervalId = setInterval(playTone, 500);
  }

  function updateCycleDisplay() {
    if (cycleCountElement) {
      cycleCountElement.textContent = String(completedCycles);
    }
  }

  function setDailyMusing() {
    if (!dailyMusingElement) return;
    const musings = [
      'Small progress beats perfection.',
      'Focus on the next minute.',
      'Consistency compounds.',
      'Breathe. Begin. Build.',
      'One block at a time.',
      'Momentum over motivation.',
      'Show up for yourself today.',
      'Deep work, gentle breaks.',
      'Your future self is watching.',
      'Simplicity is a superpower.'
    ];
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const diff = today - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const index = dayOfYear % musings.length;
    dailyMusingElement.textContent = musings[index];
  }

  function saveSettings(workMinutes, restMinutes) {
    localStorage.setItem('workMinutes', workMinutes);
    localStorage.setItem('restMinutes', restMinutes);
  }

  function loadSettings() {
    const savedWorkMinutes = localStorage.getItem('workMinutes');
    const savedRestMinutes = localStorage.getItem('restMinutes');

    if (savedWorkMinutes !== null && savedRestMinutes !== null) {
      workMinutes = parseInt(savedWorkMinutes);
      restMinutes = parseInt(savedRestMinutes);
    }
  }
})();



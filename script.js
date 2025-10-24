window.__SPEED__ = 10;

if (!window.__clockworkInitialized) {
  console.log(
    '%c⏰ Clockwork Date Picker',
    'font-size: 16px; font-weight: bold; color: #191918; background-color: #f6f5f4; padding: 10px 20px; border-radius: 99999px; border: 5px solid #191918;',
  );
  console.log('%c🎮 Cheat Codes:', 'font-weight: bold;');
  console.log(
    '• Hold Shift while dragging/scrolling for 10x speed\n• Use two fingers on touch devices for 10x speed\n• Try: __SPEED__ = 100 for custom speed',
  );
  window.__clockworkInitialized = true;
}

const svg = document.getElementById('clock');
const hourHand = document.getElementById('hour-hand');
const minuteHand = document.getElementById('minute-hand');
const timestampDate = document.getElementById('timestamp-date');
const timestampTime = document.getElementById('timestamp-time');
const resetBtn = document.getElementById('reset-btn');
const infoBtn = document.getElementById('info-btn');
const infoDialog = document.getElementById('info-dialog');
const closeDialogBtn = document.getElementById('close-dialog-btn');
const minuteMarkers = document.getElementById('minute-markers');
const hourMarkers = document.getElementById('hour-markers');

for (let i = 0; i < 60; i++) {
  const angle = i * 6;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '100');
  line.setAttribute('y1', '10');
  line.setAttribute('x2', '100');
  line.setAttribute('y2', '20');
  line.setAttribute('stroke', '#000');
  line.setAttribute('stroke-width', '3.5');
  line.setAttribute('stroke-linecap', 'butt');
  line.setAttribute('transform', `rotate(${angle} 100 100)`);
  minuteMarkers.appendChild(line);
}

for (let i = 0; i < 12; i++) {
  const angle = i * 30;
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '96.5');
  rect.setAttribute('y', '10');
  rect.setAttribute('width', '7');
  rect.setAttribute('height', '18');
  rect.setAttribute('fill', '#000');
  rect.setAttribute('rx', '0.5');
  if (angle > 0) {
    rect.setAttribute('transform', `rotate(${angle} 100 100)`);
  }
  hourMarkers.appendChild(rect);
}

let currentTime = new Date();
let isDragging = false;
let dragPointerId = null;
let dragStartTime = null;
let lastAngle = 0;
let accumulatedRotation = 0;
let isPanning = false;
let panPointerId = null;
let panStartX = 0;
let panStartY = 0;
let lastPanY = 0;
let panCommitted = false;
let cachedCenterX = 0;
let cachedCenterY = 0;
let needsRecalc = true;
let lastFormattedTime = '';
let lastTimestampUpdate = 0;
const TIMESTAMP_THROTTLE = 100;
let lastMinute = currentTime.getMinutes();
let audioContext = null;
let lastTickTime = 0;
const TICK_THROTTLE = 50;

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function playTickSound() {
  try {
    const now = performance.now();
    if (now - lastTickTime < TICK_THROTTLE) {
      return;
    }
    lastTickTime = now;

    const ctx = initAudioContext();
    const currentTime = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.frequency.value = 1500;
    osc.type = 'sine';

    gainNode.gain.setValueAtTime(0.05, currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.008);

    osc.start(currentTime);
    osc.stop(currentTime + 0.008);
  } catch (err) {
    console.warn('Audio playback failed:', err);
  }
}

let isTwoFingerTouch = false;
let activePointers = new Map();
let autoUpdateInterval = null;
let userHasInteracted = false;
let userLocation = null;
function getCSSVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// https://observablehq.com/@mourner/sun-position-in-900-bytes
function getSunPosition(date, lng, lat) {
  const { sin, cos, asin, atan2, PI } = Math;
  const r = PI / 180;
  const t = date / 315576e7 - 0.3;
  const m = r * (357.52911 + t * (35999.05029 - t * 1537e-7));
  const c = r * (125.04 - 1934.136 * t);
  const l =
    r *
      (280.46646 +
        t * (36000.76983 + t * 3032e-7) +
        (1.914602 - t * (4817e-6 - t * 14e-6)) * sin(m) -
        569e-5 -
        478e-5 * sin(c)) +
    (0.019993 - 101e-6 * t) * sin(2 * m) +
    289e-6 * sin(3 * m);
  const e =
    (r * (84381.448 - t * (46.815 - t * (59e-5 + 1813e-6 * t)))) / 3600 +
    r * 256e-5 * cos(c);
  const sl = sin(l);
  const cr = cos(r * lat);
  const sr = sin(r * lat);
  const d = asin(sin(e) * sl);
  const h =
    r * (280.46061837 + 13184999.8983375 * t + lng) -
    atan2(cos(e) * sl, cos(l));
  const sd = sin(d);
  const cd = cos(d);
  const ch = cos(h);
  return {
    azimuth: PI + atan2(sin(h), ch * sr - (cr * sd) / cd),
    altitude: asin(sr * sd + cr * cd * ch),
  };
}

async function fetchUserLocation() {
  const STORAGE_KEY = 'clockwork-date-picker:userLocation';
  const cached = sessionStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  try {
    const k = atob('ZTM3MWMyMmNmMzVhNDQyZWFjYTViZjIxNjM3NzllYzA=');
    const response = await fetch(
      `https://api.geoapify.com/v1/ipinfo?&apiKey=${k}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (data.location && data.location.latitude && data.location.longitude) {
      const location = {
        lat: data.location.latitude,
        lng: data.location.longitude,
        country: data.country.name,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      return location;
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch user location:', err);
    return null;
  }
}

function updateCachedCenter() {
  const rect = svg.getBoundingClientRect();
  cachedCenterX = rect.left + rect.width / 2;
  cachedCenterY = rect.top + rect.height / 2;
  needsRecalc = false;
}

function getAngle(e) {
  if (needsRecalc) updateCachedCenter();
  const x = e.clientX - cachedCenterX;
  const y = e.clientY - cachedCenterY;
  return Math.atan2(y, x);
}

const TWO_PI = 2 * Math.PI;
const PI = Math.PI;

function updateDisplay(throttleTimestamp = false) {
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const hourAngle = (hours % 12) * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6;

  hourHand.style.transform = `rotate(${hourAngle}deg)`;
  minuteHand.style.transform = `rotate(${minuteAngle}deg)`;

  const now = performance.now();
  const shouldUpdateTimestamp =
    !throttleTimestamp || now - lastTimestampUpdate >= TIMESTAMP_THROTTLE;

  if (shouldUpdateTimestamp) {
    const dateFormatted = currentTime.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const timeFormatted = currentTime.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const formatted = `${dateFormatted} ${timeFormatted}`;
    if (formatted !== lastFormattedTime) {
      // Replace colons with spans for blinking effect
      timestampDate.textContent = dateFormatted;
      const timeParts = timeFormatted.split(':');
      if (timeParts.length > 1) {
        timestampTime.innerHTML = timeParts.join(
          '<span class="colon">:</span>',
        );
      } else {
        timestampTime.textContent = timeFormatted;
      }
      lastFormattedTime = formatted;
      lastTimestampUpdate = now;
    }

    // Apply sun-based color scheme if location is available
    if (userLocation) {
      // Use sun position to determine colors
      const { altitude } = getSunPosition(
        currentTime.getTime(),
        userLocation.lng,
        userLocation.lat,
      );
      const altitudeDeg = altitude * (180 / Math.PI);
      let bgColor, textColor;

      if (altitudeDeg > 6) {
        bgColor = getCSSVar('--daylight-bg');
        textColor = getCSSVar('--daylight-text');
      } else if (altitudeDeg > -0.833) {
        bgColor = getCSSVar('--golden-bg');
        textColor = getCSSVar('--golden-text');
      } else if (altitudeDeg > -6) {
        bgColor = getCSSVar('--twilight-bg');
        textColor = getCSSVar('--twilight-text');
      } else if (altitudeDeg > -12) {
        bgColor = getCSSVar('--blue-hour-bg');
        textColor = getCSSVar('--blue-hour-text');
      } else {
        bgColor = getCSSVar('--night-bg');
        textColor = getCSSVar('--night-text');
      }
      document.documentElement.style.setProperty('--bg-color', bgColor);
      document.documentElement.style.setProperty('--text-color', textColor);
    } else {
      const isDark = hours < 7 || hours >= 19;
      const bgColor = isDark
        ? getCSSVar('--night-bg')
        : getCSSVar('--daylight-bg');
      const textColor = isDark
        ? getCSSVar('--night-text')
        : getCSSVar('--daylight-text');
      document.documentElement.style.setProperty('--bg-color', bgColor);
      document.documentElement.style.setProperty('--text-color', textColor);
    }
  }

  updateBlinkState();
  updateFavicon();
}
function updateFavicon() {
  const canvas = document.createElement('canvas');
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 1.25, 0, Math.PI * 2);
  ctx.stroke();
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const hourAngle = (((hours % 12) * 30 + minutes * 0.5 - 90) * Math.PI) / 180;
  const minuteAngle = ((minutes * 6 - 90) * Math.PI) / 180;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(hourAngle) * (radius * 0.5),
    centerY + Math.sin(hourAngle) * (radius * 0.5),
  );
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(minuteAngle) * (radius * 0.75),
    centerY + Math.sin(minuteAngle) * (radius * 0.75),
  );
  ctx.stroke();

  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
  ctx.fill();
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL();
}

function updateBlinkState() {
  const colons = timestampTime.querySelectorAll('.colon');
  colons.forEach((colon) => {
    if (!userHasInteracted) {
      colon.classList.add('blink');
    } else {
      colon.classList.remove('blink');
    }
  });
  resetBtn.disabled = !userHasInteracted;
}

function stopAutoUpdate() {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  }
  userHasInteracted = true;
}

function startAutoUpdate() {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
  }
  currentTime = new Date();
  userHasInteracted = false;
  updateDisplay(false);
  autoUpdateInterval = setInterval(() => {
    if (!userHasInteracted) {
      currentTime = new Date();
      updateDisplay(false);
    }
  }, 1000);
}

function resetToNow() {
  hourHand.style.transition = 'transform 0.5s ease-out';
  minuteHand.style.transition = 'transform 0.5s ease-out';
  startAutoUpdate();
}

function startDrag(e) {
  const rect = svg.getBoundingClientRect();
  const svgX = ((e.clientX - rect.left) / rect.width) * 200;
  const svgY = ((e.clientY - rect.top) / rect.height) * 200;
  const dx = svgX - 100;
  const dy = svgY - 100;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 96) {
    return;
  }

  stopAutoUpdate();
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  isTwoFingerTouch = activePointers.size >= 2;

  if (isDragging && dragPointerId !== null && dragPointerId !== e.pointerId) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  isDragging = true;
  dragPointerId = e.pointerId;
  needsRecalc = true;
  hourHand.style.transition = 'none';
  minuteHand.style.transition = 'none';
  dragStartTime = new Date(currentTime);
  lastAngle = getAngle(e);
  accumulatedRotation = 0;
  svg.classList.add('dragging');

  try {
    svg.setPointerCapture(e.pointerId);
  } catch (err) {}
}

function moveDrag(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (!isDragging || dragPointerId !== e.pointerId) return;

  e.preventDefault();
  e.stopPropagation();

  const currentAngle = getAngle(e);
  let delta = currentAngle - lastAngle;

  if (delta > PI) delta -= TWO_PI;
  else if (delta < -PI) delta += TWO_PI;

  if (e.shiftKey || isTwoFingerTouch) {
    delta *= window.__SPEED__;
  }

  accumulatedRotation += delta;
  lastAngle = currentAngle;

  const deltaMinutes = (accumulatedRotation * 60) / TWO_PI;
  currentTime = new Date(dragStartTime);
  currentTime.setMinutes(currentTime.getMinutes() + deltaMinutes);

  const newMinute = currentTime.getMinutes();
  if (newMinute !== lastMinute) {
    playTickSound();
    lastMinute = newMinute;
  }

  updateDisplay(true);
}

function endDrag(e) {
  if (e.pointerId !== undefined) {
    activePointers.delete(e.pointerId);
  }

  isTwoFingerTouch = activePointers.size >= 2;

  if (
    !isDragging ||
    (e.pointerId !== undefined && dragPointerId !== e.pointerId)
  ) {
    return;
  }

  if (e.pointerId !== undefined) {
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }

  isDragging = false;
  dragPointerId = null;
  hourHand.style.transition = '';
  minuteHand.style.transition = '';
  svg.classList.remove('dragging');
  updateDisplay(false);
}

function startPan(e) {
  if (e.pointerType !== 'touch') {
    return;
  }

  const target = e.target;
  if (target === svg || svg.contains(target)) {
    return;
  }

  if (isPanning && panPointerId !== null && panPointerId !== e.pointerId) {
    return;
  }

  isPanning = true;
  panPointerId = e.pointerId;
  panStartX = e.clientX;
  panStartY = e.clientY;
  lastPanY = e.clientY;
  panCommitted = false;
  e.preventDefault();
}

function movePan(e) {
  if (!isPanning || panPointerId !== e.pointerId) return;

  e.preventDefault();

  if (!panCommitted) {
    const deltaX = Math.abs(e.clientX - panStartX);
    const deltaY = Math.abs(e.clientY - panStartY);
    const threshold = 10;

    if (deltaX < threshold && deltaY < threshold) {
      return;
    }

    if (deltaY <= deltaX) {
      isPanning = false;
      panPointerId = null;
      return;
    }

    panCommitted = true;
    hourHand.style.transition = 'none';
    minuteHand.style.transition = 'none';
    stopAutoUpdate();
  }

  const deltaY = lastPanY - e.clientY;
  lastPanY = e.clientY;
  let deltaMinutes = deltaY / 10;

  if (e.shiftKey || isTwoFingerTouch) {
    deltaMinutes *= window.__SPEED__;
  }

  currentTime.setMinutes(currentTime.getMinutes() + deltaMinutes);

  const newMinute = currentTime.getMinutes();
  if (newMinute !== lastMinute) {
    playTickSound();
    lastMinute = newMinute;
  }

  updateDisplay();
}

function endPan(e) {
  if (
    !isPanning ||
    (e.pointerId !== undefined && panPointerId !== e.pointerId)
  ) {
    return;
  }

  hourHand.style.transition = '';
  minuteHand.style.transition = '';
  isPanning = false;
  panPointerId = null;
}

function onWheel(e) {
  e.preventDefault();
  stopAutoUpdate();
  hourHand.style.transition = 'none';
  minuteHand.style.transition = 'none';

  let deltaMinutes = e.deltaY > 0 ? 1 : -1;

  if (e.shiftKey || isTwoFingerTouch) {
    deltaMinutes *= window.__SPEED__;
  }

  currentTime.setMinutes(currentTime.getMinutes() + deltaMinutes);

  const newMinute = currentTime.getMinutes();
  if (newMinute !== lastMinute) {
    playTickSound();
    lastMinute = newMinute;
  }

  updateDisplay(false);

  setTimeout(() => {
    hourHand.style.transition = '';
    minuteHand.style.transition = '';
  }, 100);
}

startAutoUpdate();

fetchUserLocation().then((location) => {
  if (location) {
    userLocation = location;
    updateDisplay(false);
  }
});
svg.addEventListener('pointerdown', startDrag, { passive: false });
svg.addEventListener('pointermove', moveDrag, { passive: false });
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('lostpointercapture', endDrag);

document.addEventListener('pointerdown', startPan, { passive: false });
document.addEventListener('pointermove', movePan, { passive: false });
document.addEventListener('pointerup', endPan);
document.addEventListener('pointercancel', endPan);

document.addEventListener('wheel', onWheel, { passive: false });

resetBtn.addEventListener('click', resetToNow);

infoBtn.addEventListener('click', () => {
  infoDialog.showModal();
});

closeDialogBtn.addEventListener('click', () => {
  infoDialog.close();
});

infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog) {
    infoDialog.close();
  }
});

window.addEventListener('resize', () => {
  needsRecalc = true;
});

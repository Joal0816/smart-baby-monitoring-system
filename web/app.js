const screens = [...document.querySelectorAll('.screen')];
const navButtons = [...document.querySelectorAll('[data-screen]')];
const toast = document.querySelector('#toast');
const today = new Date();
const formatTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
let alertOpen = false;
let toastTimer;
let alertCreatedAt = null;
let previewUpdatedAt = Date.now();
let previewStale = false;
let staleAfterSeconds = 120;
let liveSession = false;
let liveStale = false;
let liveConfig = null;
let liveToken = '';
let liveLatest = null;
let liveReadings = [];
let liveEvents = [];
let liveReceivedAt = null;
let activeLiveEvent = null;
let liveRequestInFlight = false;
let liveError = null;
let livePollTimer = null;
const apiConfigStorageKey = 'little-monitor-api-settings';

const sidebarToggle = document.querySelector('#sidebar-toggle');
const sidebarStorageKey = 'little-monitor-sidebar-collapsed';
function setSidebarCollapsed(collapsed, persist = true) {
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  const label = collapsed ? 'Expand navigation' : 'Collapse navigation';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', label);
  sidebarToggle.title = label;
  sidebarToggle.dataset.tooltip = label;
  if (persist) {
    try {
      localStorage.setItem(sidebarStorageKey, String(collapsed));
    } catch {
      // The sidebar remains usable when browser storage is unavailable.
    }
  }
}

setSidebarCollapsed(document.documentElement.classList.contains('sidebar-collapsed'), false);
sidebarToggle.addEventListener('click', () => {
  setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed'));
});

document.querySelector('#history-date').textContent = today.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function navigate(name) {
  screens.forEach((screen) => {
    const selected = screen.id === `screen-${name}`;
    screen.classList.toggle('active', selected);
    screen.hidden = !selected;
  });
  navButtons.forEach((button) => {
    const selected = button.dataset.screen === name;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  document.querySelector(`#screen-${name} h1`)?.focus({ preventScroll: true });
}

navButtons.forEach((button) => button.addEventListener('click', () => navigate(button.dataset.screen)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));

const detailCopy = {
  temperature: {
    title: 'Temperature', unit: '°C', endpoint: 47,
    path: 'M8 78 C37 70 50 57 82 61 S126 73 157 60 S211 44 243 49 S302 58 352 47',
    note: 'A sample room-temperature reading. The badge follows your saved demo range.',
  },
  humidity: {
    title: 'Humidity', unit: '%', endpoint: 58,
    path: 'M8 66 C38 71 53 48 84 52 S124 59 157 68 S210 53 242 55 S305 43 352 58',
    note: 'A sample humidity reading. The badge follows your saved demo range.',
  },
  light: {
    title: 'Ambient light', unit: 'lux', endpoint: 39,
    path: 'M8 82 C39 77 53 85 84 72 S127 57 158 65 S207 47 243 53 S305 63 352 39',
    note: 'A sample light level near the monitor. The trend is an illustration, not recorded history.',
  },
  device: {
    title: 'Device health', unit: '', endpoint: 45,
    path: 'M8 72 C40 65 51 70 84 63 S127 54 158 59 S211 48 243 53 S305 41 352 45',
    note: 'This preview status is sample data; it does not check a connected physical device.',
  },
};

const detailDialog = document.querySelector('#reading-detail');
const detailStatus = document.querySelector('#reading-detail-state');
function openReadingDetails(card) {
  const reading = detailCopy[card.dataset.reading];
  if (!reading) return;
  const badge = card.querySelector('.reading-state');
  const status = badge?.textContent.trim()
    || (card.dataset.reading === 'device' ? document.querySelector('#device-state').textContent : 'Sample');
  const value = card.querySelector('.reading-value, .hotspot-value')?.textContent.trim()
    || (card.dataset.reading === 'device' ? document.querySelector('#device-value').textContent : '—');
  document.querySelector('#reading-detail-title').textContent = reading.title;
  document.querySelector('#reading-detail-value').textContent = reading.unit
    ? value.replace(/(°C|°|%|lux)$/i, '').trim()
    : value;
  document.querySelector('#reading-detail-unit').textContent = reading.unit;
  detailStatus.textContent = status;
  const warningStatuses = ['Check range', 'Offline', 'Stale data', 'Stale preview', 'Update failed', 'Unavailable', 'Needs care'];
  const neutralStatuses = ['Lamp on', 'Dim', 'Measured'];
  const statusTone = warningStatuses.includes(status) ? 'warning'
    : neutralStatuses.includes(status) ? 'neutral' : 'good';
  detailStatus.className = `reading-state ${statusTone}`;
  document.querySelector('#reading-detail-description').textContent = liveSession
    ? `Latest value received from the connected device at ${formatDateTime(liveLatest?.received_at || liveLatest?.reading?.received_at)}.`
    : reading.note;
  const rangeWarning = status === 'Check range';
  document.querySelector('#detail-settings-link').hidden = liveSession || !rangeWarning;
  if (rangeWarning) {
    document.querySelector('#reading-detail-description').textContent = `This sample ${reading.title.toLowerCase()} value is outside the demo range you set. These preview thresholds are not safety guidance.`;
  }
  const line = document.querySelector('#detail-chart-line');
  const area = document.querySelector('#detail-chart-area');
  const point = document.querySelector('#detail-chart-point');
  document.querySelector('.detail-chart').hidden = liveSession;
  document.querySelector('.chart-caption').textContent = liveSession
    ? 'Historical readings are available on Event history.'
    : 'Illustrative preview trend · not historical device data';
  line.setAttribute('d', reading.path);
  area.setAttribute('d', `${reading.path} V108 H8Z`);
  point.setAttribute('cy', String(reading.endpoint));
  document.querySelector('.detail-chart').setAttribute('aria-label', `Illustrative ${reading.title.toLowerCase()} trend over recent sample readings`);
  line.style.stroke = statusTone === 'warning' ? 'var(--coral)' : '';
  point.style.stroke = statusTone === 'warning' ? 'var(--coral)' : '';
  if (typeof detailDialog.showModal === 'function') detailDialog.showModal();
  else detailDialog.setAttribute('open', '');
}

document.querySelectorAll('[data-reading]').forEach((card) => {
  card.addEventListener('click', () => openReadingDetails(card));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openReadingDetails(card);
    }
  });
});
document.querySelector('#close-reading-detail').addEventListener('click', () => detailDialog.close());
document.querySelector('#detail-settings-link').addEventListener('click', () => {
  detailDialog.close();
  navigate('settings');
});
detailDialog.addEventListener('click', (event) => {
  if (event.target === detailDialog) detailDialog.close();
});

function addHistoryEvent({ kind, title, description, iconClass, iconMarkup, time = formatTime(new Date()), needsReview = false }) {
  const item = document.createElement('li');
  item.dataset.kind = kind;
  if (needsReview) item.dataset.pendingReview = 'true';
  const icon = document.createElement('span');
  icon.className = `event-icon ${iconClass}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = iconMarkup;
  const copy = document.createElement('span');
  copy.className = 'event-copy';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('small');
  detail.textContent = description;
  copy.append(heading);
  if (needsReview) {
    const state = document.createElement('span');
    state.className = 'event-review-state';
    state.textContent = 'Needs review';
    copy.append(state);
  }
  copy.append(detail);
  const timeNode = document.createElement('time');
  timeNode.textContent = time;
  item.append(icon, copy, timeNode);
  timeNode.dateTime = new Date().toISOString();
  if (needsReview) {
    const review = document.createElement('button');
    review.className = 'event-review-button';
    review.type = 'button';
    review.dataset.reviewAlert = 'true';
    review.textContent = 'Review';
    review.setAttribute('aria-label', `Mark ${title} reviewed`);
    item.append(review);
  }
  document.querySelector('#history-list').prepend(item);
  document.querySelector('#history-count').textContent = document.querySelectorAll('#history-list li').length;
  renderRecentActivity();
  filterHistory();
}

function renderRecentActivity() {
  const recent = [...document.querySelectorAll('#history-list li')].slice(0, 3);
  const list = document.querySelector('#recent-list');
  list.replaceChildren(...recent.map((source) => {
    const clone = source.cloneNode(true);
    clone.hidden = false;
    clone.removeAttribute('data-kind');
    clone.querySelector('[data-review-alert]')?.remove();
    clone.querySelector('[data-event-review-id]')?.remove();
    return clone;
  }));
}

function refreshSampleEventTimes() {
  const now = Date.now();
  const ages = [8, 23, 46];
  [...document.querySelectorAll('#history-list li')].forEach((item, index) => {
    const timestamp = new Date(now - ages[index] * 60_000);
    const time = item.querySelector('time');
    time.textContent = formatTime(timestamp);
    time.dateTime = timestamp.toISOString();
  });
  renderRecentActivity();
}
refreshSampleEventTimes();

function updateAlertView() {
  if (liveSession) {
    updateLiveDashboardStatus();
    return;
  }
  const panel = document.querySelector('#hero-panel');
  const status = document.querySelector('#hero-status');
  const title = document.querySelector('#hero-title');
  const message = document.querySelector('#hero-message');
  const alertButton = document.querySelector('#simulate-alert');
  const alertActions = document.querySelector('#alert-actions');
  if (alertOpen) {
    panel.classList.add('alert');
    panel.classList.remove('stale');
    status.innerHTML = '<i class="live-indicator"></i><span>SAMPLE ALERT · NEEDS REVIEW</span>';
    title.textContent = 'Cry alert · sample';
    message.textContent = `A sample alert was added at ${alertCreatedAt}. No audio was recorded or analyzed.`;
    alertButton.textContent = 'Mark reviewed';
    alertButton.setAttribute('aria-label', 'Mark the sample cry alert reviewed');
    alertButton.classList.add('button-primary');
    alertButton.classList.remove('button-secondary');
    alertActions.hidden = false;
  } else if (previewStale) {
    panel.classList.remove('alert');
    panel.classList.add('stale');
    status.innerHTML = '<i class="live-indicator"></i><span>SAMPLE DATA · STALE</span>';
    title.textContent = 'Sample data is out of date';
    message.textContent = `No sample refresh for ${formatElapsed(Math.floor((Date.now() - previewUpdatedAt) / 1000))}. This timer does not check a physical monitor.`;
    alertButton.textContent = 'Refresh sample readings';
    alertButton.setAttribute('aria-label', 'Refresh sample readings');
    alertButton.classList.add('button-secondary');
    alertButton.classList.remove('button-primary');
    alertActions.hidden = true;
  } else {
    panel.classList.remove('alert');
    panel.classList.remove('stale');
    status.innerHTML = '<i class="live-indicator"></i><span>PREVIEW ACTIVE</span>';
    title.textContent = 'Room preview is ready';
    message.textContent = 'Sample room readings are shown below. No audio is recorded.';
    alertButton.textContent = 'Simulate cry alert';
    alertButton.setAttribute('aria-label', 'Simulate a cry alert');
    alertButton.classList.add('button-secondary');
    alertButton.classList.remove('button-primary');
    alertActions.hidden = true;
  }
}

function markAlertReviewed() {
  alertOpen = false;
  const pendingEvent = document.querySelector('#history-list li[data-pending-review="true"]');
  if (pendingEvent) {
    delete pendingEvent.dataset.pendingReview;
    pendingEvent.querySelector('.event-copy small').textContent = `Reviewed at ${formatTime(new Date())} · sample event · no audio was recorded`;
    const state = pendingEvent.querySelector('.event-review-state');
    if (state) {
      state.textContent = 'Reviewed';
      state.classList.add('reviewed');
    }
    pendingEvent.querySelector('[data-review-alert]')?.remove();
    renderRecentActivity();
    filterHistory();
  }
  updateAlertView();
  showToast('Sample alert marked reviewed.');
}

document.querySelector('#simulate-alert').addEventListener('click', () => {
  if (liveSession) return;
  if (previewStale && !alertOpen) {
    markPreviewUpdated();
    showToast('Sample timer reset. This did not contact a physical monitor.');
    return;
  }
  if (!alertOpen) {
    alertOpen = true;
    alertCreatedAt = formatTime(new Date());
    const cryIcon = '<svg viewBox="0 0 24 24"><path d="M12 3.5S5.5 11 5.5 15.2a6.5 6.5 0 0 0 13 0C18.5 11 12 3.5 12 3.5Z"/><path d="M9 16.2a3 3 0 0 0 3 3"/></svg>';
    addHistoryEvent({ kind: 'cry', title: 'Simulated cry alert', description: `Sample event · no audio recorded · ${alertCreatedAt}`, iconClass: 'cry-event-icon', iconMarkup: cryIcon, needsReview: true });
    updateAlertView();
    showToast('Sample alert added. Follow your usual room-check routine.');
  } else {
    markAlertReviewed();
  }
});
document.querySelector('#acknowledge-alert').addEventListener('click', () => {
  if (liveSession && activeLiveEvent) acknowledgeLiveEvent(activeLiveEvent.event_id);
  else markAlertReviewed();
});
document.querySelector('#open-alert-history').addEventListener('click', () => navigate('history'));
document.querySelector('#history-list').addEventListener('click', (event) => {
  if (event.target.closest('[data-review-alert]')) markAlertReviewed();
});

function formatElapsed(seconds) {
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function updatePreviewFreshness() {
  const ageSeconds = Math.floor((Date.now() - previewUpdatedAt) / 1000);
  const age = formatElapsed(ageSeconds);
  document.querySelector('#last-updated').textContent = age;
  document.querySelector('#updated-label').textContent = 'Sample updated';
  document.querySelector('#reading-age').textContent = `Preview · ${age}`;
  const isStale = ageSeconds >= staleAfterSeconds;
  if (isStale === previewStale) return;
  previewStale = isStale;
  const state = document.querySelector('#device-state');
  const value = document.querySelector('#device-value');
  const foot = document.querySelector('#device-foot');
  const range = document.querySelector('#device-range');
  const gauge = document.querySelector('#device-gauge');
  const dot = document.querySelector('#freshness-dot');
  state.textContent = isStale ? 'Stale preview' : 'Preview';
  state.classList.toggle('warning', isStale);
  state.classList.toggle('neutral', !isStale);
  value.textContent = isStale ? 'Refresh needed' : 'Sample only';
  foot.textContent = isStale ? 'No sample refresh received' : 'No physical monitor connected';
  range.style.width = isStale ? '0%' : '100%';
  gauge.style.strokeDashoffset = isStale ? '226' : '0';
  gauge.style.stroke = isStale ? 'var(--coral)' : '';
  dot.classList.toggle('stale-dot', isStale);
  updateAlertView();
  if (isStale) {
    const icon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/></svg>';
    addHistoryEvent({ kind: 'device', title: 'Sample readings became stale', description: `No preview refresh for ${formatElapsed(ageSeconds)} · no live device is connected`, iconClass: 'device-event-icon stale-event-icon', iconMarkup: icon });
    showToast('Sample readings are stale. Refresh them or adjust the preview timer in Settings.');
  } else {
    const recoveredIcon = '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.7-3L4 10M4 5v5h5M4 13a8 8 0 0 0 14.7 3L20 14m0 5v-5h-5"/></svg>';
    addHistoryEvent({ kind: 'device', title: 'Sample preview refreshed', description: 'Timer reset · physical monitor was not contacted', iconClass: 'device-event-icon', iconMarkup: recoveredIcon });
    showToast('Sample timer reset. This did not contact a physical monitor.');
  }
}

function updateFreshness() {
  if (liveSession) updateLiveFreshness();
  else updatePreviewFreshness();
}

function markPreviewUpdated() {
  previewUpdatedAt = Date.now();
  updateFreshness();
}

window.setInterval(updateFreshness, 5000);

document.querySelector('#refresh-button').addEventListener('click', (event) => {
  if (liveSession) {
    pollLiveData({ manual: true });
    return;
  }
  const button = event.currentTarget;
  const readingsGrid = document.querySelector('.readings-grid');
  button.disabled = true;
  button.classList.add('is-refreshing');
  button.setAttribute('aria-busy', 'true');
  readingsGrid.classList.remove('refreshing');
  void readingsGrid.offsetWidth;
  readingsGrid.classList.add('refreshing');
  readingsGrid.setAttribute('aria-busy', 'true');
  markPreviewUpdated();
  showToast('Preview readings refreshed. Sample values are unchanged.');
  window.setTimeout(() => {
    button.disabled = false;
    button.classList.remove('is-refreshing');
    button.removeAttribute('aria-busy');
    readingsGrid.classList.remove('refreshing');
    readingsGrid.removeAttribute('aria-busy');
  }, 700);
});

function filterHistory() {
  const query = document.querySelector('#history-search').value.trim().toLowerCase();
  const category = document.querySelector('#history-filter').value;
  let shown = 0;
  document.querySelectorAll('#history-list li').forEach((item) => {
    const matchesText = item.textContent.toLowerCase().includes(query);
    const matchesCategory = category === 'all'
      || (category === 'pending' ? item.dataset.pendingReview === 'true' : item.dataset.kind === category);
    item.hidden = !(matchesText && matchesCategory);
    if (!item.hidden) shown += 1;
  });
  const empty = document.querySelector('#history-empty');
  empty.hidden = shown !== 0;
  if (isInitialLiveLoading()) {
    empty.textContent = 'Loading events from the backend…';
  } else if (liveSession && liveEvents.length === 0 && !query && category === 'all') {
    empty.textContent = 'No events have been received from this device yet.';
  } else {
    empty.textContent = 'No events match these filters.';
  }
}
function isInitialLiveLoading() {
  return liveSession && liveRequestInFlight && !liveLatest && !liveError;
}
document.querySelector('#history-search').addEventListener('input', filterHistory);
document.querySelector('#history-filter').addEventListener('change', filterHistory);

const trendSamples = {
  day: {
    temperature: [22.8, 23.0, 23.2, 23.1, 23.4, 23.4],
    humidity: [58, 57, 56, 57, 56, 56],
  },
  week: {
    temperature: [23.0, 22.9, 23.2, 23.1, 23.3, 23.4, 23.4],
    humidity: [59, 58, 57, 56, 55, 56, 56],
  },
};

function renderTrend() {
  const metric = document.querySelector('#trend-metric').value;
  const period = document.querySelector('#trend-period').value;
  const isTemperature = metric === 'temperature';
  const field = isTemperature ? 'temperature_c' : 'humidity_pct';
  const rangeMs = period === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const rangeLabel = period === 'day' ? '24 hours' : '7 days';
  const liveRows = liveSession
    ? liveReadings.filter((reading) => Number.isFinite(Number(reading[field]))
      && reading[field] !== null && Date.parse(reading.captured_at) >= Date.now() - rangeMs)
      .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
    : [];
  const values = liveSession ? liveRows.map((reading) => Number(reading[field])) : trendSamples[period][metric];
  const chart = document.querySelector('#trend-chart');
  const summary = document.querySelector('#trend-summary');
  const empty = document.querySelector('#trend-empty');
  const title = document.querySelector('#trend-chart-title');
  const description = document.querySelector('#trend-chart-description');
  const startLabel = document.querySelector('#trend-start-label');
  const endLabel = document.querySelector('#trend-end-label');
  document.querySelector('#trend-description-label').textContent = liveSession
    ? `Recorded readings · ${liveConfig?.deviceId || 'connected device'}`
    : 'Illustrative sample values · no device history connected';
  if (values.length === 0) {
    chart.hidden = true;
    summary.hidden = true;
    empty.hidden = false;
    empty.textContent = isInitialLiveLoading()
      ? 'Loading recorded readings from the backend…'
      : liveReadings.length
        ? `No ${metric} readings were received in the past ${rangeLabel}.`
        : `No ${metric} readings have been received from this device yet.`;
    title.textContent = `No ${metric} readings for the selected period`;
    description.textContent = empty.textContent;
    return;
  }
  chart.hidden = false;
  summary.hidden = false;
  empty.hidden = true;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * .35, isTemperature ? .18 : 2);
  const low = min - padding;
  const high = max + padding;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 700 : 36 + index * (664 / (values.length - 1));
    const y = 155 - ((value - low) / (high - low)) * 125;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points.at(-1).split(',');
  const unit = isTemperature ? '°C' : '%';
  document.querySelector('#trend-line').setAttribute('points', points.join(' '));
  document.querySelector('#trend-point').setAttribute('cx', last[0]);
  document.querySelector('#trend-point').setAttribute('cy', last[1]);
  if (liveSession) {
    const firstAt = liveRows[0].captured_at;
    const lastAt = liveRows.at(-1).captured_at;
    title.textContent = `${isTemperature ? 'Temperature' : 'Humidity'} readings from the connected device`;
    description.textContent = `${values.length} readings received. Values ranged from ${min}${unit} to ${max}${unit}.`;
    startLabel.textContent = formatTime(new Date(firstAt));
    endLabel.textContent = formatTime(new Date(lastAt));
    summary.textContent = `${values.length} device readings in the past ${rangeLabel}. Range: ${min}–${max}${unit}. Latest: ${values.at(-1)}${unit}.`;
  } else {
    const sampleRangeLabel = period === 'day' ? 'past 24 hours' : 'past 7 days';
    title.textContent = `Illustrative ${isTemperature ? 'temperature' : 'humidity'} trend over the ${sampleRangeLabel}`;
    description.textContent = `Example values range from ${min}${unit} to ${max}${unit}. These are not measurements from a connected monitor.`;
    startLabel.textContent = period === 'day' ? '24 hours ago' : '7 days ago';
    endLabel.textContent = 'Now';
    summary.textContent = `Sample ${isTemperature ? 'temperature' : 'humidity'}: ${min}–${max}${unit} over ${rangeLabel}. Latest example: ${values.at(-1)}${unit}.`;
  }
}

document.querySelector('#trend-metric').addEventListener('change', renderTrend);
document.querySelector('#trend-period').addEventListener('change', renderTrend);
renderTrend();

function refreshDemoBands(settings) {
  const temperature = Number(document.querySelector('#temp-value').textContent);
  const humidity = Number(document.querySelector('#humidity-value').textContent);
  const temperatureState = document.querySelector('.temperature-card .reading-state');
  const humidityState = document.querySelector('.humidity-card .reading-state');
  const temperatureInRange = temperature >= settings.tempMin && temperature <= settings.tempMax;
  const humidityInRange = humidity >= settings.humidityMin && humidity <= settings.humidityMax;
  const temperatureProgress = Math.max(0, Math.min(1, temperature / 40));
  const humidityProgress = Math.max(0, Math.min(1, humidity / 100));
  document.querySelector('#temperature-gauge').style.strokeDashoffset = String(226 * (1 - temperatureProgress));
  document.querySelector('#humidity-gauge').style.strokeDashoffset = String(226 * (1 - humidityProgress));
  document.querySelector('.temperature-card .mini-range i').style.width = `${temperatureProgress * 100}%`;
  document.querySelector('.humidity-card .mini-range i').style.width = `${humidityProgress * 100}%`;
  temperatureState.textContent = temperatureInRange ? 'In range' : 'Check range';
  temperatureState.classList.toggle('good', temperatureInRange);
  temperatureState.classList.toggle('warning', !temperatureInRange);
  humidityState.textContent = humidityInRange ? 'In range' : 'Check range';
  humidityState.classList.toggle('good', humidityInRange);
  humidityState.classList.toggle('warning', !humidityInRange);
  document.querySelector('.temperature-card .reading-foot').textContent = `Demo range · ${settings.tempMin}–${settings.tempMax} °C`;
  document.querySelector('.humidity-card .reading-foot').textContent = `Demo range · ${settings.humidityMin}–${settings.humidityMax}%`;
  const issues = [];
  if (!temperatureInRange) issues.push('temperature');
  if (!humidityInRange) issues.push('humidity');
  const alert = document.querySelector('#environment-alert');
  alert.hidden = issues.length === 0;
  if (issues.length) {
    document.querySelector('#environment-alert-copy').textContent = `Sample ${issues.join(' and ')} ${issues.length === 1 ? 'value is' : 'values are'} outside your chosen demo range. The readings are examples, not live room conditions.`;
  }
}

document.querySelector('#review-environment-ranges').addEventListener('click', () => navigate(liveSession ? 'history' : 'settings'));

let demoLampOn = true;
function setDemoLamp(isOn, announce = false) {
  demoLampOn = isOn;
  const lampButton = document.querySelector('#toggle-lamp');
  const lightValue = isOn ? 42 : 12;
  const lightCard = document.querySelector('.light-card');
  document.querySelector('#nursery-scene').classList.toggle('lamp-off', !isOn);
  lampButton.setAttribute('aria-pressed', String(isOn));
  lampButton.setAttribute('aria-label', isOn ? 'Turn off the demo nursery lamp' : 'Turn on the demo nursery lamp');
  document.querySelector('#lamp-label').textContent = isOn ? 'Demo lamp on' : 'Demo lamp dimmed';
  document.querySelector('#light-value').textContent = String(lightValue);
  lightCard.querySelector('.reading-state').textContent = isOn ? 'Lamp on' : 'Dim';
  lightCard.querySelector('.reading-foot').textContent = `Demo lamp · ${isOn ? 'on' : 'dimmed'}`;
  const progress = Math.max(0, Math.min(1, lightValue / 100));
  document.querySelector('#light-gauge').style.strokeDashoffset = String(226 * (1 - progress));
  lightCard.querySelector('.mini-range i').style.width = `${progress * 100}%`;
    markPreviewUpdated();
  if (announce) {
    const icon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>';
    addHistoryEvent({
      kind: 'room',
      title: isOn ? 'Demo lamp turned on' : 'Demo lamp dimmed',
      description: `Sample room light is now ${lightValue} lux · no device was changed`,
      iconClass: 'light-event-icon',
      iconMarkup: icon,
    });
    showToast(`Demo lamp ${isOn ? 'on' : 'dimmed'} · sample reading ${lightValue} lux.`);
  }
}

document.querySelector('#toggle-lamp').addEventListener('click', () => setDemoLamp(!demoLampOn, true));

function applyPreviewPreferences(settings) {
  const quietEnabled = Boolean(settings.quietHours);
  const quietPill = document.querySelector('#quiet-pill');
  quietPill.hidden = !quietEnabled;
  quietPill.setAttribute('aria-label', quietEnabled ? 'Quiet hours preference enabled in preview' : '');
}

document.querySelector('#save-settings').addEventListener('click', () => {
  const rangeFields = ['#temp-min', '#temp-max', '#humidity-min', '#humidity-max']
    .map((selector) => document.querySelector(selector));
  const invalidField = rangeFields.find((field) => !field.checkValidity());
  if (invalidField) {
    invalidField.reportValidity();
    document.querySelector('#settings-saved').textContent = 'Please enter values within the shown limits.';
    return;
  }
  const settings = {
    tempMin: Number(rangeFields[0].value),
    tempMax: Number(rangeFields[1].value),
    humidityMin: Number(rangeFields[2].value),
    humidityMax: Number(rangeFields[3].value),
    staleAfter: Number(document.querySelector('#stale-after').value),
    notifyCry: document.querySelector('#notify-cry').checked,
    notifyEnvironment: document.querySelector('#notify-environment').checked,
    quietHours: document.querySelector('#quiet-hours').checked,
  };
  if (settings.tempMin >= settings.tempMax || settings.humidityMin >= settings.humidityMax) {
    document.querySelector('#settings-saved').textContent = 'Each minimum must be lower than its maximum.';
    return;
  }
  if (![30, 60, 120, 300].includes(settings.staleAfter)) {
    document.querySelector('#settings-saved').textContent = 'Choose one of the listed sample freshness intervals.';
    return;
  }
  localStorage.setItem('little-monitor-demo-settings', JSON.stringify(settings));
  staleAfterSeconds = settings.staleAfter;
  if (!liveSession) refreshDemoBands(settings);
  if (!liveSession) applyPreviewPreferences(settings);
  updateFreshness();
  document.querySelector('#settings-saved').textContent = liveSession
    ? 'Freshness limit saved. Room ranges and notification preferences apply to sample preview only.'
    : settings.quietHours
      ? 'Settings saved in this browser · quiet-hours preference is on.'
      : 'Settings saved in this browser preview.';
});


const storedSettings = localStorage.getItem('little-monitor-demo-settings');
if (storedSettings) {
  try {
    const settings = JSON.parse(storedSettings);
    document.querySelector('#temp-min').value = settings.tempMin;
    document.querySelector('#temp-max').value = settings.tempMax;
    document.querySelector('#humidity-min').value = settings.humidityMin;
    document.querySelector('#humidity-max').value = settings.humidityMax;
    document.querySelector('#stale-after').value = settings.staleAfter ?? 120;
    document.querySelector('#notify-cry').checked = settings.notifyCry ?? true;
    document.querySelector('#notify-environment').checked = settings.notifyEnvironment ?? true;
    document.querySelector('#quiet-hours').checked = settings.quietHours ?? false;
    if ([settings.tempMin, settings.tempMax, settings.humidityMin, settings.humidityMax].every(Number.isFinite)
        && settings.tempMin < settings.tempMax && settings.humidityMin < settings.humidityMax) {
      refreshDemoBands(settings);
      applyPreviewPreferences(settings);
      staleAfterSeconds = [30, 60, 120, 300].includes(Number(settings.staleAfter)) ? Number(settings.staleAfter) : 120;
      updateFreshness();
    } else {
      localStorage.removeItem('little-monitor-demo-settings');
    }
  } catch {
    localStorage.removeItem('little-monitor-demo-settings');
  }
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'time unavailable';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function setDashboardMode(mode, label) {
  const pill = document.querySelector('#mode-pill');
  pill.classList.toggle('mode-live', mode === 'live');
  pill.classList.toggle('mode-empty', mode === 'empty');
  pill.classList.toggle('mode-error', mode === 'error');
  pill.classList.toggle('mode-loading', mode === 'loading');
  document.querySelector('#mode-label').textContent = label;
  const live = Boolean(liveSession);
  document.querySelector('#footer-data-mode').textContent = live
    ? `Live API · ${liveConfig?.deviceId || 'device'}` : 'Room values use sample data';
  document.querySelector('#sidebar-device-title').textContent = live ? (liveConfig?.deviceId || 'Monitor') : 'Nursery preview';
  document.querySelector('#sidebar-device-status').textContent = live ? label : 'Preview only · no device';
  document.querySelector('#sidebar-device').setAttribute('aria-label', live
    ? `Monitor status: ${label}` : 'Nursery preview status, sample only');
  document.querySelector('#sidebar-device').dataset.tooltip = live
    ? `${liveConfig?.deviceId || 'Monitor'} · ${label}` : 'Nursery preview · no physical monitor connected';
  document.querySelector('#sidebar-device-dot').classList.toggle('stale-dot', mode === 'error');
  document.querySelector('#sidebar-device-dot').classList.toggle('empty-dot', mode === 'empty');
  document.querySelector('#sidebar-device-dot').classList.toggle('preview-dot', !live);
  document.querySelector('#sidebar-device-dot').classList.toggle('status-dot', true);
  document.querySelector('#quiet-pill').hidden = live || !document.querySelector('#quiet-hours').checked;
}

function setConnectionState(state, title, detail, tag) {
  const root = document.querySelector('#connection-state');
  root.className = `connection-state ${state}`;
  document.querySelector('#connection-state-title').textContent = title;
  document.querySelector('#connection-state-detail').textContent = detail;
  document.querySelector('#connection-tag').textContent = tag;
}

function setConnectionFeedback(message, state = '') {
  const feedback = document.querySelector('#connection-feedback');
  feedback.textContent = message;
  feedback.className = `connection-feedback${state ? ` ${state}` : ''}`;
}

function setConnectionBanner(state, title, message, allowRetry = false) {
  const banner = document.querySelector('#connection-banner');
  banner.hidden = !state;
  banner.className = `connection-banner${state ? ` ${state}` : ''}`;
  document.querySelector('#connection-banner-title').textContent = title || '';
  document.querySelector('#connection-banner-message').textContent = message || '';
  const retry = document.querySelector('#retry-connection');
  retry.hidden = !allowRetry;
  retry.disabled = liveRequestInFlight;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function liveFaults() {
  const reading = liveLatest?.reading;
  return parseArray(reading?.sensor_faults_json || liveLatest?.device?.last_faults_json)
    .filter((fault) => typeof fault === 'string' && fault.trim());
}

function updateLiveDashboardStatus() {
  if (!liveSession) return;
  const panel = document.querySelector('#hero-panel');
  const status = document.querySelector('#hero-status');
  const title = document.querySelector('#hero-title');
  const message = document.querySelector('#hero-message');
  const actions = document.querySelector('#alert-actions');
  const actionButton = document.querySelector('#acknowledge-alert');
  const reading = liveLatest?.reading;
  const online = liveLatest?.device?.network_status === 'online';
  const faults = liveFaults();
  const openEvent = liveEvents.find((event) => !event.acknowledged_at && !event.resolved_at);
  activeLiveEvent = openEvent || null;
  panel.classList.remove('alert', 'stale');

  if (liveError) {
    panel.classList.add('stale');
    status.innerHTML = '<i class="live-indicator"></i><span>BACKEND CONNECTION ISSUE</span>';
    title.textContent = 'Connection interrupted';
    message.textContent = reading
      ? `Showing the last reading received at ${formatDateTime(liveReceivedAt)}. Retry the API connection to get current data.`
      : 'The backend could not be reached. Check the URL, app token, CORS origin, and service status.';
    actions.hidden = true;
  } else if (openEvent) {
    panel.classList.add('alert');
    status.innerHTML = '<i class="live-indicator"></i><span>LIVE EVENT · NEEDS REVIEW</span>';
    title.textContent = openEvent.summary || 'Monitor event needs review';
    message.textContent = `Recorded at ${formatDateTime(openEvent.captured_at || openEvent.created_at)}. Review the event details and follow your normal supervision routine.`;
    const nextStep = openEvent.kind === 'device_fault'
      ? 'Check the sensor and monitor connection, then confirm that new readings arrive.'
      : openEvent.kind === 'environment'
        ? 'Review the room and the backend-configured demo threshold for this event.'
        : 'Follow your usual room-check routine. This prototype cannot confirm an event’s cause.';
    document.querySelector('#alert-next-step').innerHTML = `<strong>Next step:</strong> ${nextStep}`;
    actionButton.textContent = 'Acknowledge event';
    actionButton.setAttribute('aria-label', `Acknowledge event: ${openEvent.summary || 'monitor event'}`);
    actions.hidden = false;
  } else if (!reading) {
    status.innerHTML = '<i class="live-indicator"></i><span>BACKEND CONNECTED · WAITING FOR DATA</span>';
    title.textContent = 'Waiting for the first reading';
    message.textContent = 'The API is connected, but this device has not sent a sensor reading yet. Check the board and telemetry service.';
    actions.hidden = true;
  } else if (liveStale || !online || faults.length) {
    panel.classList.add('stale');
    status.innerHTML = '<i class="live-indicator"></i><span>DEVICE DATA NEEDS ATTENTION</span>';
    title.textContent = faults.length ? 'A device sensor needs attention' : liveStale ? 'No recent readings' : 'Monitor is offline';
    message.textContent = faults.length
      ? `Reported device faults: ${faults.join(', ')}.`
      : `Last data received ${formatElapsed(Math.max(0, Math.floor((Date.now() - liveReceivedAt) / 1000)))}. Check the connection and retry.`;
    actions.hidden = true;
  } else {
    status.innerHTML = '<i class="live-indicator"></i><span>LIVE DEVICE DATA</span>';
    title.textContent = 'Latest room reading received';
    message.textContent = `Data received at ${formatDateTime(liveReceivedAt)}. The cards show the latest values reported by ${liveConfig.deviceId}.`;
    actions.hidden = true;
  }
  document.querySelector('#demo-controls').hidden = true;
  document.querySelector('#toggle-lamp').hidden = true;
}

function updateLiveFreshness() {
  if (liveRequestInFlight && !liveLatest && !liveError) {
    setConnectionState('loading', 'Connecting to backend', 'Checking service health and loading device readings.', 'Connecting');
    setConnectionBanner('loading', 'Connecting to backend', 'Checking service health and loading the latest readings and events.', false);
    setDashboardMode('loading', 'Connecting…');
    document.querySelector('#updated-label').textContent = 'Waiting for connection';
    document.querySelector('#last-updated').textContent = '—';
    document.querySelector('#reading-age').textContent = 'Connecting to backend…';
    return;
  }
  const reading = liveLatest?.reading;
  const received = liveLatest?.received_at || reading?.received_at;
  const receivedMs = received ? Date.parse(received) : NaN;
  liveReceivedAt = Number.isFinite(receivedMs) ? receivedMs : null;
  const ageSeconds = liveReceivedAt === null ? null : Math.max(0, Math.floor((Date.now() - liveReceivedAt) / 1000));
  liveStale = Boolean(reading) && (ageSeconds === null || ageSeconds >= staleAfterSeconds);
  const age = ageSeconds === null ? null : formatElapsed(ageSeconds);
  document.querySelector('#last-updated').textContent = age ? age : 'No data received';
  document.querySelector('#updated-label').textContent = 'Last received';
  document.querySelector('#reading-age').textContent = age ? `Received ${age}` : 'Waiting for first reading';
  const state = document.querySelector('#device-state');
  const value = document.querySelector('#device-value');
  const foot = document.querySelector('#device-foot');
  const range = document.querySelector('#device-range');
  const gauge = document.querySelector('#device-gauge');
  const dot = document.querySelector('#freshness-dot');
  const faults = liveFaults();
  const online = liveLatest?.device?.network_status === 'online';
  const deviceLabel = !reading ? liveError ? 'Unavailable' : 'No readings' : faults.length ? 'Needs care' : liveStale ? 'Stale data' : online ? 'Online' : 'Offline';
  state.textContent = deviceLabel;
  state.className = `reading-state ${!reading && !liveError ? 'empty' : !reading || faults.length || liveStale || !online ? 'warning' : 'good'}`;
  value.textContent = !reading ? 'Waiting' : faults.length ? 'Check monitor' : liveStale || !online ? 'Check connection' : 'Connected';
  foot.textContent = faults.length ? faults.join(', ') : age ? `Last received ${age}` : 'No sensor data received';
  range.style.width = !reading || liveStale || !online || faults.length ? '0%' : '100%';
  gauge.style.strokeDashoffset = !reading || liveStale || !online || faults.length ? '226' : '0';
  gauge.style.stroke = !reading || liveStale || !online || faults.length ? 'var(--coral)' : '';
  dot.classList.toggle('stale-dot', Boolean(liveError) || Boolean(reading && (liveStale || !online || faults.length)));
  dot.classList.toggle('empty-dot', !reading && !liveError);
  dot.classList.toggle('preview-dot', false);

  if (liveError) {
    setConnectionState('error', 'Backend connection interrupted', reading ? 'The last successful reading is kept visible with its received time.' : 'The dashboard could not load readings from the backend.', 'Retry');
    setConnectionBanner('error', 'Could not refresh live data', `${friendlyApiError(liveError)}${reading ? ' The last received values remain visible.' : ''}`, true);
    setDashboardMode('error', 'Connection issue');
  } else if (!reading) {
    setConnectionState('empty', 'Backend connected; no readings yet', 'The device has not uploaded telemetry for this ID.', 'Waiting');
    setConnectionBanner('empty', 'No readings received', 'The backend is reachable, but it has no sensor data for this device yet. Check the device ID and telemetry service.', false);
    setDashboardMode('empty', 'Live API · waiting');
  } else if (liveStale) {
    setConnectionState('error', 'Latest reading is stale', `Last received ${age}.`, 'Stale');
    setConnectionBanner('stale', 'No recent device readings', `The last server-received reading is ${age}. The stale limit is ${staleAfterSeconds} seconds.`, true);
    setDashboardMode('error', 'Live data · stale');
  } else if (!online || faults.length) {
    setConnectionState('error', faults.length ? 'Device reported a sensor fault' : 'Device is offline', faults.join(', ') || `Last reading received ${age}.`, faults.length ? 'Check device' : 'Offline');
    setConnectionBanner('error', faults.length ? 'Device sensor fault' : 'Device reported offline', faults.join(', ') || 'Check the monitor connection and wait for telemetry.', true);
    setDashboardMode('error', 'Device needs attention');
  } else {
    setConnectionState('connected', 'Connected to backend', `Latest reading received ${age}.`, 'Live');
    setConnectionBanner('', '', '', false);
    setDashboardMode('live', 'Live API · connected');
  }
  document.querySelector('#refresh-button').setAttribute('aria-label', liveSession ? 'Refresh live device readings' : 'Refresh sample readings');
  updateLiveDashboardStatus();
}

function renderLiveReadings() {
  const loading = isInitialLiveLoading();
  const reading = liveLatest?.reading;
  const receivedAt = liveLatest?.received_at || reading?.received_at;
  const receivedText = receivedAt ? `Server received ${formatElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(receivedAt)) / 1000)))}` : 'No reading received';
  const metrics = [
    { id: 'temperature', field: 'temperature_c', unit: '°C', digits: 1, scale: 50, card: '.temperature-card', scene: '.scene-temperature', label: 'temperature' },
    { id: 'humidity', field: 'humidity_pct', unit: '%', digits: 1, scale: 100, card: '.humidity-card', scene: '.scene-humidity', label: 'humidity' },
    { id: 'light', field: 'light_lux', unit: 'lux', digits: 0, scale: 1000, card: '.light-card', scene: null, label: 'room light' },
  ];
  for (const metric of metrics) {
    const raw = reading?.[metric.field];
    const value = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const text = value === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: metric.digits }).format(value);
    const card = document.querySelector(metric.card);
    document.querySelector(`#${metric.id === 'temperature' ? 'temp' : metric.id}-value`).textContent = text;
    const state = card.querySelector('.reading-state');
    state.textContent = value === null ? loading ? 'Loading' : 'Unavailable' : 'Measured';
    state.className = `reading-state ${value === null ? loading ? 'empty' : 'warning' : 'neutral'}`;
    card.querySelector('.reading-foot').textContent = value === null ? loading ? 'Fetching from backend' : 'Not in latest reading' : receivedText;
    const progress = value === null ? 0 : Math.max(0, Math.min(1, value / metric.scale));
    document.querySelector(`#${metric.id}-gauge`).style.strokeDashoffset = String(226 * (1 - progress));
    card.querySelector('.mini-range i').style.width = `${progress * 100}%`;
    card.setAttribute('aria-label', value === null
      ? loading ? `Loading the latest ${metric.label} reading` : `View ${metric.label} details; no value in the latest device reading`
      : `View ${metric.label} details; ${text} ${metric.unit}; received ${formatDateTime(receivedAt)}`);
    if (metric.scene) {
      const marker = document.querySelector(metric.scene);
      marker.querySelector('.hotspot-value').textContent = value === null ? '—' : `${text}${metric.unit === '°C' ? '°' : metric.unit}`;
      marker.setAttribute('aria-label', value === null
        ? `Open ${metric.label} details; no reading available`
        : `Open ${metric.label} details, ${text} ${metric.unit}`);
    }
  }

  const faults = liveFaults();
  const device = liveLatest?.device;
  const hasReading = Boolean(reading);
  const deviceValue = document.querySelector('#device-value');
  if (loading) {
    document.querySelector('#device-state').textContent = 'Loading';
    document.querySelector('#device-state').className = 'reading-state empty';
  }
  document.querySelector('.device-card .reading-foot').textContent = !hasReading
    ? loading ? 'Loading device status…' : 'No reading received from backend'
    : faults.length ? faults.join(', ') : device?.firmware_version ? `Firmware ${device.firmware_version}` : 'Live device status';
  deviceValue.textContent = loading ? 'Loading' : hasReading ? (faults.length ? 'Check monitor' : liveLatest?.device?.network_status === 'online' ? 'Connected' : 'Offline') : liveError ? 'Unavailable' : 'Waiting';
  document.querySelector('.device-card').setAttribute('aria-label', hasReading
    ? `View device health; ${device?.network_status || 'status unknown'}`
    : loading ? 'Loading device health' : 'View device health; no reading received');
  document.querySelector('#toggle-lamp').hidden = true;
  document.querySelector('#demo-controls').hidden = true;
  document.querySelector('#demo-hint')?.setAttribute('hidden', '');
}

function updateLiveEnvironmentAlert() {
  const event = liveEvents.find((item) => item.kind === 'environment' && !item.resolved_at);
  const alert = document.querySelector('#environment-alert');
  alert.hidden = !event;
  if (event) {
    document.querySelector('#environment-alert-copy').textContent = `${event.summary}. Review the event details; this threshold is configured by the backend.`;
    document.querySelector('#review-environment-ranges').textContent = 'View event history';
  } else {
    document.querySelector('#review-environment-ranges').textContent = 'Review sample ranges';
  }
}

function renderLiveEvents() {
  const list = document.querySelector('#history-list');
  const icons = {
    cry: ['cry-event-icon', '<svg viewBox="0 0 24 24"><path d="M12 3.5S5.5 11 5.5 15.2a6.5 6.5 0 0 0 13 0C18.5 11 12 3.5 12 3.5Z"/></svg>'],
    environment: ['light-event-icon', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>'],
    device_fault: ['stale-event-icon', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/></svg>'],
  };
  const rows = liveEvents.map((event) => {
    const kind = event.kind === 'cry' ? 'cry' : event.kind === 'environment' ? 'room' : 'device';
    const [iconClass, iconMarkup] = icons[event.kind] || icons.device_fault;
    const acknowledged = Boolean(event.acknowledged_at);
    const resolved = Boolean(event.resolved_at);
    const item = document.createElement('li');
    item.dataset.kind = kind;
    item.dataset.eventId = event.event_id;
    if (!acknowledged && !resolved) item.dataset.pendingReview = 'true';
    const icon = document.createElement('span');
    icon.className = `event-icon ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconMarkup;
    const copy = document.createElement('span');
    copy.className = 'event-copy';
    const title = document.createElement('strong');
    title.textContent = event.summary || 'Monitor event';
    const state = document.createElement('span');
    state.className = `event-review-state${acknowledged || resolved ? ' reviewed' : ''}`;
    state.textContent = resolved ? 'Resolved' : acknowledged ? 'Reviewed' : 'Needs review';
    const detail = document.createElement('small');
    const when = event.captured_at || event.created_at;
    detail.textContent = `${event.kind.replaceAll('_', ' ')} · ${formatDateTime(when)}`;
    copy.append(title, state, detail);
    const time = document.createElement('time');
    time.dateTime = when || '';
    time.textContent = when && Number.isFinite(Date.parse(when)) ? formatTime(new Date(when)) : '—';
    item.append(icon, copy, time);
    if (!acknowledged && !resolved) {
      const review = document.createElement('button');
      review.className = 'event-review-button';
      review.type = 'button';
      review.dataset.eventReviewId = event.event_id;
      review.textContent = 'Review';
      review.setAttribute('aria-label', `Acknowledge event: ${event.summary || 'monitor event'}`);
      item.append(review);
    }
    return item;
  });
  list.replaceChildren(...rows);
  const recentEmpty = document.querySelector('#recent-empty');
  recentEmpty.hidden = liveEvents.length > 0 && !isInitialLiveLoading();
  recentEmpty.textContent = isInitialLiveLoading()
    ? 'Loading recent events…' : 'No monitor events have been received for this device yet.';
  document.querySelector('#history-count').textContent = String(liveEvents.length);
  document.querySelector('.history-date span:first-child').textContent = 'Recent events';
  document.querySelector('#history-subtitle').textContent = `Events reported by ${liveConfig?.deviceId || 'the connected device'}.`;
  document.querySelector('#history-footnote').textContent = `Live events from ${liveConfig?.deviceId || 'the connected device'}.`;
  renderRecentActivity();
  filterHistory();
  updateLiveEnvironmentAlert();
}

class ApiResponseError extends Error {
  constructor(status) {
    super(`Backend request failed with status ${status}`);
    this.status = status;
  }
}

function friendlyApiError(error) {
  if (error instanceof ApiResponseError) {
    if (error.status === 401) return 'The app token was rejected. Check MONITOR_APP_TOKEN and reconnect.';
    if (error.status === 403) return 'This app token cannot access the requested device or action.';
    if (error.status === 404) return 'The backend endpoint or event was not found. Check the API version and device ID.';
    if (error.status === 422) return 'The backend rejected the device ID or request parameters.';
    if (error.status >= 500) return 'The backend reported a service error. Check its logs and try again.';
    return `The backend rejected the request (HTTP ${error.status}).`;
  }
  if (error?.name === 'AbortError') return 'The backend did not respond within 8 seconds. Check the service and network, then retry.';
  if (error instanceof TypeError) return 'The browser could not reach the backend. Check its URL, CORS allowed origin, and network connection.';
  return error?.message || 'The dashboard could not load data. Check the backend and retry.';
}

function validateApiConfig(baseUrlValue, deviceIdValue) {
  let url;
  try {
    url = new URL(baseUrlValue.trim());
  } catch {
    throw new Error('Enter a valid backend URL, such as http://127.0.0.1:8000.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a plain HTTP or HTTPS backend URL without credentials, query parameters, or a fragment.');
  }
  const loopback = ['localhost', '[::1]'].includes(url.hostname)
    || url.hostname.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('Use HTTPS for a backend on another computer. HTTP is allowed only for localhost development.');
  }
  if (url.pathname && url.pathname !== '/') {
    throw new Error('Enter the backend root URL; API paths are added automatically.');
  }
  const deviceId = deviceIdValue.trim();
  if (!deviceId || deviceId.length > 80) throw new Error('Enter a device ID between 1 and 80 characters.');
  url.pathname = '';
  return { baseUrl: url.href.replace(/\/$/, ''), deviceId };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiResponseError(response.status);
    if (!payload || typeof payload !== 'object') throw new Error('The backend returned an invalid response.');
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadConnectionConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(apiConfigStorageKey) || 'null');
    if (typeof saved?.baseUrl === 'string') document.querySelector('#api-base-url').value = saved.baseUrl;
    if (typeof saved?.deviceId === 'string') document.querySelector('#api-device-id').value = saved.deviceId;
  } catch {
    localStorage.removeItem(apiConfigStorageKey);
  }
}
loadConnectionConfig();

function setApiBusy(isBusy) {
  document.querySelector('#connect-api').disabled = isBusy;
  document.querySelector('#retry-connection').disabled = isBusy;
  document.querySelector('#refresh-button').disabled = isBusy;
  document.querySelector('#connect-api').setAttribute('aria-busy', String(isBusy));
  document.querySelector('#refresh-button').setAttribute('aria-busy', String(isBusy));
  document.querySelector('#refresh-button').classList.toggle('is-refreshing', isBusy && liveSession);
  document.querySelector('.readings-grid').setAttribute('aria-busy', String(isBusy && !liveLatest));
  document.querySelectorAll('#history-list [data-event-review-id], #acknowledge-alert').forEach((button) => {
    button.disabled = isBusy;
  });
}

async function connectDashboard() {
  if (liveRequestInFlight) return;
  const tokenField = document.querySelector('#api-app-token');
  const token = tokenField.value.trim() || (liveSession ? liveToken : '');
  if (!token) {
    setConnectionFeedback('Enter the app bearer token from MONITOR_APP_TOKEN. It is never saved in browser storage.', 'error');
    tokenField.focus();
    return;
  }
  let config;
  try {
    config = validateApiConfig(document.querySelector('#api-base-url').value, document.querySelector('#api-device-id').value);
  } catch (error) {
    setConnectionFeedback(error.message, 'error');
    return;
  }

  liveSession = true;
  liveStale = false;
  liveConfig = config;
  liveToken = token;
  liveLatest = null;
  liveReadings = [];
  liveEvents = [];
  liveReceivedAt = null;
  liveError = null;
  activeLiveEvent = null;
  alertOpen = false;
  try {
    localStorage.setItem(apiConfigStorageKey, JSON.stringify(config));
  } catch {
    // The connection still works if the browser blocks non-secret settings storage.
  }
  setConnectionFeedback('Connecting to the backend…');
  document.querySelector('#hero-status').innerHTML = '<i class="live-indicator"></i><span>CONNECTING TO BACKEND</span>';
  document.querySelector('#hero-title').textContent = 'Connecting to the monitor';
  document.querySelector('#hero-message').textContent = 'Checking the API and loading device readings and event history.';
  document.querySelector('#connection-state').className = 'connection-state loading';
  setConnectionState('loading', 'Connecting to backend', 'Checking service health and loading device readings.', 'Connecting');
  setConnectionBanner('loading', 'Connecting to backend', 'Checking service health and loading the latest readings and events.', false);
  setDashboardMode('loading', 'Connecting…');
  const connected = await pollLiveData({ manual: true, initial: true });
  if (connected) {
    tokenField.value = '';
    setConnectionFeedback('Connected. The app token is held in page memory only and will clear when this page reloads.', 'success');
    navigate('home');
  } else {
    setConnectionFeedback(friendlyApiError(liveError), 'error');
  }
  if (livePollTimer) window.clearInterval(livePollTimer);
  livePollTimer = window.setInterval(() => {
    if (liveSession) pollLiveData();
  }, 15000);
}

async function pollLiveData({ manual = false, initial = false } = {}) {
  if (!liveSession || !liveConfig || !liveToken || liveRequestInFlight) return false;
  liveRequestInFlight = true;
  setApiBusy(true);
  const retry = document.querySelector('#retry-connection');
  if (!liveLatest && !liveError) {
    renderLiveReadings();
    renderTrend();
    renderLiveEvents();
    updateLiveFreshness();
  }
  if (manual && !initial && liveLatest) {
    setConnectionState('loading', 'Refreshing live data', 'Requesting the latest backend readings and events.', 'Updating');
    setConnectionBanner('loading', 'Refreshing live data', 'Requesting the latest readings and event history.', false);
  }
  try {
    const health = await requestJson(`${liveConfig.baseUrl}/health`);
    if (health.status !== 'ok') throw new Error('The backend health check did not report ready.');
    const headers = { Authorization: `Bearer ${liveToken}` };
    const readingUrl = new URL('/api/v1/readings', liveConfig.baseUrl);
    readingUrl.search = new URLSearchParams({ device_id: liveConfig.deviceId, limit: '200' }).toString();
    const eventsUrl = new URL('/api/v1/events', liveConfig.baseUrl);
    eventsUrl.search = new URLSearchParams({ device_id: liveConfig.deviceId, limit: '100' }).toString();
    const [latest, readings, events] = await Promise.all([
      requestJson(`${liveConfig.baseUrl}/api/v1/devices/${encodeURIComponent(liveConfig.deviceId)}/latest`, { headers }),
      requestJson(readingUrl, { headers }),
      requestJson(eventsUrl, { headers }),
    ]);
    if (!Array.isArray(readings.items) || !Array.isArray(events.items) || !('reading' in latest)) {
      throw new Error('The backend returned data in an unexpected format.');
    }
    if (!liveSession) return false;
    liveLatest = latest;
    liveReadings = readings.items;
    liveEvents = events.items;
    liveError = null;
    liveRequestInFlight = false;
    renderLiveReadings();
    renderTrend();
    renderLiveEvents();
    updateLiveFreshness();
    if (manual) showToast(liveLatest.reading ? 'Live readings updated from the backend.' : 'Backend is connected and waiting for the first reading.');
    return true;
  } catch (error) {
    if (!liveSession) return false;
    liveError = error;
    liveRequestInFlight = false;
    updateLiveFreshness();
    if (manual) showToast('Could not refresh backend data. Check the connection message and retry.');
    return false;
  } finally {
    liveRequestInFlight = false;
    setApiBusy(false);
    retry.disabled = false;
  }
}

async function acknowledgeLiveEvent(eventId) {
  if (!liveSession || !liveConfig || !liveToken || liveRequestInFlight) return;
  liveRequestInFlight = true;
  setApiBusy(true);
  setConnectionFeedback('Saving event acknowledgement…');
  try {
    const result = await requestJson(`${liveConfig.baseUrl}/api/v1/events/${encodeURIComponent(eventId)}/acknowledgement`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${liveToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const index = liveEvents.findIndex((event) => event.event_id === eventId);
    if (index !== -1 && result.event) liveEvents[index] = result.event;
    liveRequestInFlight = false;
    renderLiveEvents();
    updateLiveFreshness();
    setConnectionFeedback('Event acknowledgement saved to the backend.', 'success');
    showToast('Event acknowledgement saved.');
  } catch (error) {
    liveRequestInFlight = false;
    const message = friendlyApiError(error);
    setConnectionFeedback(`Could not acknowledge the event. ${message}`, 'error');
    setConnectionBanner('error', 'Event acknowledgement was not saved', `${message} The event is still awaiting review.`, true);
    showToast('Event acknowledgement was not saved. Retry when the backend is available.');
  } finally {
    liveRequestInFlight = false;
    setApiBusy(false);
  }
}

document.querySelector('#connect-api').addEventListener('click', connectDashboard);
document.querySelector('#retry-connection').addEventListener('click', () => pollLiveData({ manual: true }));
document.querySelector('#use-preview-mode').addEventListener('click', () => {
  liveSession = false;
  liveToken = '';
  liveConfig = null;
  liveLatest = null;
  liveError = null;
  if (livePollTimer) window.clearInterval(livePollTimer);
  window.location.reload();
});
document.querySelectorAll('#api-base-url, #api-device-id, #api-app-token').forEach((field) => field.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') connectDashboard();
}));
document.querySelector('#history-list').addEventListener('click', (event) => {
  const review = event.target.closest('[data-event-review-id]');
  if (review) acknowledgeLiveEvent(review.dataset.eventReviewId);
});

// Keep the VS Code Simple Browser preview in sync with local file edits.
if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  let seenVersion = '';
  window.setInterval(async () => {
    try {
      const response = await fetch('/_live', { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json();
      if (seenVersion && version !== seenVersion) window.location.reload();
      seenVersion = version;
    } catch {
      // The preview server may be restarting while files are being edited.
    }
  }, 1200);
}

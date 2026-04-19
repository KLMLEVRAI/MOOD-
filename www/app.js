/**
 * MOOD — Main Application Logic
 * Navigation, sliders, Groq AI integration, history, insights, settings.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './particles.js';

/* ════════════════════════════════════════════════════════════
   STATE
   ════════════════════════════════════════════════════════════ */
const state = {
  energy:    0.5,
  valence:   0.5,
  intensity: 0.3,
  note:      '',
  groqKey:   '',
  history:   [],   // [{ ts, energy, valence, intensity, emotion, note, insight, snapshot }]
};

/* ════════════════════════════════════════════════════════════
   EMOTION DICTIONARY
   Maps (energy × valence × intensity) → named emotion + descriptor
   ════════════════════════════════════════════════════════════ */
function classifyEmotion(e, v, i) {
  // e=energy 0-1, v=valence 0-1, i=intensity 0-1
  if (e > 0.75 && v > 0.65) {
    if (i > 0.6)  return { name: 'Euphorie',     desc: 'Énergie · Joie intense' };
    return              { name: 'Enthousiasme',   desc: 'Vivant · Positif' };
  }
  if (e > 0.75 && v < 0.35) {
    if (i > 0.6)  return { name: 'Colère',        desc: 'Tension · Agitation' };
    return              { name: 'Frustration',     desc: 'Bloqué · Irritable' };
  }
  if (e < 0.3 && v > 0.65) {
    return              { name: 'Sérénité',        desc: 'Calme · Doux' };
  }
  if (e < 0.3 && v < 0.35) {
    if (i > 0.55) return { name: 'Tristesse',     desc: 'Lourd · Mélancolie' };
    return              { name: 'Épuisement',      desc: 'Vide · Fatigue' };
  }
  if (e < 0.3 && v >= 0.35 && v <= 0.65) {
    return              { name: 'Introspection',   desc: 'Intérieur · Silence' };
  }
  if (e >= 0.3 && e <= 0.65 && v >= 0.4 && v <= 0.6) {
    return              { name: 'Équilibre',       desc: 'Calme · Stable' };
  }
  if (v > 0.65 && e >= 0.35 && e <= 0.75) {
    return              { name: 'Bien-être',       desc: 'Harmonieux · Ouvert' };
  }
  if (v < 0.35 && i > 0.5) {
    return              { name: 'Stress',          desc: 'Sous pression · Tendu' };
  }
  if (v < 0.35 && i <= 0.5) {
    return              { name: 'Inquiétude',      desc: 'Incertain · Flou' };
  }
  if (e > 0.5 && i > 0.6) {
    return              { name: 'Intensité',       desc: 'Fort · Concentré' };
  }
  return                { name: 'En mouvement',    desc: 'Transition · Flux' };
}

/* ════════════════════════════════════════════════════════════
   DOM REFS
   ════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const els = {
  splash:        $('splash'),
  app:           $('app'),
  ambientBg:     $('ambientBg'),
  greeting:      $('greeting'),
  dateLabel:     $('dateLabel'),
  emotionName:   $('emotionName'),
  emotionDesc:   $('emotionDesc'),
  aiInsight:     $('aiInsight'),
  aiInsightText: $('aiInsightText'),
  particleCanvas:$('particleCanvas'),
  moodNote:      $('moodNote'),
  analyzeBtn:    $('analyzeBtn'),
  saveMoodBtn:   $('saveMoodBtn'),
  historyGrid:   $('historyGrid'),
  historyEmpty:  $('historyEmpty'),
  historyModal:  $('historyModal'),
  historyCanvas: $('historyCanvas'),
  modalBackdrop: $('modalBackdrop'),
  modalDate:     $('modalDate'),
  modalEmotion:  $('modalEmotion'),
  modalNote:     $('modalNote'),
  modalInsight:  $('modalInsight'),
  modalClose:    $('modalClose'),
  predictionCanvas: $('predictionCanvas'),
  predictionTitle:  $('predictionTitle'),
  predictionText:   $('predictionText'),
  patEnergyPeak: $('patEnergyPeak'),
  patBestDay:    $('patBestDay'),
  patTrend:      $('patTrend'),
  chatMessages:  $('chatMessages'),
  chatInput:     $('chatInput'),
  chatSendBtn:   $('chatSendBtn'),
  groqApiKey:    $('groqApiKey'),
  darkModeCheck: $('darkModeCheck'),
  notifCheck:    $('notifCheck'),
  particleDensity:$('particleDensity'),
  clearHistoryBtn:$('clearHistoryBtn'),
  toast:         $('toast'),
};

/* ════════════════════════════════════════════════════════════
   PARTICLE ENGINE
   ════════════════════════════════════════════════════════════ */
let engine;

function initEngine() {
  engine = new ParticleEngine(els.particleCanvas, { count: 120 });
  engine.setState(state.energy, state.valence, state.intensity);
}

/* ════════════════════════════════════════════════════════════
   SLIDERS
   ════════════════════════════════════════════════════════════ */
const sliders = [
  { track: 'trackEnergy',    fill: 'fillEnergy',    thumb: 'thumbEnergy',    val: 'valEnergy',    key: 'energy' },
  { track: 'trackValence',   fill: 'fillValence',   thumb: 'thumbValence',   val: 'valValence',   key: 'valence' },
  { track: 'trackIntensity', fill: 'fillIntensity', thumb: 'thumbIntensity', val: 'valIntensity', key: 'intensity' },
];

function initSliders() {
  sliders.forEach(s => {
    const track = $(s.track);
    const fill  = $(s.fill);
    const thumb = $(s.thumb);
    const valEl = $(s.val);
    let dragging = false;

    function updatePos(pct) {
      pct = Math.max(0, Math.min(1, pct));
      const intVal = Math.round(pct * 100);
      fill.style.width  = `${pct * 100}%`;
      thumb.style.left  = `${pct * 100}%`;
      thumb.setAttribute('aria-valuenow', intVal);
      valEl.textContent = intVal;
      state[s.key] = pct;

      // Update engine in real time
      engine.setState(state.energy, state.valence, state.intensity);
      updateEmotionLabel();
      scheduleAmbientUpdate();
    }

    // Set initial position
    updatePos(state[s.key]);

    function getPct(clientX) {
      const rect = track.getBoundingClientRect();
      return (clientX - rect.left) / rect.width;
    }

    // Mouse
    thumb.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      thumb.classList.add('dragging');
      const onMove = e2 => {
        if (dragging) { updatePos(getPct(e2.clientX)); vibrate(); }
      };
      const onUp   = () => {
        dragging = false;
        thumb.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    track.addEventListener('click', e => {
      updatePos(getPct(e.clientX));
    });

    // Touch
    thumb.addEventListener('touchstart', e => {
      e.preventDefault();
      dragging = true;
      thumb.classList.add('dragging');
      const onMove = e2 => {
        if (dragging) { updatePos(getPct(e2.touches[0].clientX)); vibrate(); }
      };
      const onEnd  = () => {
        dragging = false;
        thumb.classList.remove('dragging');
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onEnd);
      };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend',  onEnd);
    }, { passive: false });

    // Keyboard
    thumb.addEventListener('keydown', e => {
      const cur = state[s.key];
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { updatePos(cur + 0.02); e.preventDefault(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  { updatePos(cur - 0.02); e.preventDefault(); }
    });
  });
}

/* ════════════════════════════════════════════════════════════
   EMOTION LABEL UPDATE
   ════════════════════════════════════════════════════════════ */
function updateEmotionLabel() {
  const emo = classifyEmotion(state.energy, state.valence, state.intensity);
  els.emotionName.textContent = emo.name;
  els.emotionDesc.textContent = emo.desc;
}

/* ════════════════════════════════════════════════════════════
   AMBIENT BG SCHEDULE (debounced)
   ════════════════════════════════════════════════════════════ */
let _ambientTimer = null;
function scheduleAmbientUpdate() {
  clearTimeout(_ambientTimer);
  _ambientTimer = setTimeout(() => {}, 50);
  // CSS vars are updated by engine._updateCSSVars()
}

/* ════════════════════════════════════════════════════════════
   GREETING + DATE
   ════════════════════════════════════════════════════════════ */
function updateGreeting() {
  const h = new Date().getHours();
  const greetings = ['Bonne nuit', 'Bonne nuit', 'Bonne nuit', 'Bonne nuit', 'Bonne nuit',
    'Bonjour', 'Bonjour', 'Bonjour', 'Bonjour', 'Bonjour', 'Bonjour', 'Bonjour',
    'Bonjour', 'Bon après-midi', 'Bon après-midi', 'Bon après-midi', 'Bon après-midi', 'Bon après-midi',
    'Bonsoir', 'Bonsoir', 'Bonsoir', 'Bonne soirée', 'Bonne soirée', 'Bonne soirée'];
  els.greeting.textContent = greetings[h] || 'Bonjour';

  const now = new Date();
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['Jan','Fév','Mars','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  els.dateLabel.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}

/* ════════════════════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.screen;
      switchScreen(target);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen${capitalize(name)}`).classList.add('active');

  if (name === 'history') renderHistory();
  if (name === 'insights') renderInsights();
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ════════════════════════════════════════════════════════════
   SAVE MOOD
   ════════════════════════════════════════════════════════════ */
function initSave() {
  els.saveMoodBtn.addEventListener('click', saveMood);
}

function saveMood() {
  const emo = classifyEmotion(state.energy, state.valence, state.intensity);

  // Snapshot particle state
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width  = 280;
  snapCanvas.height = 280;
  engine.snapshot(snapCanvas, 280, 280);

  const entry = {
    ts:        Date.now(),
    energy:    state.energy,
    valence:   state.valence,
    intensity: state.intensity,
    emotion:   emo.name,
    desc:      emo.desc,
    note:      els.moodNote.value.trim(),
    insight:   els.aiInsightText.textContent || '',
    snapshot:  snapCanvas.toDataURL('image/png', 0.6),
  };

  state.history.unshift(entry);
  persistHistory();
  showToast(`${emo.name} enregistré ✓`);
  vibrate(50);
}

/* ════════════════════════════════════════════════════════════
   HISTORY RENDER
   ════════════════════════════════════════════════════════════ */
function renderHistory() {
  const grid  = els.historyGrid;
  const empty = els.historyEmpty;
  grid.innerHTML = '';

  if (state.history.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  state.history.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Humeur: ${entry.emotion}`);

    const img = document.createElement('img');
    img.src    = entry.snapshot;
    img.style.cssText = 'width:100%;height:calc(100% - 42px);object-fit:cover;display:block;';
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'history-card-info';
    info.innerHTML = `
      <div class="history-card-date">${formatDate(entry.ts)}</div>
      <div class="history-card-emotion">${entry.emotion}</div>
    `;

    card.append(img, info);
    card.addEventListener('click', () => openHistoryModal(entry));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openHistoryModal(entry); });

    // Staggered entrance
    card.style.opacity   = '0';
    card.style.transform = 'translateY(12px)';
    grid.appendChild(card);
    requestAnimationFrame(() => {
      setTimeout(() => {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1)';
        card.style.opacity    = '1';
        card.style.transform  = 'translateY(0)';
      }, idx * 60);
    });
  });
}

function openHistoryModal(entry) {
  els.modalDate.textContent    = formatDate(entry.ts, true);
  els.modalEmotion.textContent = `${entry.emotion} — ${entry.desc}`;
  els.modalNote.textContent    = entry.note || 'Aucune note';
  els.modalInsight.textContent = entry.insight || '';

  // Draw snapshot
  const ctx = els.historyCanvas.getContext('2d');
  const img = new Image();
  img.src = entry.snapshot;
  img.onload = () => { ctx.drawImage(img, 0, 0, 280, 280); };

  els.historyModal.style.display = 'flex';
  document.body.style.overflow   = 'hidden';
}

function closeHistoryModal() {
  els.historyModal.style.display = 'none';
  document.body.style.overflow   = '';
}

function formatDate(ts, long = false) {
  const d = new Date(ts);
  const days   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const time   = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (long) return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${time}`;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

/* ════════════════════════════════════════════════════════════
   INSIGHTS RENDER
   ════════════════════════════════════════════════════════════ */
function renderInsights() {
  if (state.history.length === 0) {
    els.predictionTitle.textContent = 'Pas assez de données';
    els.predictionText.textContent  = 'Enregistre quelques humeurs pour obtenir des prédictions.';
    // Draw placeholder in prediction canvas
    drawPlaceholderPrediction();
    els.patEnergyPeak.textContent = '—';
    els.patBestDay.textContent    = '—';
    els.patTrend.textContent      = '—';
    return;
  }

  // Compute patterns
  computePatterns();

  // Prediction (based on recent trend)
  computePrediction();
}

function computePatterns() {
  const h = state.history;

  // Average energy
  const avgE = h.reduce((a, b) => a + b.energy, 0) / h.length;
  els.patEnergyPeak.textContent = avgE > 0.6 ? 'Matin & après-midi' : avgE > 0.4 ? 'Variable' : 'Soirée calme';

  // Most common emotion day
  const dayCount = {};
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  h.forEach(e => {
    const day = days[new Date(e.ts).getDay()];
    dayCount[day] = (dayCount[day] || 0) + (e.valence);
  });
  const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
  els.patBestDay.textContent = bestDay ? `${bestDay[0]} (valence élevée)` : '—';

  // Trend (last 3 vs first 3)
  if (h.length >= 6) {
    const recent = h.slice(0, 3).reduce((a, b) => a + b.valence, 0) / 3;
    const older  = h.slice(-3).reduce((a, b) => a + b.valence, 0) / 3;
    const diff   = recent - older;
    els.patTrend.textContent = diff > 0.05 ? '↑ En amélioration' : diff < -0.05 ? '↓ En baisse' : '→ Stable';
  } else {
    els.patTrend.textContent = 'Plus de données nécessaires';
  }
}

function computePrediction() {
  const h  = state.history.slice(0, 5);
  const avgE = h.reduce((a, b) => a + b.energy, 0)    / h.length;
  const avgV = h.reduce((a, b) => a + b.valence, 0)   / h.length;
  const avgI = h.reduce((a, b) => a + b.intensity, 0) / h.length;

  const emo = classifyEmotion(avgE, avgV, avgI);
  els.predictionTitle.textContent = `Demain : ${emo.name}`;
  els.predictionText.textContent  = `Basé sur tes ${h.length} dernières humeurs, une tendance vers « ${emo.desc} » est probable.`;

  // Draw mini prediction particle cloud
  const miniEngine = new ParticleEngine(els.predictionCanvas, { count: 50, maxRadius: 2.5 });
  miniEngine.setState(avgE, avgV, avgI);
  // Let it animate briefly then stop
  setTimeout(() => {
    miniEngine.snapshot(els.predictionCanvas, 120, 120);
    miniEngine.destroy();
  }, 1200);
}

function drawPlaceholderPrediction() {
  const ctx = els.predictionCanvas.getContext('2d');
  ctx.clearRect(0, 0, 120, 120);
  const g = ctx.createRadialGradient(60, 60, 0, 60, 60, 50);
  g.addColorStop(0, 'rgba(129,140,248,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 120, 120);
}

/* ════════════════════════════════════════════════════════════
   GROQ AI INTEGRATION
   ════════════════════════════════════════════════════════════ */
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL    = 'llama-3.3-70b-versatile';

async function callGroq(messages, maxTokens = 200) {
  const key = state.groqKey || localStorage.getItem('moodGroqKey') || '';
  if (!key) {
    return "Active l'IA en ajoutant ta clé Groq dans les réglages.";
  }

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        max_tokens:  maxTokens,
        temperature: 0.7,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '—';
  } catch (e) {
    console.error('Groq error:', e);
    return `Erreur IA : ${e.message}`;
  }
}

/* ── Analyze note ── */
async function analyzeNote() {
  const note  = els.moodNote.value.trim();
  const emo   = classifyEmotion(state.energy, state.valence, state.intensity);

  if (!note && state.history.length === 0) {
    showToast('Écris une note ou enregistre quelques humeurs !');
    return;
  }

  els.analyzeBtn.disabled = true;
  els.analyzeBtn.innerHTML = '<span class="ai-spark">✦</span> Analyse…';

  const historyContext = state.history.slice(0, 5).map(h =>
    `${formatDate(h.ts)} : ${h.emotion} (énergie ${Math.round(h.energy * 100)}, valence ${Math.round(h.valence * 100)})`
  ).join('\n');

  const sysPrompt = `Tu es MOOD, une IA bienveillante spécialisée dans l'intelligence émotionnelle.
Réponds en français. Sois très court (1-2 phrases max), chaleureux, humain, jamais intrusif.
Ne répète pas l'état de l'utilisateur — apporte un éclairage doux et subtil.`;

  const userMsg = `État actuel : ${emo.name} (énergie ${Math.round(state.energy * 100)}, valence ${Math.round(state.valence * 100)}, intensité ${Math.round(state.intensity * 100)}).
Note : "${note || '(aucune note)'}".
Historique récent :
${historyContext || '(aucun historique)'}
Donne un court insight ou conseil doux.`;

  const reply = await callGroq([
    { role: 'system',  content: sysPrompt },
    { role: 'user',    content: userMsg },
  ], 120);

  // Show insight bubble on canvas
  els.aiInsightText.textContent = reply;
  els.aiInsight.style.display   = 'flex';
  setTimeout(() => { els.aiInsight.style.display = 'none'; }, 12000);

  els.analyzeBtn.disabled = false;
  els.analyzeBtn.innerHTML = '<span class="ai-spark">✦</span> Analyser';
}

/* ── Chat ── */
function initChat() {
  els.chatSendBtn.addEventListener('click', sendChatMessage);
  els.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
}

async function sendChatMessage() {
  const text = els.chatInput.value.trim();
  if (!text) return;

  els.chatInput.value = '';
  appendChatMsg(text, 'user');
  vibrate(30);

  // Thinking indicator
  const thinking = appendThinking();

  const sysPrompt = `Tu es MOOD, une IA d'intelligence émotionnelle.
Réponds UNIQUEMENT en français. Sois très court (2-3 phrases max), chaleureux, humain, concret.
L'utilisateur partage ses humeurs. Aide-le à comprendre ses émotions.`;

  const emoContext = `Humeur actuelle : ${classifyEmotion(state.energy, state.valence, state.intensity).name}
Historique récent : ${state.history.slice(0,3).map(h => h.emotion).join(', ') || 'aucun'}`;

  const reply = await callGroq([
    { role: 'system',  content: sysPrompt },
    { role: 'user',    content: `${emoContext}\n\nMa question : ${text}` },
  ], 160);

  thinking.remove();
  appendChatMsg(reply, 'ai');
}

function appendChatMsg(text, who) {
  const div = document.createElement('div');
  div.className = `msg ${who}-msg`;
  div.textContent = text;
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}

function appendThinking() {
  const div = document.createElement('div');
  div.className = 'thinking-msg';
  div.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>';
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}

/* ════════════════════════════════════════════════════════════
   SETTINGS
   ════════════════════════════════════════════════════════════ */
function initSettings() {
  // Load saved key
  const savedKey = localStorage.getItem('moodGroqKey') || '';
  els.groqApiKey.value = savedKey;
  state.groqKey = savedKey;

  els.groqApiKey.addEventListener('change', () => {
    state.groqKey = els.groqApiKey.value.trim();
    localStorage.setItem('moodGroqKey', state.groqKey);
    showToast('Clé API enregistrée ✓');
  });

  // Density
  const savedDensity = localStorage.getItem('moodDensity') || 'medium';
  els.particleDensity.value = savedDensity;
  window.__moodDensity = savedDensity;

  els.particleDensity.addEventListener('change', () => {
    window.__moodDensity = els.particleDensity.value;
    localStorage.setItem('moodDensity', window.__moodDensity);
    engine.setState(state.energy, state.valence, state.intensity);
    showToast('Densité mise à jour');
  });

  // Clear history
  els.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Effacer tout l\'historique ? Cette action est irréversible.')) {
      state.history = [];
      persistHistory();
      showToast('Historique effacé');
    }
  });

  // Notifications
  els.notifCheck.addEventListener('change', () => {
    if (els.notifCheck.checked) requestNotifPermission();
  });
}

async function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications non supportées');
    els.notifCheck.checked = false;
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    showToast('Permission refusée');
    els.notifCheck.checked = false;
  } else {
    showToast('Notifications activées ✓');
    scheduleNotification();
  }
}

function scheduleNotification() {
  // Schedule a gentle reminder in 3 hours
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification('MOOD', {
        body: 'Comment te sens-tu en ce moment ? 🌙',
        silent: true,
      });
    }
  }, 3 * 60 * 60 * 1000);
}

/* ════════════════════════════════════════════════════════════
   PERSISTENCE
   ════════════════════════════════════════════════════════════ */
function persistHistory() {
  try {
    // Store without snapshots first (too heavy)
    const light = state.history.map(h => ({ ...h }));
    localStorage.setItem('moodHistory', JSON.stringify(light));
  } catch (e) {
    // Storage quota exceeded — trim oldest
    if (state.history.length > 20) {
      state.history = state.history.slice(0, 20);
      persistHistory();
    }
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('moodHistory');
    if (raw) state.history = JSON.parse(raw);
  } catch {
    state.history = [];
  }
}

/* ════════════════════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

/* ════════════════════════════════════════════════════════════
   HAPTIC
   ════════════════════════════════════════════════════════════ */
let _lastVib = 0;
async function vibrate(ms = 10) {
  const now = Date.now();
  if (now - _lastVib < 50) return;  // throttle
  _lastVib = now;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }
}

/* ════════════════════════════════════════════════════════════
   MODAL
   ════════════════════════════════════════════════════════════ */
function initModal() {
  els.modalClose.addEventListener('click', closeHistoryModal);
  els.modalBackdrop.addEventListener('click', closeHistoryModal);
}

/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
function boot() {
  loadHistory();
  updateGreeting();
  initEngine();
  initSliders();
  updateEmotionLabel();
  initNav();
  initSave();
  initChat();
  initSettings();
  initModal();

  // Analyze button
  els.analyzeBtn.addEventListener('click', analyzeNote);

  // Show app after splash
  setTimeout(() => {
    els.app.classList.remove('hidden');
  }, 100);

  // Clock tick for greeting
  setInterval(updateGreeting, 60_000);

  // Demo insight after 4s if no history
  if (state.history.length === 0) {
    setTimeout(() => {
      els.aiInsightText.textContent = 'Bonjour. Déplace les curseurs pour capturer ton humeur du moment.';
      els.aiInsight.style.display   = 'flex';
      setTimeout(() => { els.aiInsight.style.display = 'none'; }, 8000);
    }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', boot);

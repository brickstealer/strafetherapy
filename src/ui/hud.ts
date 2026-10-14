import type { ScoreState, GameSettings, WeaponType } from '../types';
import type { PlayerNetState } from '../net/types';

export interface HudCallbacks {
  onResume: () => void;
  onResetPosition: () => void;
  onSettingsChange: (settings: GameSettings) => void;
  onToggleSound: () => void;
  onNicknameChange?: (name: string) => void;
}

const GORE_LEVEL_LABELS = [
  '0: ВЫКЛ (Без крови)',
  '1: УМЕРЕННО (Капли)',
  '2: СТАНДАРТ (Брызги & Лужи)',
  '3: МЯСО (Органы, кости & расчленение)',
  '4: ЛЮТЫЙ АД (Фонтаны крови & разрыв!)'
];

const BLOOD_DURATION_STEPS = [5, 15, 30, 60, 120, 300, Infinity];
const BLOOD_DURATION_LABELS = ['5 с', '15 с', '30 с', '1 мин', '2 мин', '5 мин', '∞ Бесконечно'];

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class Hud {
  private container: HTMLElement;
  private speedDigitsEl!: HTMLElement;
  private speedBarEl!: HTMLElement;
  private syncPctEl!: HTMLElement;
  private syncFillEl!: HTMLElement;
  private syncStatusEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private peakSpeedEl!: HTMLElement;
  private highScoreEl!: HTMLElement;
  private fragsEl!: HTMLElement;
  private weaponNameEl!: HTMLElement;
  private hitmarkerEl!: HTMLElement;
  private chevronLeftEl!: HTMLElement;
  private chevronRightEl!: HTMLElement;
  private speedVignetteEl!: HTMLElement;
  private pauseModalEl!: HTMLElement;
  private startPromptEl!: HTMLElement;
  private newRecordBannerEl!: HTMLElement;

  // Multiplayer UI Elements
  private killfeedEl!: HTMLElement;
  private scoreboardModalEl!: HTMLElement;
  private scoreboardBodyEl!: HTMLElement;
  private onlineCountEl!: HTMLElement;
  private onlinePingEl!: HTMLElement;
  private statusDotEl!: HTMLElement;
  private nicknameInputEl!: HTMLInputElement;
  public playerNickname = 'Player';

  private currentScore = 0;
  private comboMultiplier = 1.0;
  private peakSpeed = 0;
  private highScore = 0;
  private highPeakSpeed = 0;
  private frags = 0;
  private smoothedSync = 0;
  private groundStayTimer = 0;
  private hitmarkerTimer: number | null = null;

  // Settings
  public settings: GameSettings = {
    mouseSensitivity: 0.0022,
    invertY: false,
    fovBase: 90,
    volume: 0.5,
    autoBhop: true,
    trailDuration: 4,
    speedMultiplier: 1.0,
    botCount: 5,
    goreLevel: 3,
    bloodDuration: Infinity
  };

  private callbacks: HudCallbacks;
  private isPaused = true;
  private newRecordShown = false;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.loadHighScores();
    this.loadSettings();
    this.loadNickname();
    this.buildDom();
    this.attachEventListeners();
  }

  private loadNickname(): void {
    try {
      const saved = localStorage.getItem('strafe_therapy_nickname');
      if (saved && saved.trim()) {
        this.playerNickname = saved.trim().substring(0, 16);
      } else {
        this.playerNickname = `Quaker#${Math.floor(100 + Math.random() * 900)}`;
      }
    } catch {
      this.playerNickname = 'Quaker';
    }
  }

  private getGoreLevelText(level: number): string {
    const idx = Math.max(0, Math.min(4, Math.floor(level)));
    return GORE_LEVEL_LABELS[idx];
  }

  private getBloodDurationStepIndex(duration: number): number {
    if (!Number.isFinite(duration) || duration >= 301) return 6;
    const idx = BLOOD_DURATION_STEPS.findIndex((s) => s >= duration);
    return idx === -1 ? 6 : idx;
  }

  private getBloodDurationText(duration: number): string {
    const idx = this.getBloodDurationStepIndex(duration);
    return BLOOD_DURATION_LABELS[idx];
  }

  private loadHighScores(): void {
    try {
      const savedScore = localStorage.getItem('strafe_therapy_highscore');
      const savedPeak = localStorage.getItem('strafe_therapy_peakspeed');
      if (savedScore) this.highScore = parseFloat(savedScore) || 0;
      if (savedPeak) this.highPeakSpeed = parseFloat(savedPeak) || 0;
    } catch {
      // LocalStorage fallback
    }
  }

  private saveHighScores(): void {
    try {
      localStorage.setItem('strafe_therapy_highscore', Math.floor(this.highScore).toString());
      localStorage.setItem('strafe_therapy_peakspeed', Math.floor(this.highPeakSpeed).toString());
    } catch {
      // Ignore
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('strafe_therapy_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.trailDuration === 'Infinity' || parsed.trailDuration === null || parsed.trailDuration >= 61) {
          parsed.trailDuration = Infinity;
        }
        if (parsed.bloodDuration === 'Infinity' || parsed.bloodDuration === null || parsed.bloodDuration === 'infinity' || parsed.bloodDuration >= 301) {
          parsed.bloodDuration = Infinity;
        } else if (typeof parsed.bloodDuration === 'number' && !isNaN(parsed.bloodDuration)) {
          parsed.bloodDuration = Math.max(0, parsed.bloodDuration);
        } else {
          parsed.bloodDuration = Infinity;
        }
        if (typeof parsed.goreLevel === 'number' && !isNaN(parsed.goreLevel)) {
          parsed.goreLevel = Math.max(0, Math.min(4, Math.floor(parsed.goreLevel)));
        } else {
          parsed.goreLevel = 3;
        }
        if (typeof parsed.speedMultiplier === 'number' && !isNaN(parsed.speedMultiplier)) {
          parsed.speedMultiplier = Math.max(0.1, Math.min(10.0, parsed.speedMultiplier));
        } else {
          parsed.speedMultiplier = 1.0;
        }
        if (typeof parsed.botCount === 'number' && !isNaN(parsed.botCount)) {
          parsed.botCount = Math.max(0, Math.min(25, Math.floor(parsed.botCount)));
        } else {
          parsed.botCount = 5;
        }
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {
      // Ignore
    }
  }

  public saveSettings(): void {
    try {
      const toSave = {
        ...this.settings,
        trailDuration: Number.isFinite(this.settings.trailDuration) ? this.settings.trailDuration : 'Infinity',
        bloodDuration: Number.isFinite(this.settings.bloodDuration) ? this.settings.bloodDuration : 'Infinity'
      };
      localStorage.setItem('strafe_therapy_settings', JSON.stringify(toSave));
    } catch {
      // Ignore
    }
  }

  private buildDom(): void {
    this.container.innerHTML = `
      <div id="hud-overlay" class="hud-overlay">
        <!-- Top Status Bar: Scores & Combos -->
        <div class="hud-top-bar">
          <div class="hud-card score-panel">
            <div class="hud-label">SCORE</div>
            <div id="hud-score" class="hud-value neon-glow">0</div>
          </div>

          <div class="hud-card combo-panel">
            <div class="hud-label">COMBO MULTIPLIER</div>
            <div id="hud-combo" class="hud-value combo-badge">1.0x</div>
          </div>

          <div class="hud-card stats-panel">
            <div class="stat-row">
              <span class="stat-label">HIGH SCORE:</span>
              <span id="hud-highscore" class="stat-val">${Math.floor(this.highScore)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">TOP SPEED:</span>
              <span id="hud-peakspeed" class="stat-val">${Math.floor(this.highPeakSpeed)} u/s</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">FRAGS:</span>
              <span id="hud-frags" class="stat-val neon-frag">0</span>
            </div>
          </div>

          <div class="hud-card weapon-panel">
            <div class="hud-label">WEAPON [1 / 2 / 3]</div>
            <div id="hud-weapon-name" class="hud-value weapon-badge">[1] SHOTGUN</div>
            <div class="ammo-val">∞ AMMO</div>
          </div>

          <div class="hud-card online-panel">
            <div class="hud-label">MULTIPLAYER</div>
            <div class="online-status-row">
              <div id="status-dot" class="status-dot offline"></div>
              <span id="hud-online">OFFLINE</span>
            </div>
            <div id="hud-ping" class="ping-val">-- ms</div>
          </div>
        </div>

        <!-- Center Crosshair & Guidance Chevrons -->
        <div class="crosshair-container">
          <div id="chevron-left" class="guidance-chevron left">&lt;&lt;</div>
          <div class="crosshair-reticle">
            <div class="reticle-dot"></div>
            <div id="hitmarker" class="hitmarker hidden">
              <div class="hit-slash tl"></div>
              <div class="hit-slash tr"></div>
              <div class="hit-slash bl"></div>
              <div class="hit-slash br"></div>
            </div>
          </div>
          <div id="chevron-right" class="guidance-chevron right">&gt;&gt;</div>
        </div>

        <!-- Center Bottom: Digital Speedometer & Sync Gauge -->
        <div class="hud-bottom-panel">
          <!-- Strafe Sync Bar -->
          <div class="sync-container">
            <div class="sync-header">
              <span class="sync-title">STRAFE SYNC</span>
              <span id="sync-status" class="sync-status">ALIGNED</span>
              <span id="sync-pct" class="sync-percent">0%</span>
            </div>
            <div class="sync-track">
              <div id="sync-fill" class="sync-fill"></div>
            </div>
          </div>

          <!-- Large Speedometer -->
          <div class="speedometer-container">
            <div class="speed-number-wrapper">
              <span id="speed-digits" class="speed-digits">000</span>
              <span id="speed-unit" class="speed-unit">u/s</span>
            </div>
            <div class="speed-bracket-bar">
              <div id="speed-bar" class="speed-bar-fill"></div>
            </div>
          </div>
        </div>

        <!-- Speed Vignette & Blur Overlay -->
        <div id="speed-vignette" class="speed-vignette"></div>

        <!-- New Record Notification Banner -->
        <div id="new-record-banner" class="new-record-banner">
          <span class="record-title">★ NEW PERSONAL BEST SPEED! ★</span>
        </div>

        <!-- Start / Pause Menu Modal -->
        <div id="pause-modal" class="pause-modal visible">
          <div class="modal-box">
            <div class="modal-header">
              <h1 class="game-title">STRAFE THERAPY</h1>
              <div class="subtitle">3D CPMA MOVEMENT & SPEED-SCORING SANDBOX</div>
            </div>

            <div class="modal-body">
              <div class="controls-guide">
                <h3>MOVEMENT & COMBAT</h3>
                <div class="guide-grid">
                  <div class="guide-item">
                    <span class="key-badge">SPACE (HOLD)</span>
                    <span class="desc">Auto-Bunnyhop (Zero friction jump on contact)</span>
                  </div>
                  <div class="guide-item">
                    <span class="key-badge">A / D + MOUSE</span>
                    <span class="desc">Air-Strafe & Build Exponential Momentum</span>
                  </div>
                  <div class="guide-item">
                    <span class="key-badge">W (MID-AIR)</span>
                    <span class="desc">CPM Air-Control (Tight 90° & 180° turns)</span>
                  </div>
                  <div class="guide-item">
                    <span class="key-badge">LMB (FIRE)</span>
                    <span class="desc">Shoot Shotgun / Rocket / Railgun (One-Shot!)</span>
                  </div>
                  <div class="guide-item">
                    <span class="key-badge">1 / 2 / 3 / WHEEL / Q</span>
                    <span class="desc">Switch Weapon (Shotgun / Rocket / Railgun)</span>
                  </div>
                  <div class="guide-item">
                    <span class="key-badge">R</span>
                    <span class="desc">Reset Position to Spawn Runway</span>
                  </div>
                </div>
              </div>

              <!-- Settings Controls -->
              <div class="settings-section">
                <h3>PREFERENCES</h3>
                <div class="setting-row">
                  <label for="input-nickname">Никнейм игрока (Nickname)</label>
                  <input id="input-nickname" type="text" maxlength="16" value="${escapeHtml(this.playerNickname)}" placeholder="Player" class="setting-input" />
                </div>

                <div class="setting-row">
                  <label for="slider-sens">Mouse Sensitivity</label>
                  <input id="slider-sens" type="range" min="0.0008" max="0.006" step="0.0002" value="${this.settings.mouseSensitivity}" />
                  <span id="val-sens" class="setting-val">${(this.settings.mouseSensitivity * 1000).toFixed(1)}</span>
                </div>

                <div class="setting-row">
                  <label for="slider-fov">Field of View (FOV)</label>
                  <input id="slider-fov" type="range" min="70" max="150" step="1" value="${this.settings.fovBase}" />
                  <span id="val-fov" class="setting-val">${this.settings.fovBase}°</span>
                </div>

                <div class="setting-row">
                  <label for="slider-vol">Audio Volume</label>
                  <input id="slider-vol" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}" />
                  <span id="val-vol" class="setting-val">${Math.round(this.settings.volume * 100)}%</span>
                </div>

                <div class="setting-row">
                  <label for="slider-trail">Время трейла (Trail Lifetime)</label>
                  <input id="slider-trail" type="range" min="1" max="61" step="1" value="${Number.isFinite(this.settings.trailDuration) ? Math.min(60, this.settings.trailDuration) : 61}" />
                  <span id="val-trail" class="setting-val">${Number.isFinite(this.settings.trailDuration) ? `${this.settings.trailDuration} с` : '∞ Бесконечно'}</span>
                </div>

                <div class="setting-row">
                  <label for="slider-speed">Множитель скорости (Speed Multiplier)</label>
                  <input id="slider-speed" type="range" min="0.2" max="5.0" step="0.1" value="${this.settings.speedMultiplier.toFixed(1)}" />
                  <span id="val-speed" class="setting-val">${this.settings.speedMultiplier.toFixed(1)}x</span>
                </div>

                <div class="setting-row">
                  <label for="slider-bots">Количество ботов (Bots)</label>
                  <input id="slider-bots" type="range" min="0" max="20" step="1" value="${this.settings.botCount}" />
                  <span id="val-bots" class="setting-val">${this.settings.botCount}</span>
                </div>

                <div class="setting-row">
                  <label for="slider-gore">Уровень расчленёнки & кровищи (Gore Level)</label>
                  <input id="slider-gore" type="range" min="0" max="4" step="1" value="${this.settings.goreLevel}" />
                  <span id="val-gore" class="setting-val gore-badge">${this.getGoreLevelText(this.settings.goreLevel)}</span>
                </div>

                <div class="setting-row">
                  <label for="slider-blood">Следы крови на полу и стенах (Blood Decals)</label>
                  <input id="slider-blood" type="range" min="0" max="6" step="1" value="${this.getBloodDurationStepIndex(this.settings.bloodDuration)}" />
                  <span id="val-blood" class="setting-val gore-badge">${this.getBloodDurationText(this.settings.bloodDuration)}</span>
                </div>

                <div class="setting-row checkbox-row">
                  <label>
                    <input id="check-invert" type="checkbox" ${this.settings.invertY ? 'checked' : ''} />
                    Invert Pitch (Y-Axis)
                  </label>
                  <label>
                    <input id="check-bhop" type="checkbox" ${this.settings.autoBhop ? 'checked' : ''} />
                    Auto-Bunnyhop (Space)
                  </label>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button id="btn-play" class="btn-primary">CLICK TO PLAY (LOCK MOUSE)</button>
              <div class="hint-text">Press <span class="key-inline">ESC</span> anytime to open settings</div>
            </div>
          </div>
        </div>

        <!-- Quick Help Prompt when locked -->
        <div id="start-prompt" class="start-prompt hidden">
          <span>Click to resume / Space to Auto-Hop</span>
        </div>

        <!-- Killfeed (Top Right Overlay) -->
        <div id="killfeed" class="killfeed-container"></div>

        <!-- Scoreboard Modal (Tab) -->
        <div id="scoreboard-modal" class="scoreboard-modal hidden">
          <div class="scoreboard-card">
            <div class="scoreboard-header">
              <div>
                <h2 class="scoreboard-title">LEADERBOARD</h2>
                <div class="scoreboard-map">CITADEL DEATHMATCH (125 Hz CPMA)</div>
              </div>
              <div class="scoreboard-map">HOLD [TAB] TO VIEW</div>
            </div>
            <table class="scoreboard-table">
              <thead>
                <tr>
                  <th class="rank-col">#</th>
                  <th>PLAYER</th>
                  <th class="frags-col">FRAGS</th>
                  <th class="deaths-col">DEATHS</th>
                  <th class="ping-col">PING</th>
                </tr>
              </thead>
              <tbody id="scoreboard-body">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Query elements
    this.speedDigitsEl = this.container.querySelector('#speed-digits')!;
    this.speedBarEl = this.container.querySelector('#speed-bar')!;
    this.syncPctEl = this.container.querySelector('#sync-pct')!;
    this.syncFillEl = this.container.querySelector('#sync-fill')!;
    this.syncStatusEl = this.container.querySelector('#sync-status')!;
    this.scoreEl = this.container.querySelector('#hud-score')!;
    this.comboEl = this.container.querySelector('#hud-combo')!;
    this.peakSpeedEl = this.container.querySelector('#hud-peakspeed')!;
    this.highScoreEl = this.container.querySelector('#hud-highscore')!;
    this.chevronLeftEl = this.container.querySelector('#chevron-left')!;
    this.chevronRightEl = this.container.querySelector('#chevron-right')!;
    this.speedVignetteEl = this.container.querySelector('#speed-vignette')!;
    this.pauseModalEl = this.container.querySelector('#pause-modal')!;
    this.startPromptEl = this.container.querySelector('#start-prompt')!;
    this.newRecordBannerEl = this.container.querySelector('#new-record-banner')!;
    this.fragsEl = this.container.querySelector('#hud-frags')!;
    this.weaponNameEl = this.container.querySelector('#hud-weapon-name')!;
    this.hitmarkerEl = this.container.querySelector('#hitmarker')!;

    // Multiplayer elements
    this.killfeedEl = this.container.querySelector('#killfeed')!;
    this.scoreboardModalEl = this.container.querySelector('#scoreboard-modal')!;
    this.scoreboardBodyEl = this.container.querySelector('#scoreboard-body')!;
    this.onlineCountEl = this.container.querySelector('#hud-online')!;
    this.onlinePingEl = this.container.querySelector('#hud-ping')!;
    this.statusDotEl = this.container.querySelector('#status-dot')!;
    this.nicknameInputEl = this.container.querySelector('#input-nickname') as HTMLInputElement;
  }

  private attachEventListeners(): void {
    const btnPlay = this.container.querySelector('#btn-play')!;
    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onResume();
    });

    if (this.nicknameInputEl) {
      this.nicknameInputEl.addEventListener('input', () => {
        const clean = this.nicknameInputEl.value.trim().substring(0, 16) || 'Player';
        this.playerNickname = clean;
        try {
          localStorage.setItem('strafe_therapy_nickname', clean);
        } catch {
          // Ignore
        }
        if (this.callbacks.onNicknameChange) {
          this.callbacks.onNicknameChange(clean);
        }
      });
    }

    const sensSlider = this.container.querySelector('#slider-sens') as HTMLInputElement;
    const sensVal = this.container.querySelector('#val-sens')!;
    sensSlider.addEventListener('input', () => {
      this.settings.mouseSensitivity = parseFloat(sensSlider.value);
      sensVal.textContent = (this.settings.mouseSensitivity * 1000).toFixed(1);
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const fovSlider = this.container.querySelector('#slider-fov') as HTMLInputElement;
    const fovVal = this.container.querySelector('#val-fov')!;
    fovSlider.addEventListener('input', () => {
      this.settings.fovBase = parseInt(fovSlider.value, 10);
      fovVal.textContent = `${this.settings.fovBase}°`;
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const volSlider = this.container.querySelector('#slider-vol') as HTMLInputElement;
    const volVal = this.container.querySelector('#val-vol')!;
    volSlider.addEventListener('input', () => {
      this.settings.volume = parseFloat(volSlider.value);
      volVal.textContent = `${Math.round(this.settings.volume * 100)}%`;
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const trailSlider = this.container.querySelector('#slider-trail') as HTMLInputElement;
    const trailVal = this.container.querySelector('#val-trail')!;
    trailSlider.addEventListener('input', () => {
      const val = parseInt(trailSlider.value, 10);
      if (val >= 61) {
        this.settings.trailDuration = Infinity;
        trailVal.textContent = '∞ Бесконечно';
      } else {
        this.settings.trailDuration = val;
        trailVal.textContent = `${val} с`;
      }
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const speedSlider = this.container.querySelector('#slider-speed') as HTMLInputElement;
    const speedVal = this.container.querySelector('#val-speed')!;
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      this.settings.speedMultiplier = Math.round(val * 10) / 10;
      speedVal.textContent = `${this.settings.speedMultiplier.toFixed(1)}x`;
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const botsSlider = this.container.querySelector('#slider-bots') as HTMLInputElement;
    const botsVal = this.container.querySelector('#val-bots')!;
    botsSlider.addEventListener('input', () => {
      const val = parseInt(botsSlider.value, 10);
      this.settings.botCount = val;
      botsVal.textContent = val.toString();
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const goreSlider = this.container.querySelector('#slider-gore') as HTMLInputElement;
    const goreVal = this.container.querySelector('#val-gore')!;
    goreSlider.addEventListener('input', () => {
      const val = parseInt(goreSlider.value, 10);
      this.settings.goreLevel = val;
      goreVal.textContent = this.getGoreLevelText(val);
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const bloodSlider = this.container.querySelector('#slider-blood') as HTMLInputElement;
    const bloodVal = this.container.querySelector('#val-blood')!;
    bloodSlider.addEventListener('input', () => {
      const stepIdx = parseInt(bloodSlider.value, 10);
      const val = BLOOD_DURATION_STEPS[stepIdx];
      this.settings.bloodDuration = val;
      bloodVal.textContent = BLOOD_DURATION_LABELS[stepIdx];
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const invertCheck = this.container.querySelector('#check-invert') as HTMLInputElement;
    invertCheck.addEventListener('change', () => {
      this.settings.invertY = invertCheck.checked;
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });

    const bhopCheck = this.container.querySelector('#check-bhop') as HTMLInputElement;
    bhopCheck.addEventListener('change', () => {
      this.settings.autoBhop = bhopCheck.checked;
      this.callbacks.onSettingsChange(this.settings);
      this.saveSettings();
    });
  }

  public setWeapon(weapon: WeaponType): void {
    if (this.weaponNameEl) {
      if (weapon === 'shotgun') {
        this.weaponNameEl.textContent = '[1] SHOTGUN';
        this.weaponNameEl.className = 'hud-value weapon-badge shotgun-badge';
      } else if (weapon === 'rocket') {
        this.weaponNameEl.textContent = '[2] ROCKET LAUNCHER';
        this.weaponNameEl.className = 'hud-value weapon-badge rocket-badge';
      } else {
        this.weaponNameEl.textContent = '[3] RAILGUN';
        this.weaponNameEl.className = 'hud-value weapon-badge railgun-badge';
      }
    }
  }

  public triggerHitmarker(): void {
    if (!this.hitmarkerEl) return;
    this.hitmarkerEl.classList.remove('hidden');
    this.hitmarkerEl.classList.remove('hit-active');
    void this.hitmarkerEl.offsetWidth; // Force CSS reflow
    this.hitmarkerEl.classList.add('hit-active');

    if (this.hitmarkerTimer !== null) {
      window.clearTimeout(this.hitmarkerTimer);
    }
    this.hitmarkerTimer = window.setTimeout(() => {
      if (this.hitmarkerEl) {
        this.hitmarkerEl.classList.add('hidden');
        this.hitmarkerEl.classList.remove('hit-active');
      }
      this.hitmarkerTimer = null;
    }, 110);
  }

  public addFrag(): void {
    this.frags++;
    if (this.fragsEl) {
      this.fragsEl.textContent = this.frags.toString();
    }
    this.currentScore += 500;
  }

  public getFrags(): number {
    return this.frags;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      this.pauseModalEl.classList.add('visible');
      this.startPromptEl.classList.add('hidden');
    } else {
      this.pauseModalEl.classList.remove('visible');
      this.startPromptEl.classList.add('hidden');
    }
  }

  public isMenuOpen(): boolean {
    return this.isPaused;
  }

  // Handle wall collision penalty: reset combo multiplier
  public onWallHit(loss: number): void {
    if (loss > 200) {
      this.comboMultiplier = 1.0;
      this.updateComboDisplay();
    }
  }

  // Update HUD every render frame
  public update(
    speed: number,
    dt: number,
    isGrounded: boolean,
    mouseDeltaX: number,
    leftKey: boolean,
    rightKey: boolean
  ): void {
    // 1. Digital Speedometer & Brackets
    const intSpeed = Math.floor(speed);
    this.speedDigitsEl.textContent = intSpeed.toString().padStart(3, '0');

    // Color brackets:
    // < 350: Cyan
    // 350 - 600: Green
    // 600 - 900: Orange / Yellow
    // > 900: Magenta / White neon
    let speedClass = 'speed-low';
    let progressRatio = Math.min(1.0, speed / 1200);

    if (speed < 350) {
      speedClass = 'speed-low';
    } else if (speed < 600) {
      speedClass = 'speed-mid';
    } else if (speed < 900) {
      speedClass = 'speed-high';
    } else {
      speedClass = 'speed-super';
    }

    this.speedDigitsEl.className = `speed-digits ${speedClass}`;
    this.speedBarEl.style.width = `${(progressRatio * 100).toFixed(1)}%`;
    this.speedBarEl.className = `speed-bar-fill ${speedClass}`;

    // 2. Strafe Sync Indicator
    let targetSync = 0;
    const isTurningLeft = mouseDeltaX < -0.3;
    const isTurningRight = mouseDeltaX > 0.3;

    if (leftKey && isTurningLeft) {
      targetSync = 100;
    } else if (rightKey && isTurningRight) {
      targetSync = 100;
    } else if ((leftKey && isTurningRight) || (rightKey && isTurningLeft)) {
      targetSync = 0; // Counter-strafing
    } else if (leftKey || rightKey) {
      targetSync = 45; // Pressing strafe without mouse swing
    } else {
      targetSync = 0;
    }

    // Smooth sync with lerp
    this.smoothedSync += (targetSync - this.smoothedSync) * Math.min(1.0, dt * 15);
    const syncInt = Math.round(this.smoothedSync);
    this.syncPctEl.textContent = `${syncInt}%`;
    this.syncFillEl.style.width = `${syncInt}%`;

    if (syncInt > 80) {
      this.syncStatusEl.textContent = 'PERFECT SYNC';
      this.syncStatusEl.className = 'sync-status sync-perfect';
      this.syncFillEl.className = 'sync-fill fill-perfect';
    } else if (syncInt > 40) {
      this.syncStatusEl.textContent = 'ALIGNED';
      this.syncStatusEl.className = 'sync-status sync-good';
      this.syncFillEl.className = 'sync-fill fill-good';
    } else {
      this.syncStatusEl.textContent = 'OFF-ANGLE';
      this.syncStatusEl.className = 'sync-status sync-poor';
      this.syncFillEl.className = 'sync-fill fill-poor';
    }

    // 3. Guidance Chevrons
    // Cue player to turn mouse in sync with pressed key
    if (leftKey) {
      this.chevronLeftEl.classList.add('active');
      this.chevronRightEl.classList.remove('active');
    } else if (rightKey) {
      this.chevronRightEl.classList.add('active');
      this.chevronLeftEl.classList.remove('active');
    } else {
      this.chevronLeftEl.classList.remove('active');
      this.chevronRightEl.classList.remove('active');
    }

    // 4. Scoring Accumulator & Combo Multiplier
    const baseSpeed = 320;
    if (speed > baseSpeed) {
      const scoreIncrement = Math.pow(speed / 100, 2.2) * this.comboMultiplier * dt;
      this.currentScore += scoreIncrement;
      this.scoreEl.textContent = Math.floor(this.currentScore).toLocaleString();

      if (this.currentScore > this.highScore) {
        this.highScore = this.currentScore;
        this.highScoreEl.textContent = Math.floor(this.highScore).toLocaleString();
        this.saveHighScores();
      }
    }

    // Peak speed tracking
    if (speed > this.peakSpeed) {
      this.peakSpeed = speed;
      this.peakSpeedEl.textContent = `${Math.floor(this.peakSpeed)} u/s`;

      if (this.peakSpeed > this.highPeakSpeed) {
        this.highPeakSpeed = this.peakSpeed;
        this.saveHighScores();

        // Flash record banner once at high speeds
        if (speed > 800 && !this.newRecordShown) {
          this.newRecordShown = true;
          this.newRecordBannerEl.classList.add('show');
          setTimeout(() => {
            this.newRecordBannerEl.classList.remove('show');
          }, 3000);
        }
      }
    }

    // Combo Multiplier Rules:
    // Speed > 500: 1.5x, > 750: 2.0x, > 1000: 3.0x, > 1300: 4.0x
    let targetMultiplier = 1.0;
    if (speed >= 1300) {
      targetMultiplier = 4.0;
    } else if (speed >= 1000) {
      targetMultiplier = 3.0;
    } else if (speed >= 750) {
      targetMultiplier = 2.0;
    } else if (speed >= 500) {
      targetMultiplier = 1.5;
    }

    if (targetMultiplier > this.comboMultiplier) {
      this.comboMultiplier = targetMultiplier;
      this.updateComboDisplay();
    }

    // Reset combo if touching ground without jumping and sliding to a halt
    if (isGrounded) {
      this.groundStayTimer += dt;
      if (this.groundStayTimer > 0.22 && speed < 300) {
        this.comboMultiplier = 1.0;
        this.updateComboDisplay();
      }
    } else {
      this.groundStayTimer = 0;
    }

    // 5. Speed Vignette Intensity
    if (speed > 550) {
      const vignetteIntensity = Math.min(0.85, (speed - 550) / 750);
      this.speedVignetteEl.style.opacity = vignetteIntensity.toFixed(2);
    } else {
      this.speedVignetteEl.style.opacity = '0';
    }
  }

  private updateComboDisplay(): void {
    this.comboEl.textContent = `${this.comboMultiplier.toFixed(1)}x`;
    if (this.comboMultiplier >= 3.0) {
      this.comboEl.className = 'hud-value combo-badge combo-super neon-glow';
    } else if (this.comboMultiplier >= 2.0) {
      this.comboEl.className = 'hud-value combo-badge combo-high';
    } else if (this.comboMultiplier >= 1.5) {
      this.comboEl.className = 'hud-value combo-badge combo-mid';
    } else {
      this.comboEl.className = 'hud-value combo-badge';
    }
  }

  public getScoreState(): ScoreState {
    return {
      currentScore: this.currentScore,
      comboMultiplier: this.comboMultiplier,
      peakSpeed: this.peakSpeed,
      highScore: this.highScore,
      highPeakSpeed: this.highPeakSpeed,
      strafeSyncPct: this.smoothedSync,
      frags: this.frags
    };
  }

  public addKillfeedItem(killer: string, victim: string, weapon: WeaponType): void {
    if (!this.killfeedEl) return;
    const item = document.createElement('div');
    item.className = 'killfeed-item';
    const wpBadge = weapon.toUpperCase();
    item.innerHTML = `
      <span class="killfeed-killer">${escapeHtml(killer)}</span>
      <span class="killfeed-weapon">${wpBadge}</span>
      <span class="killfeed-victim">${escapeHtml(victim)}</span>
    `;
    this.killfeedEl.appendChild(item);

    window.setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(40px)';
      window.setTimeout(() => item.remove(), 400);
    }, 4500);
  }

  public setOnlineStatus(online: boolean, count: number, ping: number): void {
    if (!this.onlineCountEl || !this.statusDotEl || !this.onlinePingEl) return;
    if (online) {
      this.statusDotEl.className = 'status-dot';
      this.onlineCountEl.textContent = count === 1 ? '1 PLAYER' : `${count} PLAYERS`;
      this.onlinePingEl.textContent = `${ping} ms`;
    } else {
      this.statusDotEl.className = 'status-dot offline';
      this.onlineCountEl.textContent = 'OFFLINE';
      this.onlinePingEl.textContent = '-- ms';
    }
  }

  public updateScoreboard(players: PlayerNetState[], myId: string | null): void {
    if (!this.scoreboardBodyEl) return;
    const sorted = [...players].sort((a, b) => b.frags - a.frags);
    let html = '';
    sorted.forEach((p, idx) => {
      const isMe = p.id === myId;
      const rowClass = isMe ? 'scoreboard-row is-me' : 'scoreboard-row';
      html += `
        <tr class="${rowClass}">
          <td class="rank-col">${idx + 1}</td>
          <td>${escapeHtml(p.name)} ${isMe ? '<span style="font-size:0.7rem;opacity:0.8;">(YOU)</span>' : ''}</td>
          <td class="frags-col">${p.frags}</td>
          <td class="deaths-col">${p.deaths}</td>
          <td class="ping-col">${p.ping}ms</td>
        </tr>
      `;
    });
    this.scoreboardBodyEl.innerHTML = html;
  }

  public toggleScoreboard(show: boolean): void {
    if (!this.scoreboardModalEl) return;
    if (show) {
      this.scoreboardModalEl.classList.remove('hidden');
    } else {
      this.scoreboardModalEl.classList.add('hidden');
    }
  }
}

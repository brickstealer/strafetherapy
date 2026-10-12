// Web Audio API procedural sound synthesizer for Strafe Therapy
// Zero external audio assets required; 100% procedural and responsive

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;
  private isInitialized: boolean = false;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init(): void {
    if (this.isInitialized) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.initWindNoise();
      this.isInitialized = true;
    } catch (err) {
      console.warn('Web Audio API not supported or blocked:', err);
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Continuous wind rush scaling dynamically with horizontal velocity
  private initWindNoise(): void {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Pink noise approximation for a fuller, organic rushing air feel
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = noiseBuffer;
    this.windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(120, this.ctx.currentTime);
    this.windFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.windSource.start(0);
  }

  // Update wind volume and filter cutoff every frame based on horizontal speed
  public updateSpeedNoise(speed: number): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return;

    const baseThreshold = 280;
    const maxSpeed = 1400;

    if (speed < baseThreshold) {
      // Below walking speed: silent or very subtle breath
      const gain = Math.max(0, (speed / baseThreshold) * 0.02);
      this.windGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
      this.windFilter.frequency.setTargetAtTime(180, this.ctx.currentTime, 0.05);
      return;
    }

    const t = Math.min(1, (speed - baseThreshold) / (maxSpeed - baseThreshold));
    
    // Gain grows smoothly up to 0.42
    const targetGain = 0.04 + Math.pow(t, 1.4) * 0.38;
    // Filter opens up from 300Hz to 4200Hz
    const targetFreq = 300 + Math.pow(t, 1.5) * 3900;

    this.windGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
    this.windFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.04);
  }

  // Quake style snappy jump pop
  public playJump(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // Filter to give that authentic Quake mechanical pop
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Soft landing thud
  public playLand(impactSpeed: number = 300): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const intensity = Math.min(1, Math.max(0.2, impactSpeed / 600));

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.14);

    gain.gain.setValueAtTime(0.3 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Polyphonic high-tech arpeggio chime when crossing speed milestones (500, 750, 1000, 1250, etc.)
  public playMilestone(stage: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const baseFrequencies = [
      [523.25, 659.25, 783.99],          // C5, E5, G5 (500 u/s)
      [659.25, 783.99, 987.77, 1046.50], // E5, G5, B5, C6 (750 u/s)
      [783.99, 987.77, 1174.66, 1567.98], // G5, B5, D6, G6 (1000 u/s)
      [1046.50, 1318.51, 1567.98, 2093.00] // C6, E6, G6, C7 (1250+ u/s)
    ];

    const freqs = baseFrequencies[Math.min(stage, baseFrequencies.length - 1)];
    const startTime = this.ctx.currentTime;

    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = startTime + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.36);
    });
  }

  // Futuristic launchpad booster pulse
  public playLaunchPad(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.28);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.33);
  }

  // Hazard pit fall & rewind sound
  public playRespawn(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.29);
  }
}

export const soundManager = new SoundManager();

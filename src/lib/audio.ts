/** Original procedural lounge soundtrack, guided by the game-audio skill. */
export type AudioMode = "lady" | "queen" | "gentleman";
export type AudioEffect = "click" | "draw" | "flip" | "shuffle";

type Score = {
  bpm: number;
  chords: number[][];
  bass: number[];
  melody: number[][];
  tone: number;
};

// Extended jazz voicings; each phrase has room to breathe between notes.
const SCORES: Record<AudioMode, Score> = {
  lady: {
    bpm: 78,
    tone: 1900,
    chords: [
      [60, 64, 67, 71, 74],
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64, 67],
      [55, 59, 62, 65, 69],
    ],
    bass: [36, 33, 29, 31],
    melody: [
      [76, 0, 74, 0, 71, 0, 0, 74],
      [72, 0, 0, 71, 0, 67, 0, 0],
      [69, 0, 72, 0, 76, 0, 0, 74],
      [71, 0, 69, 0, 67, 0, 0, 0],
    ],
  },
  queen: {
    bpm: 84,
    tone: 2400,
    chords: [
      [60, 63, 67, 70, 74],
      [56, 60, 63, 67, 70],
      [53, 56, 60, 63, 67],
      [55, 59, 62, 65, 68],
    ],
    bass: [36, 32, 29, 31],
    melody: [
      [75, 0, 74, 0, 70, 0, 0, 67],
      [72, 0, 70, 0, 0, 67, 0, 0],
      [68, 0, 0, 72, 0, 75, 0, 74],
      [71, 0, 68, 0, 67, 0, 0, 0],
    ],
  },
  gentleman: {
    bpm: 72,
    tone: 1500,
    chords: [
      [62, 65, 69, 72, 76],
      [55, 59, 62, 65, 69],
      [60, 64, 67, 71, 74],
      [57, 61, 64, 67, 71],
    ],
    bass: [38, 31, 36, 33],
    melody: [
      [77, 0, 76, 0, 72, 0, 0, 69],
      [71, 0, 0, 69, 0, 67, 0, 0],
      [76, 0, 74, 0, 71, 0, 0, 72],
      [73, 0, 71, 0, 69, 0, 0, 0],
    ],
  },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** No audio context or sound exists until enable() is called by a user gesture. */
export class LoungeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private disposed = false;
  private mode: AudioMode = "lady";
  private volume = 0.5;
  private step = 0;
  private nextTime = 0;
  private lastEffect = 0;

  constructor() {
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibility);
  }

  async enable(): Promise<void> {
    if (this.disposed) throw new Error("音频播放器已关闭");
    if (!this.ctx) this.createGraph();
    this.enabled = true;
    const ctx = this.ctx!;
    try {
      await ctx.resume();
      if (!this.enabled || document.hidden) return;
      this.rampMaster(this.volume * 0.7);
      if (!this.timer) {
        this.nextTime = ctx.currentTime + 0.07;
        this.schedule();
      }
    } catch (error) {
      this.enabled = false;
      throw error;
    }
  }

  disable(): void {
    this.enabled = false;
    this.stopScheduler();
    this.rampMaster(0);
    this.stopVoices();
  }

  setMode(mode: AudioMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    // Finish scheduled tails, then begin the new theme at a phrase boundary.
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.45;
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 0.5;
    if (this.enabled && !document.hidden) this.rampMaster(this.volume * 0.7);
  }

  play(kind: AudioEffect): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== "running" || document.hidden)
      return;
    const now = ctx.currentTime;
    if (now - this.lastEffect < 0.045) return;
    this.lastEffect = now;
    const out = this.effects!;
    if (kind === "click") {
      this.tone(740, now, 0.085, 0.07, out, "sine", 2200);
    } else if (kind === "draw") {
      this.brush(now, 0.14, 0.12, out, 1400, 0.7);
      this.tone(330, now + 0.03, 0.18, 0.035, out, "triangle", 1800);
    } else if (kind === "flip") {
      this.brush(now, 0.09, 0.1, out, 1800, 0.7);
      [0, 7, 12].forEach((note, i) =>
        this.bell(hz(72 + note), now + i * 0.075, 0.5, 0.045, out),
      );
      this.music!.gain.cancelScheduledValues(now);
      this.music!.gain.setValueAtTime(this.music!.gain.value, now);
      this.music!.gain.linearRampToValueAtTime(0.26, now + 0.06);
      this.music!.gain.linearRampToValueAtTime(0.55, now + 0.75);
    } else {
      for (let i = 0; i < 7; i++)
        this.brush(now + i * 0.055, 0.075, 0.065, out, 1300 + i * 140, 0.85);
    }
  }

  dispose(): void {
    this.disable();
    this.disposed = true;
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibility);
    void this.ctx?.close();
    this.ctx = null;
  }

  private createGraph(): void {
    const BrowserAudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!BrowserAudioContext) throw new Error("当前浏览器不支持音频播放");
    const ctx = new BrowserAudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.008;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);
    this.master = master;
    this.music = ctx.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(master);
    this.effects = ctx.createGain();
    this.effects.gain.value = 0.72;
    this.effects.connect(master);

    const impulse = ctx.createBuffer(
      2,
      Math.round(ctx.sampleRate * 1.8),
      ctx.sampleRate,
    );
    let seed = 83;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < data.length; i++)
        data[i] = random() * (1 - i / data.length) ** 3.8;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    this.reverb.connect(wet).connect(this.music);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const noise = this.noise.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = random();
  }

  private rampMaster(value: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(value, now + 0.08);
  }

  private visibility = (): void => {
    if (!this.ctx || !this.enabled) return;
    if (document.hidden) {
      this.stopScheduler();
      this.stopVoices();
      void this.ctx.suspend();
    } else {
      void this.enable().catch(() => {
        this.enabled = false;
      });
    }
  };

  private stopScheduler(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private stopVoices(): void {
    for (const source of this.sources) {
      try {
        source.stop(this.ctx?.currentTime ?? 0);
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private schedule = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || document.hidden) {
      this.timer = null;
      return;
    }
    if (this.nextTime < ctx.currentTime - 0.15)
      this.nextTime = ctx.currentTime + 0.04;
    const score = SCORES[this.mode];
    const eighth = 30 / score.bpm;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime, score, eighth);
      this.nextTime += eighth * (this.step % 2 === 0 ? 1.08 : 0.92);
      this.step++;
    }
    this.timer = setTimeout(this.schedule, 25);
  };

  private scheduleStep(
    step: number,
    time: number,
    score: Score,
    eighth: number,
  ): void {
    const beat = step % 8;
    const bar = Math.floor(step / 8);
    const chordIndex = Math.floor(bar / 2) % score.chords.length;
    const chord = score.chords[chordIndex];
    const out = this.music!;
    if (beat === 0 || (beat === 5 && bar % 2 === 1)) {
      const duration = eighth * (beat === 0 ? 5.7 : 2.7);
      chord.forEach((note, index) =>
        this.bell(hz(note), time + index * 0.018, duration, 0.03, out),
      );
    }
    if (beat === 0 || beat === 4 || (beat === 7 && bar % 2 === 1)) {
      const bassNote =
        score.bass[chordIndex] + (beat === 4 ? 7 : beat === 7 ? 12 : 0);
      this.tone(hz(bassNote), time, eighth * 1.7, 0.12, out, "triangle", 340);
    }
    // Four arrangements over 32 bars: a relaxed melody, a higher answer, then space.
    const phrase = Math.floor(bar / 8) % 4;
    const melody =
      score.melody[chordIndex][(beat + (phrase === 1 ? 2 : 0)) % 8];
    if (melody && phrase !== 2 && (bar % 2 === 1 || beat === 0)) {
      this.bell(
        hz(melody + (phrase === 3 ? -12 : 0)),
        time + 0.015,
        eighth * 2.5,
        0.036,
        out,
      );
    }
    if (beat % 2 === 1) this.brush(time, 0.065, 0.02, out, 6500, 0.5);
    if (beat === 2 || beat === 6) this.brush(time, 0.13, 0.028, out, 1500, 0.7);
    if (beat === 0 || beat === 4) this.kick(time, 0.075);
  }

  private tone(
    freq: number,
    time: number,
    duration: number,
    level: number,
    output: AudioNode,
    type: OscillatorType,
    cutoff: number,
  ): void {
    const ctx = this.ctx!;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, time);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter).connect(envelope).connect(output);
    this.track(oscillator, [filter, envelope]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private bell(
    freq: number,
    time: number,
    duration: number,
    level: number,
    output: AudioNode,
  ): void {
    // A soft electric-piano voice; a faint upper partial supplies the tine attack.
    this.tone(
      freq,
      time,
      duration,
      level,
      output,
      "sine",
      SCORES[this.mode].tone,
    );
    this.tone(
      freq * 2,
      time,
      duration * 0.34,
      level * 0.16,
      output,
      "sine",
      3200,
    );
    if (output === this.music && this.reverb)
      this.tone(freq, time, duration, level * 0.45, this.reverb, "sine", 1400);
  }

  private brush(
    time: number,
    duration: number,
    level: number,
    output: AudioNode,
    frequency: number,
    q: number,
  ): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(envelope).connect(output);
    this.track(source, [filter, envelope]);
    source.start(time, (time * 0.37) % 0.6);
    source.stop(time + duration + 0.02);
  }

  private kick(time: number, level: number): void {
    const ctx = this.ctx!;
    const oscillator = ctx.createOscillator();
    oscillator.frequency.setValueAtTime(110, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    oscillator.connect(envelope).connect(this.music!);
    this.track(oscillator, [envelope]);
    oscillator.start(time);
    oscillator.stop(time + 0.25);
  }
}

export const audio = new LoungeAudio();

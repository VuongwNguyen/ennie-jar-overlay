// Sounds for the big gift effect (bigburst.js), made in the browser with Web Audio, so there are no sound
// files to carry around. Every sound goes through a small hall reverb, and sounds that come from a place on
// screen are panned left or right to match it. In order of the effect: the comet's whistle and crackle as
// the big gift falls; a whoosh as it swerves; a harp run and a soft magic choir that hums under the heart
// while it forms; popping as the gifts hop out of the jar and a swirling wind; glitter as light runs over
// the heart; a little fanfare with the sender's name; heartbeats; a crackling, rising charge; the burst
// (a deep boom, a crash, breaking glass and falling glitter); a held shimmer while the gifts hang in the
// air; a rush as they are pulled back; plinks climbing a scale as they drop into the jar; and a final chord.
// overlay.html?sfx=0.4 sets the volume (0 to 1, 0.7 by default; 0 is silent). The copy shown on the layout
// page (?preview) makes no sound, so it never doubles what Studio plays.
(() => {
  const params = new URLSearchParams(location.search);
  const volume = params.has("preview") ? 0
    : params.has("sfx") ? Math.max(0, Math.min(1, Number(params.get("sfx")) || 0)) : 0.7;
  let ctx = null, dry = null, wet = null, noiseBuffer = null;
  // Sound is put to sleep a few seconds after the last one ends: an open sound card keeps its hall reverb
  // working all the time, even in silence, which costs the streaming machine for nothing.
  const IDLE_MS = 5000;
  let parked = false, idleTimer = 0;
  function rest() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (pad || !ctx || ctx.state !== "running") return rest();
      parked = true;
      ctx.suspend().catch(() => {});
    }, IDLE_MS);
  }

  // Started on first use; a browser that does not allow sound yet stays silent rather than failing.
  function audio() {
    if (volume <= 0) return null;
    if (!ctx) {
      try { ctx = new AudioContext(); } catch { return null; }
      parked = true; // a new one may start suspended; resumed just below
      const master = ctx.createGain();
      master.gain.value = volume;
      // Keeps the loud moments (the boom with many plinks) from clipping.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 10;
      master.connect(limiter).connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // A hall: two seconds of decaying stereo noise as the impulse.
      const length = ctx.sampleRate * 2.2;
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      }
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse;
      dry = ctx.createGain();
      wet = ctx.createGain();
      wet.gain.value = 0.35;
      dry.connect(master);
      wet.connect(reverb).connect(master);
    }
    if (ctx.state === "suspended") {
      // Suspended by the browser (sound not allowed yet), not by us: skip the sound rather than queue
      // up notes that would wait for ever.
      if (!parked) return null;
      parked = false;
      ctx.resume().catch(() => {});
    }
    rest();
    return ctx;
  }

  // Where a sound goes: panned (-1 left, 1 right), straight out and into the hall.
  function out(pan = 0, roomy = 1) {
    const node = ctx.createStereoPanner();
    node.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(dry);
    if (roomy > 0) {
      const send = ctx.createGain();
      send.gain.value = roomy;
      node.connect(send).connect(wet);
    }
    return node;
  }
  // A gain that rises to `peak` in `attack` seconds and dies away over the rest of `length`.
  function envelope(t, length, peak, attack, dest) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, length));
    gain.connect(dest);
    return gain;
  }
  // Filtered noise whose pitch slides from `from` to `to`: wind, whooshes, crashes and rumbles.
  function noise(t, length, { type = "bandpass", from = 400, to = 2000, q = 1, peak = 0.3, attack = 0.05, pan = 0, panTo = null, roomy = 1 } = {}) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    source.loopStart = Math.random();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + length);
    const dest = out(pan, roomy);
    if (panTo !== null) dest.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panTo)), t + length);
    source.connect(filter).connect(envelope(t, length, peak, attack, dest));
    source.start(t, Math.random());
    source.stop(t + length + 0.05);
  }
  // A plain tone, optionally sliding to another pitch.
  function tone(t, freq, length, { type = "sine", peak = 0.2, attack = 0.005, to = 0, pan = 0, roomy = 1, detune = 0 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
    osc.connect(envelope(t, length, peak, attack, out(pan, roomy)));
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  // A bell or harp note: the tone and two quieter overtones, which die away faster.
  function bell(t, freq, length = 1.2, peak = 0.1, pan = 0) {
    tone(t, freq, length, { peak, attack: 0.003, pan });
    tone(t, freq * 2.01, length * 0.6, { peak: peak * 0.35, attack: 0.003, pan });
    tone(t, freq * 3.02, length * 0.35, { peak: peak * 0.15, attack: 0.003, pan });
  }
  // A short click, for crackles and pops.
  function click(t, freq, peak, pan = 0) {
    noise(t, 0.035, { from: freq, to: freq * 0.6, q: 3, peak, attack: 0.001, pan, roomy: 0.4 });
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const note = semis => 523.25 * 2 ** (semis / 12); // from C5
  const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const play = fn => (...args) => { if (audio()) return fn(ctx.currentTime + 0.01, ...args); };

  // Wind that circles round: band-passed noise whose place in the stereo field swings left and right,
  // faster as it goes (spinFrom to spinTo turns a second), its pitch rising from "from" to "to" (Hz).
  function circling(t, length, { from, to, q, peak, spinFrom, spinTo, phase = 0 }) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + length);
    const panner = ctx.createStereoPanner();
    const spin = ctx.createOscillator();
    spin.frequency.setValueAtTime(spinFrom, t);
    spin.frequency.exponentialRampToValueAtTime(spinTo, t + length);
    const width = ctx.createGain();
    // The second wind starts on the other side (phase), so the two chase each other round.
    width.gain.value = phase ? -0.85 : 0.85;
    spin.connect(width).connect(panner.pan);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    const gain = envelope(t, length, peak, length * 0.7, panner);
    panner.connect(dry);
    panner.connect(send).connect(wet);
    source.connect(filter).connect(gain);
    source.start(t, Math.random());
    spin.start(t);
    source.stop(t + length + 0.05);
    spin.stop(t + length + 0.05);
  }
  // A glassy, wobbling ring: a resonant tone whose pitch shivers, like a finger round a wet glass rim.
  function wobble(t, length) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + length);
    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    vib.frequency.setValueAtTime(5, t);
    vib.frequency.linearRampToValueAtTime(11, t + length);
    depth.gain.value = 18;
    vib.connect(depth).connect(osc.frequency);
    osc.connect(envelope(t, length, 0.025, length * 0.6, out(0, 1.4)));
    osc.start(t); vib.start(t);
    osc.stop(t + length + 0.05); vib.stop(t + length + 0.05);
  }
  // A sound that may be asked for many times at once (one per gift): at most one every "gap" ms, the rest
  // are skipped, so two hundred gifts make a lively patter rather than a roar.
  function limited(gap, fn) {
    let last = 0;
    return (...args) => {
      const now = performance.now();
      if (now - last < gap || !audio()) return;
      last = now;
      fn(ctx.currentTime + 0.01, ...args);
    };
  }

  // The magic choir: a soft, slowly swelling chord of detuned voices, held until stop() is called.
  let pad = null;
  function startPad(t) {
    stopPad(t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 1.6);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(2600, t + 6);
    filter.Q.value = 0.7;
    gain.connect(filter).connect(out(0, 1.4));
    // A slow wobble, as voices have.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5;
    depth.gain.value = 6;
    lfo.connect(depth);
    lfo.start(t);
    const voices = [];
    for (const semis of [-12, -5, 0, 4, 7, 12]) {
      for (const detune of [-9, 8]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = note(semis) / 2;
        osc.detune.value = detune;
        depth.connect(osc.detune);
        const voice = ctx.createGain();
        voice.gain.value = 0.18;
        osc.connect(voice).connect(gain);
        osc.start(t);
        voices.push(osc);
      }
    }
    pad = { gain, voices, lfo };
  }
  function stopPad(t, fade = 0.4) {
    if (!pad) return;
    const { gain, voices, lfo } = pad;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    for (const osc of [...voices, lfo]) osc.stop(t + fade + 0.05);
    pad = null;
  }

  let landed = 0;
  window.burstSfx = {
    // The big gift falling in like a comet: a whistle sliding down, its fizz, and crackles in its tail.
    fall: play((t, length, pan = 0) => {
      noise(t, length, { from: 3200, to: 650, q: 7, peak: 0.2, attack: 0.12, pan });
      tone(t, 1600, length, { type: "triangle", to: 480, peak: 0.035, attack: 0.12, pan });
      noise(t, length, { type: "highpass", from: 5000, to: 7000, q: 0.5, peak: 0.05, attack: 0.1, pan });
      for (let i = 0; i < 14; i++) click(t + rand(0.05, length), rand(3000, 7000), rand(0.05, 0.12), pan + rand(-0.1, 0.1));
    }),
    // Swerving off to the middle: a whoosh that travels across, with the crackles still trailing.
    whoosh: play((t, length, pan = 0) => {
      noise(t, length, { from: 250, to: 2600, q: 1.3, peak: 0.3, attack: length * 0.55, pan, panTo: 0 });
      noise(t + 0.1, length * 0.8, { from: 900, to: 4500, q: 4, peak: 0.07, attack: length * 0.5, pan, panTo: 0 });
      for (let i = 0; i < 10; i++) click(t + rand(0, length), rand(3000, 7000), rand(0.04, 0.09), pan * (1 - i / 10));
    }),
    // The magic circle opening: a harp run up two octaves, a bright bell on top and the choir coming in.
    chime: play(t => {
      PENTATONIC.forEach((s, i) => bell(t + i * 0.055, note(s), 1.6, 0.075, -0.6 + (i / PENTATONIC.length) * 1.2));
      bell(t + 0.62, note(24), 2.6, 0.1);
      bell(t + 0.62, note(31), 2.2, 0.05);
      noise(t + 0.3, 1.6, { type: "highpass", from: 6000, to: 9500, q: 0.5, peak: 0.05, attack: 0.3 });
      startPad(t + 0.2);
    }),
    // The gathering, the bed under it: a vortex. A low rumble, two whistling winds that circle round the
    // listener (left to right and back, faster and faster) and rise in pitch, a hum climbing under them, a
    // glassy wobble, and a swell that sucks in towards the end, when the heart closes.
    swirl: play((t, length) => {
      noise(t, length, { type: "lowpass", from: 120, to: 420, q: 0.8, peak: 0.16, attack: length * 0.4, roomy: 0.4 });
      circling(t, length, { from: 300, to: 2600, q: 5, peak: 0.16, spinFrom: 0.4, spinTo: 3.2, phase: 0 });
      circling(t + 0.15, length - 0.15, { from: 900, to: 5200, q: 9, peak: 0.07, spinFrom: 0.6, spinTo: 4.2, phase: Math.PI });
      tone(t, 110, length, { type: "triangle", to: 440, peak: 0.05, attack: length * 0.8 });
      tone(t, 165, length, { type: "sine", to: 660, peak: 0.03, attack: length * 0.8, detune: 7 });
      wobble(t + length * 0.2, length * 0.8);
      // The suck at the end: noise swelling up and cut off as the last gifts land.
      noise(t + length * 0.45, length * 0.55, { type: "highpass", from: 1500, to: 7000, q: 0.6, peak: 0.12, attack: length * 0.5, roomy: 1.2 });
    }),
    // One gift leaving the jar: a short "bloop", lower for big gifts, from where it is (pan).
    pop: limited(28, (t, pan = 0, size = 28) => {
      const base = Math.max(260, 900 - size * 5) * rand(0.9, 1.15);
      tone(t, base, 0.09, { peak: 0.05, to: base * 1.9, pan, roomy: 0.4 });
      click(t, rand(1500, 2600), 0.025, pan);
    }),
    // A gift swishing past on its way round.
    flit: limited(45, (t, pan = 0) => {
      noise(t, 0.22, { from: rand(1200, 2200), to: rand(3500, 6000), q: 3, peak: 0.035, attack: 0.08, pan: pan, panTo: -pan * 0.6, roomy: 0.5 });
    }),
    // A gift settling into its place on the heart: a soft glassy tink, higher towards the top of the heart
    // (height 0 at the tip to 1 at the top) and from its side.
    settle: limited(32, (t, pan = 0, height = 0.5) => {
      const step = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.floor(height * PENTATONIC.length))];
      bell(t, note(step + 12), 0.4, 0.022, pan);
    }),
    // The heart closing: a soft chord blooming, a glint on top and a breath of air.
    formed: play(t => {
      for (const s of [0, 4, 7, 11, 14]) tone(t, note(s), 2.2, { type: "sine", peak: 0.03, attack: 0.25, detune: rand(-6, 6) });
      bell(t + 0.1, note(26), 1.6, 0.05);
      noise(t, 0.9, { type: "highpass", from: 9000, to: 4000, q: 0.4, peak: 0.06, attack: 0.05, roomy: 1.3 });
    }),
    // Light running over the heart: a rising sweep of tiny bells across the stereo field.
    sparkle: play(t => {
      for (let i = 0; i < 12; i++) bell(t + i * 0.045 + rand(0, 0.02), note(PENTATONIC[i % PENTATONIC.length] + 12), 0.5, 0.03, rand(-0.8, 0.8));
    }),
    // The sender's name appearing: a short, bright fanfare.
    fanfare: play(t => {
      [[0, 0], [0.11, 4], [0.22, 7], [0.36, 12]].forEach(([at, s], i) => {
        const len = i === 3 ? 1.1 : 0.22;
        for (const detune of [-6, 6]) tone(t + at, note(s), len, { type: "sawtooth", peak: 0.035, attack: 0.01, detune });
        tone(t + at, note(s) * 2, len, { type: "triangle", peak: 0.03, attack: 0.01 });
      });
      bell(t + 0.36, note(24), 1.4, 0.06);
    }),
    // A heartbeat, "lub-dub", louder and deeper with each one (strength 0, 1, 2).
    beat: play((t, strength = 0) => {
      const peak = 0.5 + strength * 0.17;
      tone(t, 92 - strength * 6, 0.34, { peak, to: 40, roomy: 0.6 });
      tone(t + 0.17, 78 - strength * 5, 0.28, { peak: peak * 0.6, to: 36, roomy: 0.6 });
      noise(t, 0.14, { type: "lowpass", from: 1000, to: 140, peak: peak * 0.22, attack: 0.003, roomy: 0.5 });
      tone(t, 55, 0.5, { peak: peak * 0.4, to: 35, roomy: 0.3 });
    }),
    // Gathering strength: a rising pitch with a fast tremble, noise building, and electric crackling.
    charge: play((t, length) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(1300, t + length);
      const trem = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.frequency.setValueAtTime(8, t);
      lfo.frequency.linearRampToValueAtTime(28, t + length);
      lfoDepth.gain.value = 0.5;
      trem.gain.value = 0.5;
      lfo.connect(lfoDepth).connect(trem.gain);
      osc.connect(trem).connect(envelope(t, length + 0.05, 0.07, length * 0.9, out(0, 0.8)));
      osc.start(t); lfo.start(t);
      osc.stop(t + length + 0.1); lfo.stop(t + length + 0.1);
      noise(t, length, { type: "highpass", from: 400, to: 6000, q: 0.7, peak: 0.2, attack: length * 0.9 });
      for (let i = 0; i < 18; i++) click(t + length * (i / 18) ** 0.6, rand(2500, 8000), rand(0.05, 0.14), rand(-0.6, 0.6));
    }),
    // The burst: a deep drop and thump, a crash spreading wide, breaking glass, then glitter falling.
    boom: play(t => {
      stopPad(t, 0.05);
      tone(t, 140, 1.2, { peak: 0.95, to: 26, roomy: 0.5 });
      tone(t, 70, 1.8, { peak: 0.5, to: 30, roomy: 0.3 });
      noise(t, 2.0, { type: "lowpass", from: 2600, to: 60, q: 0.8, peak: 0.85, attack: 0.003 });
      noise(t, 0.6, { from: 3500, to: 700, q: 0.8, peak: 0.4, attack: 0.002, pan: -0.5 });
      noise(t, 0.6, { from: 3400, to: 650, q: 0.8, peak: 0.4, attack: 0.002, pan: 0.5 });
      noise(t, 1.4, { type: "highpass", from: 7000, to: 3000, q: 0.6, peak: 0.12, attack: 0.005 });
      for (let i = 0; i < 9; i++) bell(t + rand(0, 0.25), rand(2600, 5200), rand(0.15, 0.4), 0.05, rand(-0.9, 0.9));
      for (let i = 0; i < 12; i++) bell(t + 0.3 + rand(0, 1.6), note(PENTATONIC[(Math.random() * PENTATONIC.length) | 0] + 12), 0.5, 0.025, rand(-0.9, 0.9));
    }),
    // The gifts hanging in the air for a moment: a held, glittering shimmer.
    hang: play((t, length) => {
      for (const s of [12, 16, 19, 24]) tone(t, note(s), length + 0.6, { type: "sine", peak: 0.025, attack: 0.15, detune: rand(-8, 8) });
      noise(t, length + 0.4, { type: "highpass", from: 8000, to: 6000, q: 0.5, peak: 0.04, attack: 0.1 });
    }),
    // Pulled back to the jar: a rush towards where the jar is.
    rush: play((t, length, pan = 0) => {
      landed = 0;
      noise(t, length, { from: 3000, to: 300, q: 1.2, peak: 0.25, attack: length * 0.3, pan: -pan * 0.5, panTo: pan });
      tone(t, 900, length, { type: "triangle", to: 220, peak: 0.03, attack: length * 0.3, pan });
    }),
    // A gift dropping back into the jar: plinks that climb a scale as more of them land.
    plink: play((t, pan = 0) => {
      const step = PENTATONIC[landed++ % PENTATONIC.length] + 12 * (Math.floor(landed / PENTATONIC.length) % 2);
      bell(t, note(step), 0.3, 0.045, pan);
      click(t, 1800, 0.04, pan);
    }),
    // Everything stopped at once (a session reset in the middle of the effect).
    stop: play(t => stopPad(t, 0.2)),
    // All back in: a warm, bright chord with a bell on top.
    done: play((t, pan = 0) => {
      for (const s of [0, 4, 7, 12, 16]) for (const detune of [-5, 5]) tone(t, note(s - 12), 1.8, { type: "triangle", peak: 0.03, attack: 0.02, detune, pan: pan * 0.5 });
      bell(t + 0.05, note(24), 2.2, 0.08, pan * 0.5);
      bell(t + 0.15, note(28), 2.0, 0.05, pan * 0.5);
    })
  };
})();

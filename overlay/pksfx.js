// Sounds for the jar game's PK panel (pk.js), made with the same Web Audio makings as the big gift's sounds
// (sfx.js, window.sfxKit), so there are no sound files. In order of a round: a drum hit as a new round is
// shown; the reel clicking round and landing on Phe Giữ's boost (a bright chord, the brighter the bigger the
// boost, or a sad "wah wah" for none); a whistle as the clock starts; coins as gifts come in, a whoosh and a
// till's "ching" as Phe Giữ's coins are boosted; a short fanfare when the lead changes hands, a bigger one for
// a big gift; the clock ticking through the last ten seconds and beeping the last three; a horn when time is
// up; then cheering and bells if Phe Giữ wins, thunder, a dark "dun dun duun" and a stamp if Phe Phá wins.
// Always at full volume (pk.js calls setVolume(1)); pk.html?preview makes no sound.
(() => {
  const kit = window.sfxKit;
  if (!kit) return;
  const { play, limited, tone, held, bell, noise, click, note, rand, PENTATONIC } = kit;
  // A short brass-like note: two detuned saws and a triangle an octave up.
  const brass = (t, semis, length, peak = 0.04) => {
    for (const detune of [-7, 7]) tone(t, note(semis), length, { type: "sawtooth", peak, attack: 0.012, detune });
    tone(t, note(semis) * 2, length, { type: "triangle", peak: peak * 0.8, attack: 0.012 });
  };
  // A drum: a pitched thump and a burst of noise.
  const drum = (t, peak = 0.6, pitch = 120) => {
    tone(t, pitch, 0.35, { peak, to: 40, roomy: 0.4 });
    noise(t, 0.18, { type: "lowpass", from: 1800, to: 200, peak: peak * 0.35, attack: 0.002, roomy: 0.5 });
  };
  // A team's side of the stereo field: Phe Phá on the left, Phe Giữ on the right, as on the panel.
  const side = team => (team === "raid" ? -0.45 : 0.45);

  window.pkSfx = {
    // A new round's dare on screen: a whoosh and a drum hit.
    preview: play(t => {
      noise(t, 0.45, { from: 400, to: 3000, q: 1, peak: 0.18, attack: 0.3 });
      drum(t + 0.4, 0.55);
      bell(t + 0.42, note(12), 0.8, 0.05);
    }),
    // The reel turning: one click per number going past.
    reelTick: limited(35, (t, i = 0) => {
      click(t, 2600 + (i % 3) * 400, 0.12);
      tone(t, note(19 + (i % 5)), 0.05, { type: "square", peak: 0.015, roomy: 0.2 });
    }),
    // The reel stopping on Phe Giữ's boost: a sad "wah wah" for none, otherwise a chord that grows with it.
    reelLand: play((t, boost = 1) => {
      if (boost <= 1) {
        [[0, -5], [0.28, -6], [0.56, -7]].forEach(([at, s], i) => {
          tone(t + at, note(s - 12), i === 2 ? 0.8 : 0.26, { type: "triangle", peak: 0.09, attack: 0.02, to: i === 2 ? note(s - 13) : 0 });
        });
        return;
      }
      drum(t, 0.5, 150);
      const chord = boost >= 4 ? [0, 4, 7, 12, 16, 19] : boost >= 3 ? [0, 4, 7, 12, 16] : boost >= 2 ? [0, 4, 7, 12] : [0, 4, 7];
      for (const s of chord) tone(t, note(s), 1.4, { type: "triangle", peak: 0.04, attack: 0.01, detune: rand(-6, 6) });
      bell(t + 0.02, note(24), 1.4, 0.08);
      const run = Math.round(boost * 3);
      for (let i = 0; i < run; i++) bell(t + 0.1 + i * 0.05, note(PENTATONIC[i % PENTATONIC.length] + 12), 0.5, 0.03, rand(-0.7, 0.7));
      if (boost >= 4) noise(t, 1.2, { type: "highpass", from: 8000, to: 4000, q: 0.5, peak: 0.08, attack: 0.02 });
    }),
    // The clock starting: a referee's whistle.
    start: play(t => {
      for (const [at, len] of [[0, 0.16], [0.22, 0.5]]) {
        tone(t + at, 2900, len, { type: "sine", peak: 0.08, attack: 0.01, detune: 0, roomy: 0.5 });
        tone(t + at, 2950, len, { type: "sine", peak: 0.05, attack: 0.01, roomy: 0.5 });
        noise(t + at, len, { from: 3000, to: 3200, q: 6, peak: 0.08, attack: 0.01, roomy: 0.4 });
      }
    }),
    // A gift's coins: two quick coin notes from its side, Phe Phá's a little lower.
    coin: limited(70, (t, team = "guard") => {
      const base = team === "raid" ? 19 : 24;
      bell(t, note(base), 0.35, 0.05, side(team));
      bell(t + 0.07, note(base + 5), 0.5, 0.05, side(team));
    }),
    // A like or a comment adding a point to Phe Giữ: a soft pop, a little higher for a comment.
    cheer: limited(90, (t, kind = "like") => {
      tone(t, kind === "chat" ? 1320 : 990, 0.09, { type: "sine", peak: 0.12, attack: 0.002, to: kind === "chat" ? 1760 : 1320, pan: 0.45, roomy: 0.3 });
      click(t, 3000, 0.05, 0.45);
    }),
    // The boost flying into Phe Giữ's coins.
    boostFly: limited(120, t => {
      noise(t, 0.35, { from: 800, to: 5000, q: 2, peak: 0.12, attack: 0.25, pan: 0.6, panTo: 0.3 });
    }),
    // The coins becoming points: a till's "ching", higher for a bigger boost.
    multiply: limited(120, (t, boost = 2) => {
      const lift = Math.round((boost - 1) * 2);
      bell(t, note(24 + lift), 0.9, 0.08, 0.4);
      bell(t + 0.06, note(28 + lift), 0.9, 0.06, 0.4);
      bell(t + 0.12, note(31 + lift), 1.1, 0.05, 0.4);
      click(t, 6000, 0.08, 0.4);
    }),
    // The lead changing hands: a swoosh across the panel and a short fanfare, bright for Phe Giữ, dark for Phe Phá.
    lead: play((t, team = "guard") => {
      noise(t, 0.4, { from: 600, to: 4000, q: 1.2, peak: 0.16, attack: 0.15, pan: -side(team), panTo: side(team) });
      const notes = team === "guard" ? [0, 4, 7, 12] : [-12, -9, -5, -6];
      notes.forEach((s, i) => brass(t + 0.12 + i * 0.09, s, i === 3 ? 0.55 : 0.12, 0.035));
    }),
    // A big gift: a drum roll and a bigger fanfare.
    bigGift: play((t, team = "guard") => {
      for (let i = 0; i < 8; i++) drum(t + i * 0.045, 0.18 + i * 0.03, 180);
      const tune = team === "guard" ? [[0, 0], [0.12, 4], [0.24, 7], [0.4, 12], [0.52, 16]] : [[0, -12], [0.12, -9], [0.24, -5], [0.4, 0], [0.52, 3]];
      tune.forEach(([at, s], i) => brass(t + 0.38 + at, s, i === 4 ? 0.9 : 0.14, 0.04));
      bell(t + 0.9, note(24), 1.4, 0.07, side(team));
      noise(t + 0.9, 1, { type: "highpass", from: 8000, to: 5000, q: 0.5, peak: 0.06, attack: 0.02 });
    }),
    // The last ten seconds: a wooden tick each second, then rising beeps for the last three.
    finalTick: play((t, left = 10) => {
      if (left > 3) {
        // "Tick" and "tock" in turn, like a clock, a little higher each second; dry, so each one is clear.
        const pitch = (left % 2 ? 1400 : 1050) * 2 ** ((10 - left) / 24);
        tone(t, pitch, 0.08, { type: "sine", peak: 0.35, attack: 0.001, roomy: 0.1 });
        tone(t, pitch * 2.6, 0.03, { type: "triangle", peak: 0.08, attack: 0.001, roomy: 0.1 });
        noise(t, 0.04, { from: pitch * 1.5, to: pitch, q: 4, peak: 0.25, attack: 0.001, roomy: 0.1 });
        return;
      }
      // The last three: a loud, round beep with a drum under it, the last one longer.
      const length = left === 1 ? 0.5 : 0.22;
      held(t, 1046.5, length, { type: "sine", peak: 0.3, roomy: 0.15 });
      held(t, 1046.5, length, { type: "square", peak: 0.045, roomy: 0.15 });
      held(t, 2093, length, { type: "sine", peak: 0.06, roomy: 0.15 });
      tone(t, 110, 0.25, { peak: 0.45, to: 45, roomy: 0.1 });
    }),
    // Time up: a loud buzzer held for a second.
    horn: play(t => {
      for (const [freq, type, peak] of [[220, "square", 0.07], [330, "sawtooth", 0.05], [440, "square", 0.035]]) {
        for (const detune of [-12, 12]) held(t, freq, 1, { type, peak, attack: 0.01, release: 0.12, detune, roomy: 0.2 });
      }
      noise(t, 1.1, { type: "lowpass", from: 900, to: 600, q: 0.7, peak: 0.1, attack: 0.01, roomy: 0.1 });
    }),
    // Phe Giữ wins: a happy fanfare, cheering and clapping, and bells falling like the hearts.
    winGuard: play(t => {
      [[0, 0], [0.13, 4], [0.26, 7], [0.42, 12], [0.55, 7], [0.68, 12], [0.84, 16]].forEach(([at, s], i) => brass(t + at, s, i === 6 ? 1.4 : 0.14, 0.04));
      for (const s of [0, 4, 7, 12]) tone(t + 0.84, note(s - 12), 1.8, { type: "triangle", peak: 0.035, attack: 0.02 });
      // Clapping: many short claps scattered across the stereo field.
      for (let i = 0; i < 60; i++) click(t + 0.3 + rand(0, 2.4), rand(1200, 2600), rand(0.05, 0.12), rand(-0.9, 0.9));
      noise(t + 0.3, 2.6, { from: 900, to: 1400, q: 0.6, peak: 0.07, attack: 0.4 });
      for (let i = 0; i < 16; i++) bell(t + 1 + rand(0, 2), note(PENTATONIC[(Math.random() * PENTATONIC.length) | 0] + 12), 0.6, 0.03, rand(-0.9, 0.9));
    }),
    // Phe Phá wins: thunder, a dark "dun dun duun", and the stamp coming down on the dare.
    winRaid: play(t => {
      noise(t, 0.25, { type: "highpass", from: 3000, to: 1500, q: 0.5, peak: 0.3, attack: 0.002 });
      noise(t + 0.05, 2.4, { type: "lowpass", from: 900, to: 50, q: 0.7, peak: 0.6, attack: 0.04 });
      [[0.25, -12, 0.3], [0.6, -13, 0.3], [0.95, -17, 1.4]].forEach(([at, s, len]) => {
        for (const detune of [-8, 8]) tone(t + at, note(s - 12), len, { type: "sawtooth", peak: 0.07, attack: 0.02, detune });
        tone(t + at, note(s - 24), len, { type: "sine", peak: 0.2, attack: 0.02 });
      });
      // The stamp's thud: pk.html brings the stamp down 0.55 seconds after the result shows, landing about now.
      tone(t + 0.95, 90, 0.4, { peak: 0.7, to: 40, roomy: 0.3 });
      noise(t + 0.95, 0.2, { type: "lowpass", from: 2000, to: 200, peak: 0.35, attack: 0.002, roomy: 0.3 });
    }),
    // A draw: a bright, friendly two-note chime.
    draw: play(t => {
      bell(t, note(12), 1, 0.08);
      bell(t + 0.18, note(19), 1.4, 0.08);
      for (let i = 0; i < 6; i++) bell(t + 0.3 + i * 0.08, note(PENTATONIC[i] + 12), 0.4, 0.025, rand(-0.6, 0.6));
    })
  };
})();

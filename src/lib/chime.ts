// Il suono di una chat in attesa (M74): due note brevi e morbide, generate con Web Audio (nessun file audio
// nel bundle). Lo suona terminals.notifyTerminalBell quando Orbit non è in primo piano, se l'impostazione
// è accesa e Do not disturb è spento. Al massimo uno ogni 1,5 s: più chat che finiscono insieme non fanno
// una raffica.

let ctx: AudioContext | null = null;
let last = 0;

export function playChime() {
  const now = Date.now();
  if (now - last < 1500) return;
  last = now;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    // re e la sopra (587 e 880 Hz): un intervallo di quinta, gentile
    for (const [freq, at] of [
      [587.33, 0],
      [880, 0.11],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(0.09, t0 + at + 0.015); // attacco rapido, senza clic
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.45); // coda che sfuma
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.5);
    }
  } catch {
    /* audio non disponibile: si resta col pallino e il lampeggio */
  }
}

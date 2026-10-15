// A short, soft click for on-screen keyboard keys, synthesized with Web Audio
// (no sound file). Its own AudioContext, created on the first key press (a
// user gesture), independent of the film's volume.

let context = null;

export function playClick() {
	try {
		context ??= new AudioContext();
		if (context.state === 'suspended') context.resume();
		const t = context.currentTime;
		const tone = context.createOscillator();
		tone.type = 'triangle';
		tone.frequency.setValueAtTime(1500, t);
		tone.frequency.exponentialRampToValueAtTime(600, t + 0.03);
		const gain = context.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
		tone.connect(gain).connect(context.destination);
		tone.start(t);
		tone.stop(t + 0.06);
	} catch {
		// No Web Audio: typing still works, silently.
	}
}

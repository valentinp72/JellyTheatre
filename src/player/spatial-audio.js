// Spatial audio: the film's channels play from virtual cinema speakers.
//
// Each channel keeps its own signal (no downmix before spatializing) and plays
// from a virtual speaker placed like in a cinema: left, centre and right on the
// screen, surrounds to the sides and behind, at the angles of the ITU / Dolby
// layouts, relative to the line from the listener to the screen (so they stay
// around the seat in every room). The LFE is not directional: it goes to both
// ears.
//
// Not the browser's HRTF panner: its generic head responses filter both ears
// and make the whole film sound dull. Instead a spherical head model: the ear
// facing a speaker gets its signal untouched; the other ear gets it slightly
// later (interaural delay, up to 0.66 ms) and with less treble (head shadow).
// A speaker straight ahead (the centre channel, dialogue) reaches both ears
// unfiltered. Head tracking resolves front and back.

import * as THREE from 'three';

// Web Audio / WAVE channel order.
const LAYOUTS = {
	// L R C LFE SL SR
	6: ['left', 'right', 'center', 'lfe', { angle: 110 }, { angle: -110 }],
	// L R C LFE BL BR SL SR
	8: ['left', 'right', 'center', 'lfe', { angle: 150 }, { angle: -150 }, { angle: 90 }, { angle: -90 }],
};
// Bass channel level in the headphones (-6 dB): it is mixed hot for cinema
// subwoofers, and the main channels already carry bass.
const LFE_GAIN = 0.5;
// Each ear also hears the speakers of the other side, as in a real room:
// -3 dB brings dialogue (centre channel) to the level of the plain stereo
// downmix, so turning spatial audio on or off doesn't jump in loudness.
const TRIM = 0.7;
// Surrounds sit a little above the listener's head, like on cinema walls.
const SURROUND_RISE = 0.6;
const SURROUND_DISTANCE = 2.5;
// Head model: radius (m), speed of sound (m/s), far-ear treble cut for a
// speaker at the side (dB) and where it starts (Hz).
const HEAD_RADIUS = 0.0875;
const SOUND_SPEED = 343;
const SHADOW_DB = 12;
const SHADOW_HZ = 1800;
// Smoothing of head movements (s): no clicks, no audible pitch glide.
const SMOOTHING = 0.03;
// Channel activity is measured this often (s), to show what the film carries.
const METER_INTERVAL = 0.5;
const SILENCE = 1e-4;

const head = new THREE.Vector3();
const headInverse = new THREE.Quaternion();
const scratch = new THREE.Vector3();
const screenCenter = new THREE.Vector3();
const toScreen = new THREE.Vector3();
const point = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

/** One channel to both ears: delay, head-shadow shelf and level per ear. */
class VirtualSpeaker {
	constructor(ctx, place, input, output) {
		this.place = place;
		this.ctx = ctx;
		const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
		this.ears = [0, 1].map((ear) => {
			const delay = new DelayNode(ctx, { maxDelayTime: 0.002, delayTime: 0 });
			const shadow = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: SHADOW_HZ, gain: 0 });
			input.connect(delay).connect(shadow).connect(merger, 0, ear);
			return { delay, shadow, lateral: 0 };
		});
		merger.connect(output);
		this.nodes = [merger, ...this.ears.flatMap(({ delay, shadow }) => [delay, shadow])];
	}

	/** @param {number} lateral -1 (fully left of the head) to 1 (fully right) */
	aim(lateral) {
		const time = this.ctx.currentTime;
		const angle = Math.asin(Math.min(1, Math.abs(lateral)));
		// Woodworth's formula for the extra path around the head.
		const itd = (HEAD_RADIUS / SOUND_SPEED) * (angle + Math.sin(angle));
		this.ears.forEach((ear, index) => {
			// Positive on the far side of the head for this ear.
			const away = index === 0 ? lateral : -lateral;
			const far = Math.max(0, away);
			if (Math.abs(far - ear.lateral) < 0.005) return;
			ear.lateral = far;
			ear.delay.delayTime.setTargetAtTime(far > 0 ? itd : 0, time, SMOOTHING);
			ear.shadow.gain.setTargetAtTime(-SHADOW_DB * far, time, SMOOTHING);
		});
	}
}

export class SpatialAudio {
	/**
	 * @param {AudioContext} context
	 * @param {AudioNode} input the film's audio (all its channels)
	 * @param {AudioNode} output where the result goes (stereo)
	 */
	constructor(context, input, output) {
		this.context = context;
		this.input = input;
		this.output = output;
		this.enabled = false;
		this.channels = 0;
		this.nodes = [];
		this.speakers = [];
		this.meters = [];
		this.heard = [];
		this.lastMeter = 0;
		this.samples = new Float32Array(512);
	}

	/**
	 * @param {boolean} enabled false: the film's audio goes straight out (the
	 *   browser downmixes it to stereo)
	 * @param {number} channels channel count of the film's audio track
	 */
	configure(enabled, channels) {
		const count = channels > 6 ? 8 : 6;
		this.heard = [];
		if (enabled === this.enabled && (!enabled || count === this.channels)) return;
		this.teardown();
		this.enabled = enabled;
		this.channels = count;
		if (!enabled) {
			this.input.connect(this.output);
			return;
		}
		const ctx = this.context;
		// Up to 6 channels: let Web Audio's speaker rules lay out mono (centre),
		// stereo (left / right) and quad. 8: taken channel by channel.
		const layout = new GainNode(ctx, {
			channelCount: count,
			channelCountMode: 'explicit',
			channelInterpretation: count === 6 ? 'speakers' : 'discrete',
		});
		const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: count });
		const trim = new GainNode(ctx, { gain: TRIM });
		this.input.connect(layout).connect(splitter);
		trim.connect(this.output);
		this.nodes.push(layout, splitter, trim);
		LAYOUTS[count].forEach((place, index) => {
			const channel = new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit' });
			const meter = new AnalyserNode(ctx, { fftSize: this.samples.length });
			splitter.connect(channel, index);
			channel.connect(meter);
			this.nodes.push(channel, meter);
			this.meters.push(meter);
			if (place === 'lfe') {
				channel.gain.value = LFE_GAIN;
				channel.connect(this.output);
				return;
			}
			const speaker = new VirtualSpeaker(ctx, place, channel, trim);
			this.nodes.push(...speaker.nodes);
			this.speakers.push(speaker);
		});
	}

	teardown() {
		this.input.disconnect();
		for (const node of this.nodes) node.disconnect();
		this.nodes = [];
		this.speakers = [];
		this.meters = [];
	}

	/**
	 * What the film's audio actually carries ('7.1', '5.1', 'stereo', 'mono'),
	 * from the channels heard so far: a browser may downmix before Web Audio.
	 * Empty until something was heard (or with spatial audio off).
	 */
	heardLayout() {
		const h = this.heard;
		if (!this.enabled) return '';
		if (h[6] || h[7]) return '7.1';
		if (h[4] || h[5]) return '5.1';
		if (h[0] || h[1]) return h[2] ? '3.0' : 'stereo';
		return h[2] ? 'mono' : '';
	}

	measure() {
		this.meters.forEach((meter, index) => {
			if (this.heard[index]) return;
			meter.getFloatTimeDomainData(this.samples);
			let sum = 0;
			for (const value of this.samples) sum += value * value;
			if (Math.sqrt(sum / this.samples.length) > SILENCE) this.heard[index] = true;
		});
	}

	/**
	 * Follows the head and the screen (call every frame).
	 * @param {THREE.Object3D} camera
	 * @param {THREE.Object3D} screen centre of the screen, facing the room
	 * @param {number} width the picture's width in metres
	 */
	update(camera, screen, width) {
		if (!this.enabled) return;
		if (this.context.currentTime - this.lastMeter > METER_INTERVAL) {
			this.lastMeter = this.context.currentTime;
			this.measure();
		}
		camera.updateMatrixWorld();
		camera.matrixWorld.decompose(head, headInverse, scratch);
		headInverse.invert();

		screen.updateMatrixWorld();
		screenCenter.setFromMatrixPosition(screen.matrixWorld);
		// Horizontal direction from the listener to the screen.
		toScreen.subVectors(screenCenter, head).setY(0);
		if (toScreen.lengthSq() < 1e-6) toScreen.set(0, 0, -1);
		toScreen.normalize();
		for (const speaker of this.speakers) {
			const { place } = speaker;
			if (place === 'center') {
				point.copy(screenCenter);
			} else if (place === 'left' || place === 'right') {
				point.set(place === 'left' ? -width / 2 : width / 2, 0, 0).applyMatrix4(screen.matrixWorld);
			} else {
				point.copy(toScreen)
					.applyAxisAngle(yAxis, THREE.MathUtils.degToRad(place.angle))
					.multiplyScalar(SURROUND_DISTANCE)
					.add(head);
				point.y += SURROUND_RISE;
			}
			// Direction in head space: x is how far to the right of the head.
			point.sub(head).applyQuaternion(headInverse);
			const length = point.length();
			speaker.aim(length > 1e-6 ? point.x / length : 0);
		}
	}
}

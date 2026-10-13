// Settings, on their own panel (movable with the grip, like the controls).
// Generated from SETTING_DEFINITIONS. Emits `close-request`.

import * as THREE from 'three';
import { environments } from '../environments/index.js';
import { environmentIcon } from '../environments/icons.js';
import { getSetting, runSettingAction, setSetting, SETTING_DEFINITIONS } from '../settings.js';
import { COLORS, entity, loadTexture, setInteractiveVisible } from './widgets.js';

export const SETTINGS_WIDTH = 1.6;
export const SETTINGS_HEIGHT = 1.12;
const TOP = SETTINGS_HEIGHT / 2;
const LEFT = -SETTINGS_WIDTH / 2 + 0.06;
const RIGHT = SETTINGS_WIDTH / 2 - 0.06;
const ROW_PITCH = 0.145;

AFRAME.registerComponent('settings-panel', {
	init() {
		this.visible = false;
		const background = entity({ 'ui-rect': `width: ${SETTINGS_WIDTH}; height: ${SETTINGS_HEIGHT}; radius: 0.035; opacity: 0.96` });
		// The background is a pointing target, so the panel can be grabbed.
		background.dataset.interactive = '';
		const handle = entity({ position: `0 ${TOP - 0.014} 0.002`, 'ui-rect': `width: 0.12; height: 0.009; radius: 0.0045; color: ${COLORS.muted}` });
		this.title = entity({ position: `${LEFT} ${TOP - 0.07} 0.002`, 'ui-text': 'value: Settings; fontSize: 0.045; weight: bold; anchorX: left' });
		const close = entity({ position: `${RIGHT - 0.09} ${TOP - 0.07} 0.002`, 'ui-button': 'label: Close; width: 0.18; height: 0.065; fontSize: 0.026' });
		close.addEventListener('click', () => this.el.emit('close-request'));
		this.back = entity({ position: `${RIGHT - 0.18 - 0.02 - 0.09} ${TOP - 0.07} 0.002`, 'ui-button': 'label: ‹ Back; width: 0.18; height: 0.065; fontSize: 0.026' });
		this.back.addEventListener('click', () => this.showList());
		this.el.append(background, handle, this.title, close, this.back);
		// Two pages: the list of settings, and a picker (environments).
		this.list = entity();
		this.picker = entity();
		this.el.append(this.list, this.picker);
		this.pickerSetting = null;

		// Two columns of settings.
		const valueW = 0.18;
		const columnGap = 0.07;
		const columnW = (RIGHT - LEFT - columnGap) / 2;
		const textWidth = columnW - valueW - 0.03;
		const perColumn = Math.ceil(SETTING_DEFINITIONS.length / 2);
		this.rows = SETTING_DEFINITIONS.map((setting, i) => {
			const column = Math.floor(i / perColumn);
			const x = LEFT + column * (columnW + columnGap);
			const y = TOP - 0.16 - (i % perColumn) * ROW_PITCH;
			const label = entity({ position: `${x} ${y} 0.002`, 'ui-text': { value: setting.label, fontSize: 0.028, anchorX: 'left', anchorY: 'top', maxWidth: textWidth } });
			const description = entity({
				position: `${x} ${y - 0.038} 0.002`,
				'ui-text': { value: setting.description, fontSize: 0.02, color: COLORS.muted, anchorX: 'left', anchorY: 'top', maxWidth: textWidth, lineHeight: 1.3 },
			});
			const position = `${x + columnW - valueW / 2} ${y - 0.035} 0.002`;
			if (setting.type === 'range') {
				// [−] value [+]
				const stepW = 0.055;
				const value = entity({ position });
				const text = entity({ 'ui-text': { fontSize: 0.024, align: 'center' } });
				const step = (direction) => {
					const next = getSetting(setting.name) + direction * setting.step;
					const clamped = Math.min(setting.max, Math.max(setting.min, next));
					// Rounded to avoid floating point noise (0.15000000000000002).
					setSetting(setting.name, Number((Math.round(clamped / setting.step) * setting.step).toFixed(4)));
				};
				const minus = entity({ position: `${-valueW / 2 + stepW / 2} 0 0`, 'ui-button': { label: '−', width: stepW, height: 0.062, fontSize: 0.03 } });
				const plus = entity({ position: `${valueW / 2 - stepW / 2} 0 0`, 'ui-button': { label: '+', width: stepW, height: 0.062, fontSize: 0.03 } });
				minus.addEventListener('click', () => step(-1));
				plus.addEventListener('click', () => step(1));
				value.append(minus, text, plus);
				this.list.append(label, description, value);
				return { setting, value, text };
			}
			const value = entity({
				position,
				'ui-button': { label: setting.action ?? '', width: valueW, height: 0.062, fontSize: 0.024 },
			});
			value.addEventListener('click', () => {
				if (setting.picker) {
					this.showPicker(setting);
				} else if (setting.type === 'action') {
					runSettingAction(setting.name);
				} else if (setting.type === 'choice') {
					// Cycle through the options.
					const index = setting.options.findIndex((option) => option.value === getSetting(setting.name));
					setSetting(setting.name, setting.options[(index + 1) % setting.options.length].value);
				} else {
					setSetting(setting.name, !getSetting(setting.name));
				}
			});
			this.list.append(label, description, value);
			return { setting, value };
		});

		this.onSettingChange = () => this.render();
		window.addEventListener('settingchange', this.onSettingChange);
		setInteractiveVisible(this.el, false);
	},

	remove() {
		window.removeEventListener('settingchange', this.onSettingChange);
	},

	setVisible(visible) {
		this.visible = visible;
		setInteractiveVisible(this.el, visible);
		if (visible) this.showList();
	},

	showList() {
		this.pickerSetting = null;
		this.title.setAttribute('ui-text', 'value', 'Settings');
		setInteractiveVisible(this.back, false);
		setInteractiveVisible(this.picker, false);
		setInteractiveVisible(this.list, this.visible);
		this.render();
	},

	/** A page of illustrated cards to choose the value of `setting`. */
	showPicker(setting) {
		this.pickerSetting = setting;
		this.title.setAttribute('ui-text', 'value', `Choose: ${setting.label.toLowerCase()}`);
		this.buildPicker(setting);
		setInteractiveVisible(this.list, false);
		setInteractiveVisible(this.picker, this.visible);
		setInteractiveVisible(this.back, this.visible);
	},

	buildPicker(setting) {
		this.picker.replaceChildren();
		const cols = 3;
		const gap = 0.04;
		const cardW = (RIGHT - LEFT - (cols - 1) * gap) / cols;
		const imageW = cardW - 0.03;
		const imageH = imageW * (9 / 16);
		const cardH = imageH + 0.15;
		const current = getSetting(setting.name);
		setting.options.forEach((option, i) => {
			const info = environments[option.value];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const card = entity({
				position: `${LEFT + cardW / 2 + col * (cardW + gap)} ${TOP - 0.15 - cardH / 2 - row * (cardH + gap)} 0.002`,
				'ui-button': { label: '', width: cardW, height: cardH, active: option.value === current },
			});
			const image = entity({ position: `0 ${cardH / 2 - 0.015 - imageH / 2} 0.003` });
			const material = new THREE.MeshBasicMaterial({ map: environmentIcon(option.value) });
			image.setObject3D('mesh', new THREE.Mesh(new THREE.PlaneGeometry(imageW, imageH), material));
			// A real screenshot when there is one (npm run screenshots); the drawn
			// illustration otherwise.
			if (info?.thumbnail) {
				loadTexture(`${import.meta.env.BASE_URL}environments/${option.value}.jpg`).then((texture) => {
					material.map = texture;
					material.needsUpdate = true;
				}).catch(() => {});
			}
			const name = entity({
				position: `${-cardW / 2 + 0.015} ${cardH / 2 - 0.03 - imageH} 0.003`,
				'ui-text': { value: info?.name ?? option.label, fontSize: 0.026, weight: 'bold', anchorX: 'left', anchorY: 'top' },
			});
			const description = entity({
				position: `${-cardW / 2 + 0.015} ${cardH / 2 - 0.068 - imageH} 0.003`,
				'ui-text': { value: info?.description ?? '', fontSize: 0.017, color: COLORS.muted, anchorX: 'left', anchorY: 'top', maxWidth: cardW - 0.03, lineHeight: 1.25 },
			});
			card.append(image, name, description);
			card.addEventListener('click', () => {
				setSetting(setting.name, option.value);
				this.showList();
			});
			this.picker.appendChild(card);
		});
	},

	render() {
		for (const { setting, value, text } of this.rows) {
			if (setting.type === 'action') continue;
			if (setting.type === 'range') {
				text.setAttribute('ui-text', 'value', setting.format(getSetting(setting.name)));
				continue;
			}
			if (setting.type === 'choice') {
				const current = setting.options.find((option) => option.value === getSetting(setting.name));
				// Picker settings open a page: show the value with an arrow.
				const label = setting.picker ? `${current?.label ?? ''} ›` : current?.label ?? '';
				// Long names ("Lakeside cabin ›") get a smaller font to fit.
				value.setAttribute('ui-button', { label, active: false, fontSize: label.length > 12 ? 0.019 : 0.024 });
			} else {
				const on = getSetting(setting.name);
				value.setAttribute('ui-button', { label: on ? 'On' : 'Off', active: on });
			}
		}
	},
});

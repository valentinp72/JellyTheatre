// Settings, on their own panel (movable with the grip, like the controls).
// Generated from SETTING_DEFINITIONS. Emits `close-request`.

import { getSetting, runSettingAction, setSetting, SETTING_DEFINITIONS } from '../settings.js';
import { COLORS, entity, setInteractiveVisible } from './widgets.js';

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
		const title = entity({ position: `${LEFT} ${TOP - 0.07} 0.002`, 'ui-text': 'value: Settings; fontSize: 0.045; weight: bold; anchorX: left' });
		const close = entity({ position: `${RIGHT - 0.09} ${TOP - 0.07} 0.002`, 'ui-button': 'label: Close; width: 0.18; height: 0.065; fontSize: 0.026' });
		close.addEventListener('click', () => this.el.emit('close-request'));
		this.el.append(background, handle, title, close);

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
			const value = entity({
				position: `${x + columnW - valueW / 2} ${y - 0.035} 0.002`,
				'ui-button': { label: setting.action ?? '', width: valueW, height: 0.062, fontSize: 0.024 },
			});
			value.addEventListener('click', () => {
				if (setting.type === 'action') {
					runSettingAction(setting.name);
				} else if (setting.type === 'choice') {
					// Cycle through the options.
					const index = setting.options.findIndex((option) => option.value === getSetting(setting.name));
					setSetting(setting.name, setting.options[(index + 1) % setting.options.length].value);
				} else {
					setSetting(setting.name, !getSetting(setting.name));
				}
			});
			this.el.append(label, description, value);
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
		if (visible) this.render();
	},

	render() {
		for (const { setting, value } of this.rows) {
			if (setting.type === 'action') continue;
			if (setting.type === 'choice') {
				const current = setting.options.find((option) => option.value === getSetting(setting.name));
				value.setAttribute('ui-button', { label: current?.label ?? '', active: false });
			} else {
				const on = getSetting(setting.name);
				value.setAttribute('ui-button', { label: on ? 'On' : 'Off', active: on });
			}
		}
	},
});

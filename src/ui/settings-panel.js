// Settings, on their own panel (movable with the grip, like the controls).
// Generated from SETTING_DEFINITIONS, one tab per category. Emits
// `close-request`.

import * as THREE from 'three';
import { ENVIRONMENT_TAGS, environments } from '../environments/index.js';
import { environmentIcon } from '../environments/icons.js';
import { getSetting, runSettingAction, setSetting, SETTING_CATEGORIES, SETTING_DEFINITIONS } from '../settings.js';
import { COLORS, entity, loadTexture, roundedRect, setInteractiveVisible } from './widgets.js';

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
		// Two pages: the list of settings (with tabs), and a picker (environments).
		this.list = entity();
		this.picker = entity();
		this.el.append(this.list, this.picker);
		this.pickerSetting = null;

		// Tabs, one per category, each with its own group of rows.
		this.category = SETTING_CATEGORIES[0].id;
		this.tabs = {};
		this.groups = {};
		let tabX = LEFT;
		for (const category of SETTING_CATEGORIES) {
			const width = 0.07 + category.label.length * 0.017;
			const tab = entity({ position: `${tabX + width / 2} ${TOP - 0.15} 0.002`, 'ui-button': { label: category.label, width, height: 0.062, fontSize: 0.026 } });
			tab.addEventListener('click', () => this.showList(category.id));
			this.tabs[category.id] = tab;
			this.groups[category.id] = entity();
			this.list.append(tab, this.groups[category.id]);
			tabX += width + 0.02;
		}

		// Two columns of settings in each tab.
		const valueW = 0.18;
		const columnGap = 0.07;
		const columnW = (RIGHT - LEFT - columnGap) / 2;
		const textWidth = columnW - valueW - 0.03;
		const indexInCategory = new Map();
		this.rows = SETTING_DEFINITIONS.map((setting) => {
			const siblings = SETTING_DEFINITIONS.filter((other) => other.category === setting.category);
			const i = indexInCategory.get(setting.category) ?? 0;
			indexInCategory.set(setting.category, i + 1);
			const perColumn = Math.ceil(siblings.length / 2);
			const group = this.groups[setting.category];
			const column = Math.floor(i / perColumn);
			const x = LEFT + column * (columnW + columnGap);
			const y = TOP - 0.25 - (i % perColumn) * ROW_PITCH;
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
				group.append(label, description, value);
				return { setting, value, text, description };
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
			group.append(label, description, value);
			return { setting, value, description };
		});

		this.onSettingChange = () => this.render();
		window.addEventListener('settingchange', this.onSettingChange);
		setInteractiveVisible(this.el, false);
	},

	remove() {
		window.removeEventListener('settingchange', this.onSettingChange);
	},

	/**
	 * @param {string} [category] tab to open (default: the last one shown)
	 * @param {string} [picker] setting whose picker to open instead (a shortcut:
	 * choosing closes the panel)
	 */
	setVisible(visible, category, picker) {
		this.visible = visible;
		setInteractiveVisible(this.el, visible);
		if (!visible) return;
		const pickerSetting = picker && SETTING_DEFINITIONS.find((setting) => setting.name === picker);
		if (pickerSetting) {
			this.category = pickerSetting.category;
			this.showPicker(pickerSetting, true);
		} else {
			this.showList(category);
		}
	},

	showList(category = this.category) {
		this.category = category;
		this.pickerSetting = null;
		this.title.setAttribute('ui-text', 'value', 'Settings');
		setInteractiveVisible(this.back, false);
		setInteractiveVisible(this.picker, false);
		setInteractiveVisible(this.list, this.visible);
		for (const [id, group] of Object.entries(this.groups)) {
			setInteractiveVisible(group, this.visible && id === category);
			this.tabs[id].setAttribute('ui-button', 'active', id === category);
		}
		this.render();
	},

	/** Shows `text` under a setting in place of its description ('' to restore it). */
	setNote(name, text) {
		const row = this.rows.find((r) => r.setting.name === name);
		row.description.setAttribute('ui-text', { value: text || row.setting.description, color: text ? COLORS.accent2 : COLORS.muted });
	},

	/**
	 * A page of illustrated cards to choose the value of `setting`.
	 * @param {boolean} [shortcut] opened directly: close the panel once chosen
	 */
	showPicker(setting, shortcut = false) {
		this.pickerSetting = setting;
		this.pickerShortcut = shortcut;
		this.title.setAttribute('ui-text', 'value', `Choose: ${setting.label.toLowerCase()}`);
		this.buildPicker(setting);
		setInteractiveVisible(this.list, false);
		setInteractiveVisible(this.picker, this.visible);
		setInteractiveVisible(this.back, this.visible);
	},

	buildPicker(setting) {
		this.picker.replaceChildren();
		// Two rows filling the page: four cards each for up to eight places,
		// more (narrower) after that.
		const n = setting.options.length;
		const cols = Math.max(3, Math.ceil(n / 2));
		const rows = Math.ceil(n / cols);
		const gap = 0.035;
		const top = TOP - 0.135;
		const bottom = -TOP + 0.05;
		const cardW = (RIGHT - LEFT - (cols - 1) * gap) / cols;
		const cardH = (top - bottom - (rows - 1) * gap) / rows;
		const pad = 0.015;
		const imageW = cardW - 2 * pad;
		const imageH = imageW * (9 / 16);
		// Tag chips under the name: icon and label, wrapped onto more lines when
		// they don't fit. Sizes are estimated (troika measures text later).
		const chipH = 0.036;
		const chipFont = 0.017;
		const chipIcon = 0.022;
		const chipGap = 0.008;
		const chipWidth = (label) => 0.012 + chipIcon + 0.008 + label.length * chipFont * 0.52 + 0.012;
		const layouts = setting.options.map((option) => {
			let x = 0;
			let line = 0;
			return (environments[option.value]?.tags ?? []).map((tag) => {
				const { icon, label } = ENVIRONMENT_TAGS[tag];
				const width = chipWidth(label);
				if (x > 0 && x + width > imageW) {
					x = 0;
					line++;
				}
				const chip = { icon, label, width, x, line };
				x += width + chipGap;
				return chip;
			});
		});
		// The same number of chip lines across a row, so its descriptions line up.
		const chipLines = (row) => Math.max(1, ...layouts.slice(row * cols, (row + 1) * cols).flat().map((chip) => chip.line + 1));
		const current = getSetting(setting.name);
		setting.options.forEach((option, i) => {
			const info = environments[option.value];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const card = entity({
				position: `${LEFT + cardW / 2 + col * (cardW + gap)} ${top - cardH / 2 - row * (cardH + gap)} 0.002`,
				'ui-button': { label: '', width: cardW, height: cardH, radius: 0.03 },
			});
			const cardTop = cardH / 2 - pad;
			const left = -cardW / 2 + pad;
			const image = entity({ position: `0 ${cardTop - imageH / 2} 0.003` });
			const material = new THREE.MeshBasicMaterial({ map: environmentIcon(option.value) });
			// Rounded like the card, so its corners stay inside it.
			image.setObject3D('mesh', new THREE.Mesh(roundedRect(imageW, imageH, 0.02), material));
			// A real screenshot when there is one (npm run screenshots); the drawn
			// illustration otherwise.
			if (info?.thumbnail) {
				loadTexture(`${import.meta.env.BASE_URL}environments/${option.value}.jpg`).then((texture) => {
					material.map = texture;
					material.needsUpdate = true;
				}).catch(() => {});
			}
			const nameY = cardTop - imageH - 0.018;
			const name = entity({
				position: `${left} ${nameY} 0.003`,
				'ui-text': { value: info?.name ?? option.label, fontSize: 0.03, weight: 'bold', anchorX: 'left', anchorY: 'top', maxWidth: imageW },
			});
			const chipsY = nameY - 0.05;
			const chips = layouts[i].map((chip) => entity({
				position: `${left + chip.x + chip.width / 2} ${chipsY - chipH / 2 - chip.line * (chipH + chipGap)} 0.003`,
				'ui-rect': { width: chip.width, height: chipH, radius: chipH / 2, color: COLORS.panel },
			}, [
				entity({ position: `${-chip.width / 2 + 0.012 + chipIcon / 2} 0 0.001`, 'ui-icon': { name: chip.icon, size: chipIcon, color: COLORS.text } }),
				entity({ position: `${-chip.width / 2 + 0.012 + chipIcon + 0.008} 0 0.001`, 'ui-text': { value: chip.label, fontSize: chipFont, anchorX: 'left' } }),
			]));
			const description = entity({
				position: `${left} ${chipsY - chipLines(row) * (chipH + chipGap) - 0.004} 0.003`,
				'ui-text': { value: info?.description ?? '', fontSize: 0.019, color: COLORS.muted, anchorX: 'left', anchorY: 'top', maxWidth: imageW, lineHeight: 1.3 },
			});
			card.append(image, name, ...chips, description);
			// The current place: an outline around its card, and a badge on its picture.
			if (option.value === current) {
				const outline = entity({ position: '0 0 -0.001', 'ui-rect': { width: cardW + 0.016, height: cardH + 0.016, radius: 0.038, color: COLORS.accent } });
				const badgeW = 0.11;
				const badge = entity({
					position: `${imageW / 2 - 0.012 - badgeW / 2} ${cardTop - 0.012 - chipH / 2} 0.004`,
					'ui-rect': { width: badgeW, height: chipH, radius: chipH / 2, color: COLORS.accent },
				}, [
					entity({ position: `${-badgeW / 2 + 0.012 + chipIcon / 2} 0 0.001`, 'ui-icon': { name: 'check', size: chipIcon, color: COLORS.text } }),
					entity({ position: `${-badgeW / 2 + 0.012 + chipIcon + 0.008} 0 0.001`, 'ui-text': { value: 'Current', fontSize: chipFont, weight: 'bold', anchorX: 'left' } }),
				]);
				card.append(outline, badge);
			}
			card.addEventListener('click', () => {
				// Closed first: changing the setting may open the panel again (a note).
				if (this.pickerShortcut) this.el.emit('close-request');
				setSetting(setting.name, option.value);
				if (!this.pickerShortcut) this.showList();
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

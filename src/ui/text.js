import { Text } from 'troika-three-text';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

export const FONTS = { normal: interRegular, bold: interBold };

/** Crisp SDF text (troika). Sizes are in meters. */
AFRAME.registerComponent('ui-text', {
	schema: {
		value: { type: 'string', default: '' },
		fontSize: { type: 'number', default: 0.04 },
		color: { type: 'color', default: '#ece8f1' },
		weight: { type: 'string', default: 'normal', oneOf: ['normal', 'bold'] },
		anchorX: { type: 'string', default: 'center' },
		anchorY: { type: 'string', default: 'middle' },
		align: { type: 'string', default: 'left' },
		maxWidth: { type: 'number', default: Infinity },
		lineHeight: { type: 'number', default: 1.2 },
		outlineWidth: { type: 'number', default: 0 },
		outlineColor: { type: 'color', default: '#000000' },
		opacity: { type: 'number', default: 1 },
		depthOffset: { type: 'number', default: -1 },
	},

	init() {
		this.text = new Text();
		this.el.setObject3D('text', this.text);
	},

	update() {
		const d = this.data;
		const text = this.text;
		text.text = d.value;
		text.font = FONTS[d.weight];
		text.fontSize = d.fontSize;
		text.color = d.color;
		text.anchorX = d.anchorX;
		text.anchorY = d.anchorY;
		text.textAlign = d.align;
		text.maxWidth = d.maxWidth;
		text.lineHeight = d.lineHeight;
		text.outlineWidth = d.outlineWidth;
		text.outlineColor = d.outlineColor;
		text.fillOpacity = d.opacity;
		text.outlineOpacity = d.opacity;
		// Draw in front of coplanar backgrounds without z-fighting.
		text.depthOffset = d.depthOffset;
		text.sync();
	},

	remove() {
		this.el.removeObject3D('text');
		this.text.dispose();
	},
});

/** Shortens a string to `max` characters with an ellipsis. */
export function truncate(value, max) {
	if (!value) return '';
	return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

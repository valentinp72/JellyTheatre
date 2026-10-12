// Temporary environment used until the theatre (roadmap step 3) exists:
// a dim room with a blank screen showing a welcome message.

AFRAME.registerComponent('placeholder-room', {
	schema: {
		message: { type: 'string', default: 'Welcome to JellyTheatre' },
	},

	init() {
		this.el.innerHTML = `
			<a-entity light="type: ambient; color: #6b5a7a; intensity: 0.6"></a-entity>
			<a-entity light="type: point; color: #ffffff; intensity: 2; distance: 20" position="0 4 -4"></a-entity>
			<a-plane rotation="-90 0 0" width="30" height="30" color="#1a1420"></a-plane>
			<a-plane class="screen" position="0 2.6 -6" width="6.4" height="3.6" color="#f2f0f5"
				material="shader: flat"></a-plane>
			<a-text class="message" position="0 2.6 -5.95" align="center" width="5" color="#1a1420"></a-text>
		`;
		this.message = this.el.querySelector('.message');
	},

	update() {
		this.message.setAttribute('value', this.data.message);
	},
});

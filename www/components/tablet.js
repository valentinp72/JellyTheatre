AFRAME.registerComponent('tablet', {
	schema: {
		screen: {type: 'selector'}
	},

	init: function () {
		this.screen = this.data.screen.components.screen;
		this.playpause = this.handle_playpause_button();
	},

	handle_playpause_button: function () {
		playpause = this.el.querySelector('#btn_playpause');
		playpause.onclick = () => {
			let isPlaying = this.screen.toggle();
			playpause.setAttribute('label', isPlaying ? "Pause" : "Play");
			playpause.setAttribute('color', isPlaying ? "red" : "green");
		};
		playpause.setAttribute('label', "Pause");
		playpause.setAttribute('color', "red");
		playpause.setAttribute('hoverColor', "yellow");
		return playpause;
	},

});


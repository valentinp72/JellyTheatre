
// AFRAME.registerComponent('screen', {
// 	schema: {
// 		width: {type: 'number', default: 1},
// 		height: {type: 'number', default: 1},
// 		// depth: {type: 'number', default: 1},
// 		// color: {type: 'color', default: '#AAA'}
// 	},

// 	init: function() {
// 		console.log("New screen created");
// 	}
// });

AFRAME.registerComponent('screen', {
	schema: {
		width: {type: 'number', default: 16},
		height: {type: 'number', default: 9},
		videoUrl: {type: 'string', default: ''},
		position: {type: 'vec3', default: {x: 0, y: 0, z: 0}}
	},

	init: function () {
		this.video = document.createElement('video');
		this.video.setAttribute('crossorigin', 'anonymous');
	    // this.video.setAttribute('muted', 'true'); // Required for autoplay in some browsers
		this.video.style.display = 'none'; // Hide the video element
		this.isPlaying = false;
		this.video.onplaying = function() {
			this.isPlaying = true;
		};
		this.video.onpause = function() {
			this.isPlaying = false;
		}

		this.hls = null;

		this.el.appendChild(this.video);
		this.resize();

		console.log("The screen has been created")
	},

	update: function () {
		if (this.data.videoUrl) {
			this.setVideoFeed(this.data.videoUrl);
		}
		this.resize();
	},

	setVideoFeed: function (url) {
		if (this.hls) {
			this.hls.destroy();
		}

		this.hls = new Hls();
		this.hls.loadSource(url);
		this.hls.attachMedia(this.video);
		this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
			this.video.play();
			this.el.setAttribute('material', 'src', this.video); // Set video as texture
		});
	},

	play: function () {
		this.video.play();
	},

	pause: function () {
		this.video.pause();
	},

	toggle: function () {
		if (this.isPlaying) {
			this.pause();
			return false;
		}
		else {
			this.play();
			return true;
		}
	},

	resize: function () {
		const aspectRatio = this.data.width / this.data.height;
		this.el.setAttribute('geometry', {
			primitive: 'plane',
			width: this.data.width,
			height: this.data.height
		});
		this.el.setAttribute('position', this.data.position);
		this.video.width = this.data.width;
		this.video.height = this.data.height;
	},

	remove: function () {
		if (this.hls) {
			this.hls.destroy();
		}
		this.video.pause();
		this.el.removeChild(this.video);
	}
});

// Builds the Jellyfin DeviceProfile from what this browser can actually decode.
//
// The server is weak, so the goal is to avoid video transcoding at all costs:
// - every container/codec the browser plays natively is declared for direct play;
// - the HLS (fMP4) transcoding profile lists every supported video codec, so a
//   file whose only problem is its container (typically H.264/HEVC in MKV) is
//   remuxed with the video stream copied, not re-encoded;
// - unsupported audio (DTS, TrueHD…) only triggers an audio transcode;
// - text subtitles are delivered externally as WebVTT and never burned in.

const MBPS = 1_000_000;

let cached = null;

const video = document.createElement('video');

function mse(type) {
	return window.MediaSource?.isTypeSupported(type) === true;
}

function canPlay(type) {
	return video.canPlayType(type) !== '' || mse(type);
}

function detectVideoCodecs() {
	return {
		h264: canPlay('video/mp4; codecs="avc1.640033"'),
		hevc: canPlay('video/mp4; codecs="hvc1.1.6.L153.B0"') || canPlay('video/mp4; codecs="hev1.1.6.L153.B0"'),
		hevc10: canPlay('video/mp4; codecs="hvc1.2.4.L153.B0"'),
		av1: canPlay('video/mp4; codecs="av01.0.12M.08"'),
		av1_10: canPlay('video/mp4; codecs="av01.0.12M.10"'),
		vp9: canPlay('video/webm; codecs="vp9"') || canPlay('video/webm; codecs="vp09.00.51.08"'),
		vp8: canPlay('video/webm; codecs="vp8"'),
	};
}

function detectAudioCodecs() {
	return {
		aac: canPlay('audio/mp4; codecs="mp4a.40.2"'),
		mp3: canPlay('audio/mpeg') || canPlay('audio/mp4; codecs="mp3"'),
		opus: canPlay('audio/webm; codecs="opus"') || canPlay('audio/mp4; codecs="opus"'),
		vorbis: canPlay('audio/webm; codecs="vorbis"'),
		flac: canPlay('audio/mp4; codecs="flac"') || canPlay('audio/flac'),
		ac3: canPlay('audio/mp4; codecs="ac-3"'),
		eac3: canPlay('audio/mp4; codecs="ec-3"'),
		alac: canPlay('audio/mp4; codecs="alac"'),
	};
}

function enabled(map) {
	return Object.entries(map).filter(([, ok]) => ok).map(([name]) => name);
}

/** What the browser supports, for diagnostics and the device profile. */
export function getCapabilities() {
	if (cached) return cached;
	const videoCodecs = detectVideoCodecs();
	const audioCodecs = detectAudioCodecs();
	cached = {
		videoCodecs,
		audioCodecs,
		mkv: video.canPlayType('video/x-matroska') !== '' || mse('video/x-matroska; codecs="avc1.640033"'),
		hls: window.MediaSource !== undefined || video.canPlayType('application/vnd.apple.mpegurl') !== '',
	};
	return cached;
}

/** @returns {import('@jellyfin/sdk/lib/generated-client/models').DeviceProfile} */
export function buildDeviceProfile() {
	const caps = getCapabilities();
	const v = caps.videoCodecs;
	const a = caps.audioCodecs;

	const mp4Video = enabled({ h264: v.h264, hevc: v.hevc, av1: v.av1, vp9: v.vp9 });
	const mp4Audio = enabled({ aac: a.aac, mp3: a.mp3, opus: a.opus, flac: a.flac, ac3: a.ac3, eac3: a.eac3, alac: a.alac });
	const webmVideo = enabled({ vp8: v.vp8, vp9: v.vp9, av1: v.av1 });
	const webmAudio = enabled({ vorbis: a.vorbis, opus: a.opus });

	const directPlay = [
		{ Container: 'mp4,m4v,mov', Type: 'Video', VideoCodec: mp4Video.join(','), AudioCodec: mp4Audio.join(',') },
		{ Container: 'webm', Type: 'Video', VideoCodec: webmVideo.join(','), AudioCodec: webmAudio.join(',') },
	];
	if (caps.mkv) {
		directPlay.push({
			Container: 'mkv',
			Type: 'Video',
			VideoCodec: [...new Set([...mp4Video, ...webmVideo])].join(','),
			AudioCodec: [...new Set([...mp4Audio, ...webmAudio])].join(','),
		});
	}

	// Video codecs that can be copied into HLS fMP4. H.264 first: if a real
	// transcode is unavoidable, it is the cheapest codec for the server to encode.
	const hlsVideo = enabled({ h264: v.h264, hevc: v.hevc, av1: v.av1 });
	// AAC first: target codec when the source audio is unsupported.
	const hlsAudio = enabled({ aac: a.aac, mp3: a.mp3, opus: a.opus, flac: a.flac, ac3: a.ac3, eac3: a.eac3, alac: a.alac });

	const codecProfiles = [];
	if (v.hevc && !v.hevc10) {
		codecProfiles.push({
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }],
		});
	}
	if (v.av1 && !v.av1_10) {
		codecProfiles.push({
			Type: 'Video',
			Codec: 'av1',
			Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }],
		});
	}

	return {
		Name: 'JellyTheatre',
		// Generous limits: bitrate must never be the reason for a transcode.
		MaxStreamingBitrate: 200 * MBPS,
		MaxStaticBitrate: 200 * MBPS,
		MusicStreamingTranscodingBitrate: 384_000,
		DirectPlayProfiles: directPlay,
		TranscodingProfiles: [
			{
				Container: 'mp4',
				Type: 'Video',
				Protocol: 'hls',
				Context: 'Streaming',
				VideoCodec: hlsVideo.join(','),
				AudioCodec: hlsAudio.join(','),
				MaxAudioChannels: '6',
				MinSegments: 1,
				BreakOnNonKeyFrames: true,
			},
		],
		ContainerProfiles: [],
		CodecProfiles: codecProfiles,
		SubtitleProfiles: [
			// Text subtitles are converted to WebVTT by the server (cheap) and rendered by us.
			{ Format: 'vtt', Method: 'External' },
			// Image subtitles (pgssub, dvdsub…) are deliberately not listed: they would
			// force a burn-in, i.e. a full video transcode.
		],
	};
}

// Builds the Jellyfin DeviceProfile from what this browser can actually decode.
//
// The server is weak, so the goal is to avoid video transcoding at all costs:
// - every container/codec the browser plays natively is declared for direct play;
// - the HLS (fMP4) transcoding profile lists every supported video codec, so a
//   file whose only problem is its container (typically H.264/HEVC in MKV) is
//   remuxed with the video stream copied, not re-encoded;
// - unsupported audio (DTS, TrueHD…) only triggers an audio transcode;
// - subtitles are never burned in: text ones are delivered as WebVTT, PGS
//   (Blu-ray) image ones as-is and rendered by the app (libpgs).

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
			// PGS image subtitles are sent as-is and rendered by libpgs.
			{ Format: 'pgssub', Method: 'External' },
			// Other image subtitles (dvdsub…) are deliberately not listed: they would
			// force a burn-in, i.e. a full video transcode.
		],
	};
}

const VIDEO_CODECS = { h264: 'h264', avc: 'h264', hevc: 'hevc', h265: 'hevc', av1: 'av1', vp9: 'vp9', vp8: 'vp8' };
const AUDIO_CODECS = { aac: 'aac', mp3: 'mp3', opus: 'opus', vorbis: 'vorbis', flac: 'flac', ac3: 'ac3', eac3: 'eac3', alac: 'alac' };

function defaultStream(mediaSource, type, defaultIndex) {
	const streams = (mediaSource?.MediaStreams ?? []).filter((stream) => stream.Type === type);
	return streams.find((stream) => stream.Index === defaultIndex) ?? streams.find((stream) => stream.IsDefault) ?? streams[0];
}

/**
 * Estimates, without asking the server, how a media source would play here:
 * 'direct' (file as-is), 'remux' (video copied; container and/or audio
 * converted) or 'transcode' (video re-encoded). The details page asks the
 * server for the exact decision.
 * @returns {{ mode: 'direct' | 'remux' | 'transcode', reasons: string[] } | null}
 */
export function estimatePlayback(mediaSource) {
	const video = defaultStream(mediaSource, 'Video');
	if (!video) return null;
	const caps = getCapabilities();
	const reasons = [];

	const videoCodec = VIDEO_CODECS[video.Codec?.toLowerCase()];
	const tenBit = (video.BitDepth ?? 8) > 8;
	const videoOk = videoCodec !== undefined && caps.videoCodecs[videoCodec]
		&& !(tenBit && videoCodec === 'hevc' && !caps.videoCodecs.hevc10)
		&& !(tenBit && videoCodec === 'av1' && !caps.videoCodecs.av1_10)
		&& !(tenBit && videoCodec === 'h264');
	if (!videoOk) return { mode: 'transcode', reasons: [`${video.Codec?.toUpperCase() ?? 'video'}${tenBit ? ' 10-bit' : ''} video`] };

	const audio = defaultStream(mediaSource, 'Audio', mediaSource.DefaultAudioStreamIndex);
	const audioCodec = AUDIO_CODECS[audio?.Codec?.toLowerCase()];
	if (audio && !(audioCodec && caps.audioCodecs[audioCodec])) reasons.push(`${audio.Codec?.toUpperCase()} audio`);

	const containers = (mediaSource.Container ?? '').toLowerCase().split(',');
	const containerOk = containers.some((c) => ['mp4', 'm4v', 'mov', 'webm'].includes(c) || (c === 'mkv' && caps.mkv));
	if (!containerOk) reasons.push(`${containers[0].toUpperCase() || 'unknown'} container`);

	return { mode: reasons.length ? 'remux' : 'direct', reasons };
}

const HDR_LABELS = { HDR10: 'HDR10', HDR10Plus: 'HDR10+', HLG: 'HLG', DOVI: 'Dolby Vision', DOVIWithHDR10: 'Dolby Vision', DOVIWithHLG: 'Dolby Vision', DOVIWithSDR: 'Dolby Vision' };
const AUDIO_NAMES = { aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', ac3: 'Dolby Digital', eac3: 'Dolby Digital+', truehd: 'TrueHD', dts: 'DTS', alac: 'ALAC' };

function resolutionLabel(width, height) {
	if (!width) return '';
	if (width >= 3800 || height >= 2100) return '4K';
	if (width >= 2500 || height >= 1400) return '1440p';
	if (width >= 1900 || height >= 1000) return '1080p';
	if (width >= 1260 || height >= 700) return '720p';
	return 'SD';
}

function channelsLabel(channels) {
	if (!channels) return '';
	if (channels === 1) return 'mono';
	if (channels === 2) return 'stereo';
	return `${channels - 1}.1`;
}

/** Human-readable quality of a media source (for badges and the details page). */
export function describeMedia(mediaSource) {
	const video = defaultStream(mediaSource, 'Video');
	if (!video) return null;
	const audio = defaultStream(mediaSource, 'Audio', mediaSource.DefaultAudioStreamIndex);
	const audioCount = (mediaSource.MediaStreams ?? []).filter((s) => s.Type === 'Audio').length;
	const subtitles = (mediaSource.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle');
	const resolution = resolutionLabel(video.Width, video.Height);
	const hdr = HDR_LABELS[video.VideoRangeType] ?? null;
	const bitrate = mediaSource.Bitrate ?? video.BitRate;
	const audioName = audio ? AUDIO_NAMES[audio.Codec?.toLowerCase()] ?? audio.Codec?.toUpperCase() : '';
	return {
		badge: [resolution, hdr && (hdr.startsWith('Dolby') ? 'DV' : 'HDR')].filter(Boolean).join(' '),
		video: [
			resolution,
			video.Codec?.toUpperCase(),
			(video.BitDepth ?? 8) > 8 ? `${video.BitDepth}-bit` : '',
			hdr,
			bitrate ? `${Math.round(bitrate / 1_000_000)} Mbps` : '',
		].filter(Boolean).join(' · '),
		audio: audio ? [
			audio.Language?.toUpperCase(),
			audioName,
			channelsLabel(audio.Channels),
			audioCount > 1 ? `(+${audioCount - 1} more)` : '',
		].filter(Boolean).join(' · ') : 'No audio',
		subtitles: subtitles.length
			? `${subtitles.filter((s) => s.IsTextSubtitleStream).length} text, ${subtitles.filter((s) => !s.IsTextSubtitleStream).length} image`
			: 'None',
	};
}

/** Readable text for Jellyfin's TranscodeReasons values. */
export function describeTranscodeReason(reason) {
	const known = {
		ContainerNotSupported: 'container not supported',
		AudioCodecNotSupported: 'audio codec not supported',
		VideoCodecNotSupported: 'video codec not supported',
		VideoBitDepthNotSupported: 'video bit depth not supported',
		VideoRangeTypeNotSupported: 'HDR format not supported',
		SubtitleCodecNotSupported: 'subtitles would be burned in',
		ContainerBitrateExceedsLimit: 'bitrate above the limit',
		VideoBitrateNotSupported: 'video bitrate above the limit',
		AudioChannelsNotSupported: 'too many audio channels',
	};
	return known[reason] ?? reason.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

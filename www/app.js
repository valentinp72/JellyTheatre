import { Jellyfin } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0?min";
import { getSystemApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/system-api";
import { getUserApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/user-api";
import { getQuickConnectApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/quick-connect-api";
import { getLibraryApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/library-api";
import { getMoviesApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/movies-api";
import { getVideosApi } from "https://cdn.skypack.dev/@jellyfin/sdk@0.10.0/lib/utils/api/videos-api";
import { v4 as uuidv4 } from "https://cdn.skypack.dev/uuid@8.3.2";

// import { SERVER_URL, ACCESS_TOKEN } from "./secrets.js"

function getCookie(name) {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop().split(';').shift();
}

const SERVER_URL = getCookie("serverUrl");
const ACCESS_TOKEN = getCookie("accessToken");

if (!SERVER_URL || !ACCESS_TOKEN) {
	alert("Please go to cookies.html to setup the cookies." + SERVER_URL + ACCESS_TOKEN)
}

const jellyfin = new Jellyfin({
    clientInfo: {
        name: 'JellyTheatre VR',
        version: '1.0.0'
    },
    deviceInfo: {
        name: window.navigator.appName,
        id: uuidv4()
    }
});

const api = jellyfin.createApi(SERVER_URL, ACCESS_TOKEN);
const recommendations = await getMoviesApi(api).getMovieRecommendations();

console.log(recommendations);
const movie_to_watch = recommendations.data[0].Items[0];
// const movie_id = movie_to_watch.Id;
const movie_id = "b75057c763cbd73a44725e8bb8d88514";
console.log(movie_to_watch);
console.log(movie_id);

const text = document.getElementById('text-element');
text.setAttribute('value', movie_id);


const video = document.getElementById('video-player');
var videoSrc = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
if (Hls.isSupported()) {
	console.warning("HLS supported!");
	var hls = new Hls();
	hls.loadSource(videoSrc);
	hls.attachMedia(video);
}
else {
	console.error("HLS not supported!");
}

// const player = document.getElementById('video-player');
// const target_url = SERVER_URL + "/Videos/" + movie_id + "/stream.mp4"; //"";
// console.log(target_url);
// player.setAttribute('src', full_URL);
// const stream = await getVideosApi(api).headVideoStream({'itemId': movie_id});
// console.log(stream);

// const info = await getSystemApi(api).getPublicSystemInfo();
// console.log('Info =>', info.data);

// const users = await getUserApi(api).getPublicUsers();
// console.log('Users =>', users.data);
// const user = await getUserApi(api).getCurrentUser()

// const auth = await getQuickConnectApi(api).initiateQuickConnect(api);
// const auth = await api.authenticateUserByName('valentin', 'Abe?EP6kGX8pyNJ$NV83');
// const auth = await getUserApi(api).authenticateWithQuickConnect();
// console.log('Auth =>', auth.data);

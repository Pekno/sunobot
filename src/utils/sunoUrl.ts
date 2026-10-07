const SONG_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SONG_ID_REGEX = new RegExp(`^${SONG_ID}$`, 'i');
const SONG_PATH_REGEX = new RegExp(`^/(?:song|embed)/(${SONG_ID})`, 'i');
const SHARE_PATH_REGEX = /^\/s\/[a-z0-9_-]+/i;
const SUNO_HOST_REGEX = /(^|\.)suno\.(com|ai)$/i;
const PROFILE_URL_REGEX = /suno\.(?:com|ai)\/@([^/?#\s]+)/i;

export type SunoSongReference =
	| { type: 'id'; id: string }
	// Short share links (suno.com/s/<code>) don't carry the song id, they only redirect to the song page
	| { type: 'share'; url: string };

const toUrl = (value: string): URL | null => {
	try {
		return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
	} catch {
		return null;
	}
};

/**
 * Accepts a bare song id, a song/embed page (suno.com or legacy app.suno.ai) or a short share link.
 */
export const parseSunoSongUrl = (input: string): SunoSongReference | null => {
	const value = input.trim();
	if (SONG_ID_REGEX.test(value)) return { type: 'id', id: value.toLowerCase() };

	const url = toUrl(value);
	if (!url || !SUNO_HOST_REGEX.test(url.hostname)) return null;

	const songMatch = url.pathname.match(SONG_PATH_REGEX);
	if (songMatch) return { type: 'id', id: songMatch[1].toLowerCase() };

	if (SHARE_PATH_REGEX.test(url.pathname))
		return { type: 'share', url: `${url.origin}${url.pathname}` };

	return null;
};

/**
 * Accepts a handle, an @handle or a profile URL (suno.com/@handle).
 */
export const parseSunoProfileHandle = (input: string): string => {
	const value = input.trim();
	const match = value.match(PROFILE_URL_REGEX);
	return (match ? match[1] : value.replace(/^@/, '')).toLowerCase();
};

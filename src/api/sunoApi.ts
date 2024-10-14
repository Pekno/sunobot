import axios, { AxiosInstance } from 'axios';
import UserAgent from 'user-agents';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { SunoClip } from '../model/SunoClip';
import { Logger } from '../services/PinoLogger';
import { SunoData } from '../model/SunoData';
import { SunoProfile } from '../model/SunoProfile';
import { SunoSession } from '../model/SunoSession';
import { SunoPlaylist } from '../model/SunoPlaylist';
import { LocaleError } from '../model/LocalError';

export const DEFAULT_MODEL = 'chirp-v3-5';

// Made by https://github.com/gcui-art
// All credits goes to him and the contributers of https://github.com/gcui-art/suno-api

const sleep = (x: number, y?: number): Promise<void> => {
	let timeout = x * 1000;
	if (y !== undefined && y !== x) {
		const min = Math.min(x, y);
		const max = Math.max(x, y);
		timeout = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
	}
	Logger.info(`Sleeping for ${timeout / 1000} seconds`);

	return new Promise((resolve) => setTimeout(resolve, timeout));
};

export class SunoApi {
	private static BASE_URL: string = 'https://studio-api.suno.ai';
	private static CLERK_BASE_URL: string = 'https://clerk.suno.com';

	private readonly client: AxiosInstance;
	private sid?: string;
	private currentToken?: string;
	private currentSession?: SunoSession;

	public cookieName: string;
	public credit_left: number;
	public lastUsed: number;

	constructor(cookie: string, cookieName: string) {
		this.cookieName = cookieName;
		this.credit_left = 0;
		this.lastUsed = Date.now();
		const cookieJar = new CookieJar();
		const randomUserAgent = new UserAgent(/Chrome/).random().toString();
		this.client = wrapper(
			axios.create({
				jar: cookieJar,
				withCredentials: true,
				headers: {
					'User-Agent': randomUserAgent,
					Cookie: cookie,
				},
			})
		);
		this.client.interceptors.request.use((config) => {
			if (this.currentToken) {
				// Use the current token status
				config.headers['Authorization'] = `Bearer ${this.currentToken}`;
			}
			return config;
		});
	}

	public async init(): Promise<SunoApi> {
		await this.getAuthToken();
		await this.keepAlive();
		this.currentSession = await this.self();
		this.credit_left = await (await this.get_credits()).credits_left;
		Logger.info(
			`SunoAPI [${this.cookieName}] : LOGGED IN AS "${this.currentSession.user.display_name}", PRO ACCOUNT : ${this.currentSession.roles.pro}, REMAINING CREDITS : ${this.credit_left}`
		);

		return this;
	}

	/**
	 * Get the session ID and save it for later use.
	 */
	private async getAuthToken() {
		// URL to get session ID
		const getSessionUrl = `${SunoApi.CLERK_BASE_URL}/v1/client?_clerk_js_version=4.73.4`;
		// Get session ID
		const sessionResponse = await this.client.get(getSessionUrl);
		if (!sessionResponse?.data?.response?.['last_active_session_id']) {
			throw new LocaleError('error.suno.expired_session');
		}
		// Save session ID for later use
		this.sid = sessionResponse.data.response['last_active_session_id'];
	}

	/**
	 * Keep the session alive.
	 * @param isWait Indicates if the method should wait for the session to be fully renewed before returning.
	 */
	public async keepAlive(isWait?: boolean): Promise<void> {
		if (!this.sid) {
			throw new LocaleError('error.suno.no_session');
		}
		// URL to renew session token
		const renewUrl = `${SunoApi.CLERK_BASE_URL}/v1/client/sessions/${this.sid}/tokens?_clerk_js_version==4.73.4`;
		// Renew session token
		const renewResponse = await this.client.post(renewUrl);
		Logger.info(`SunoAPI [${this.cookieName}] : KEEP ALIVE...`);
		if (isWait) {
			await sleep(1, 2);
		}
		const newToken = renewResponse.data['jwt'];
		// Update Authorization field in request header with the new JWT token
		this.currentToken = newToken;
		this.lastUsed = Date.now();
	}

	/**
	 * Generate a song based on the prompt.
	 * @param prompt The text prompt to generate audio from.
	 * @param make_instrumental Indicates if the generated audio should be instrumental.
	 * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
	 * @returns
	 */
	public async generate(
		prompt: string,
		make_instrumental: boolean = false,
		model?: string,
		wait_audio: boolean = false
	): Promise<SunoData> {
		await this.keepAlive(false);
		const startTime = Date.now();
		const audios = this.generateSongs(
			prompt,
			false,
			undefined,
			undefined,
			make_instrumental,
			model,
			wait_audio
		);
		const costTime = Date.now() - startTime;
		Logger.info(
			`SunoAPI [${this.cookieName}] : Generate Response:\n` +
				JSON.stringify(audios, null, 2)
		);
		Logger.info(`SunoAPI [${this.cookieName}] : Cost time: ${costTime}`);
		return audios;
	}

	/**
	 * Calls the concatenate endpoint for a clip to generate the whole song.
	 * @param clip_id The ID of the audio clip to concatenate.
	 * @returns A promise that resolves to an SunoClip object representing the concatenated audio.
	 * @throws Error if the response status is not 200.
	 */
	public async concatenate(clip_id: string): Promise<SunoClip> {
		await this.keepAlive(false);
		const payload: any = { clip_id: clip_id };

		const response = await this.client.post(
			`${SunoApi.BASE_URL}/api/generate/concat/v2/`,
			payload,
			{
				timeout: 10000, // 10 seconds timeout
			}
		);
		if (response.status !== 200) {
			throw new LocaleError('error._default', { message: response.statusText });
		}
		return response.data;
	}

	/**
	 * Generates custom audio based on provided parameters.
	 *
	 * @param prompt The text prompt to generate audio from.
	 * @param tags Tags to categorize the generated audio.
	 * @param title The title for the generated audio.
	 * @param make_instrumental Indicates if the generated audio should be instrumental.
	 * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
	 * @returns A promise that resolves to an array of SunoClip objects representing the generated audios.
	 */
	public async custom_generate(
		wait_audio: boolean = false,
		prompt: string,
		tags: string,
		title: string,
		make_instrumental: boolean = false,
		model?: string
	): Promise<SunoData> {
		const startTime = Date.now();
		const audios = await this.generateSongs(
			prompt,
			true,
			tags,
			title,
			make_instrumental,
			model,
			wait_audio
		);
		const costTime = Date.now() - startTime;
		Logger.info(
			`SunoAPI [${this.cookieName}] : Custom Generate Response:\n` +
				JSON.stringify(audios, null, 2)
		);
		Logger.info(`SunoAPI [${this.cookieName}] : Cost time: ${costTime}`);
		return audios;
	}

	/**
	 * Generates songs based on the provided parameters.
	 *
	 * @param prompt The text prompt to generate songs from.
	 * @param isCustom Indicates if the generation should consider custom parameters like tags and title.
	 * @param tags Optional tags to categorize the song, used only if isCustom is true.
	 * @param title Optional title for the song, used only if isCustom is true.
	 * @param make_instrumental Indicates if the generated song should be instrumental.
	 * @param wait_audio Indicates if the method should wait for the audio file to be fully generated before returning.
	 * @returns A promise that resolves to an array of SunoClip objects representing the generated songs.
	 */
	private async generateSongs(
		prompt: string,
		isCustom: boolean,
		tags?: string,
		title?: string,
		make_instrumental?: boolean,
		model?: string,
		wait_audio: boolean = false
	): Promise<SunoData> {
		await this.keepAlive(false);
		const payload: any = {
			make_instrumental: make_instrumental == true,
			mv: model || this.currentSession?.models[0].external_key || DEFAULT_MODEL,
			prompt: '',
		};
		if (isCustom) {
			payload.tags = tags;
			payload.title = title;
			payload.prompt = prompt;
		} else {
			payload.gpt_description_prompt = prompt;
		}
		this.credit_left = (await (await this.get_credits()).credits_left) - 10;
		const response = await this.client.post(
			`${SunoApi.BASE_URL}/api/generate/v2/`,
			payload,
			{
				timeout: 10000, // 10 seconds timeout
			}
		);
		Logger.info(
			`SunoAPI [${this.cookieName}] : GenerateSongs Response:\n` +
				JSON.stringify(response.data, null, 2)
		);
		if (response.status !== 200) {
			throw new LocaleError('error._default', { message: response.statusText });
		}
		const sunoData = response.data as SunoData;
		const songIds = sunoData.clips.map((audio: SunoClip) => audio.id);
		//Want to wait for music file generation
		if (wait_audio) {
			const startTime = Date.now();
			let lastResponse: SunoClip[] = [];
			await sleep(5, 5);
			while (Date.now() - startTime < 100000) {
				const response = await this.get(songIds);
				if (response.every((audio) => audio.status === 'error')) {
					throw new LocaleError('error.suno.something_wrong');
				}
				if (
					response.every(
						(audio) =>
							audio.status === 'streaming' || audio.status === 'complete'
					)
				) {
					sunoData.clips = response;
					return sunoData;
				}
				lastResponse = response;
				await sleep(3, 6);
				await this.keepAlive(true);
			}
			sunoData.clips = lastResponse;
			return sunoData;
		} else {
			await this.keepAlive(true);
			return sunoData;
		}
	}

	/**
	 * Generates lyrics based on a given prompt.
	 * @param prompt The prompt for generating lyrics.
	 * @returns The generated lyrics text.
	 */
	public async generateLyrics(prompt: string): Promise<string> {
		await this.keepAlive(false);
		// Initiate lyrics generation
		const generateResponse = await this.client.post(
			`${SunoApi.BASE_URL}/api/generate/lyrics/`,
			{ prompt }
		);
		const generateId = generateResponse.data.id;

		// Poll for lyrics completion
		let lyricsResponse = await this.client.get(
			`${SunoApi.BASE_URL}/api/generate/lyrics/${generateId}`
		);
		while (lyricsResponse?.data?.status !== 'complete') {
			await sleep(2); // Wait for 2 seconds before polling again
			lyricsResponse = await this.client.get(
				`${SunoApi.BASE_URL}/api/generate/lyrics/${generateId}`
			);
		}

		// Return the generated lyrics text
		return lyricsResponse.data;
	}

	/**
	 * Extends an existing audio clip by generating additional content based on the provided prompt.
	 *
	 * @param audioId The ID of the audio clip to extend.
	 * @param prompt The prompt for generating additional content.
	 * @param continueAt Extend a new clip from a song at mm:ss(e.g. 00:30). Default extends from the end of the song.
	 * @param tags Style of Music.
	 * @param title Title of the song.
	 * @returns A promise that resolves to an SunoClip object representing the extended audio clip.
	 */
	public async extendAudio(
		audioId: string,
		prompt: string = '',
		continueAt: string = '0',
		tags: string = '',
		title: string = '',
		model?: string
	): Promise<SunoClip> {
		const response = await this.client.post(
			`${SunoApi.BASE_URL}/api/generate/v2/`,
			{
				continue_clip_id: audioId,
				continue_at: continueAt,
				mv:
					model || this.currentSession?.models[0].external_key || DEFAULT_MODEL,
				prompt: prompt,
				tags: tags,
				title: title,
			}
		);
		return response.data;
	}

	/**
	 * Retrieves audio information for the given song IDs.
	 * @param songIds An optional array of song IDs to retrieve information for.
	 * @returns A promise that resolves to an array of SunoClip objects.
	 */
	public async get(songIds?: string[]): Promise<SunoClip[]> {
		await this.keepAlive(false);
		let url = `${SunoApi.BASE_URL}/api/feed/`;
		if (songIds) {
			url = `${url}?ids=${songIds.join(',')}`;
		}
		Logger.info(`SunoAPI [${this.cookieName}] : Get audio status: ` + url);
		const response = await this.client.get(url, {
			// 3 seconds timeout
			timeout: 3000,
		});

		return response.data.map((audio: any) => new SunoClip(audio));
	}

	public async self(): Promise<SunoSession> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/session/`;
		Logger.info(`SunoAPI [${this.cookieName}] : Get Session info : ` + url);
		const response = await this.client.get(url, {
			// 3 seconds timeout
			timeout: 3000,
		});

		return response.data as SunoSession;
	}

	/**
	 * Change the visibility of a given song ID.
	 * @param songId An song ID to change visibility to.
	 * @param isPublic An boolean to change if the song is made public to.
	 * @returns A promise that resolves to a boolean of the public status.
	 */
	public async setClipVisibility(
		sunoClip: SunoClip,
		isPublic: boolean
	): Promise<boolean> {
		if (this.currentSession?.user.id !== sunoClip.user_id)
			throw new LocaleError('error.suno.no_right', {
				right: 'visibility',
			});
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/gen/${sunoClip.id}/set_visibility/`;
		Logger.info(`SunoAPI [${this.cookieName}] : Set Clip visibility : ` + url);
		const response = await this.client.post(url, {
			is_public: isPublic,
		});

		return response.data.is_public;
	}

	/**
	 * Retrieves audio information for the given song IDs.
	 * @param songIds An optional array of song IDs to retrieve information for.
	 * @returns A promise that resolves to an array of SunoClip objects.
	 */
	public async profile(profileName: string): Promise<SunoProfile> {
		await this.keepAlive(false);
		const profiles = (
			await this.fetchPaginatedData<SunoProfile>(
				`${SunoApi.BASE_URL}/api/profiles/${profileName}`,
				(data: any) => [new SunoProfile(data)],
				'num_total_clips',
				`playlists_sort_by=upvote_count&clips_sort_by=created_at`
			)
		).flat();

		return profiles.slice(1).reduce((acc, curr) => {
			acc.clips.push(...curr.clips);
			return acc;
		}, profiles[0]);
	}

	public async incrementPlayCount(sunoClip: SunoClip): Promise<void> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/gen/${sunoClip.id}/increment_play_count/v2`;
		Logger.info(`SunoAPI [${this.cookieName}] : Increment Clip Views : ` + url);
		await this.client.post(url, {
			sample_factor: 1,
		});
	}

	/**
	 * Retrieves audio information for the current user.
	 * @returns A promise that resolves to an array of SunoClip objects.
	 */
	public async getAll(): Promise<SunoClip[]> {
		await this.keepAlive(false);
		return this.fetchPaginatedData<SunoClip>(
			`${SunoApi.BASE_URL}/api/feed/v2`,
			(data: any) => data.clips.map((clip: any) => new SunoClip(clip)),
			'num_total_results'
		);
	}

	public async getSelfPlaylists(
		namePredicate?: (playlist: SunoPlaylist) => boolean,
		showTrashed: boolean = false
	): Promise<SunoPlaylist[]> {
		await this.keepAlive(false);
		const playlists = await this.fetchPaginatedData<SunoPlaylist>(
			`${SunoApi.BASE_URL}/api/playlist/me?page=1&`,
			(data: any) =>
				data.playlists.map((playlist: any) => new SunoPlaylist(playlist)),
			'num_total_results',
			`show_trashed=${showTrashed}`
		);

		// Apply filtering if a predicate is provided
		return namePredicate ? playlists.filter(namePredicate) : playlists;
	}

	public async createPlaylist(
		playlistName: string = 'Untitled'
	): Promise<SunoPlaylist> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/playlist/create/`;
		Logger.info(`SunoAPI [${this.cookieName}] : Create Playlist : ` + url);
		const response = await this.client.post(url, {
			name: playlistName,
		});
		return response.data as SunoPlaylist;
	}

	public async trashActionPlaylist(sunoPlaylist: SunoPlaylist) {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/playlist/trash/`;
		Logger.info(
			`SunoAPI [${this.cookieName}] : ${sunoPlaylist.is_trashed ? 'Restore' : 'Trash'} Playlist : ${url}`
		);
		const response = await this.client.post(url, {
			playlist_id: sunoPlaylist.id,
			undo_trash: !sunoPlaylist.is_trashed,
		});
		return response.data;
	}

	public async editPlaylist(
		sunoPlaylist: SunoPlaylist,
		infos: { name: string; description: string; image_url: string }
	) {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/playlist/set_metadata/`;
		Logger.info(`SunoAPI [${this.cookieName}] : Edit Playlist : ` + url);
		const response = await this.client.post(url, {
			playlist_id: sunoPlaylist.id,
			name: infos.name,
			description: infos.description,
			image_url: infos.image_url,
		});
		return response.data;
	}

	public async setPlaylistVisibility(
		sunoPlaylist: SunoPlaylist,
		isPublic: boolean
	): Promise<boolean> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/playlist_reaction/${sunoPlaylist.id}/set_visibility/`;
		Logger.info(
			`SunoAPI [${this.cookieName}] : Set Playlist visibility : ` + url
		);
		const response = await this.client.post(url, {
			is_public: isPublic,
		});

		return response.data.is_public;
	}

	private async actionOnPlaylist(
		action: 'add' | 'remove',
		sunoPlaylist: SunoPlaylist,
		sunoClips: SunoClip[]
	) {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/playlist/update_clips/`;
		Logger.info(
			`SunoAPI [${this.cookieName}] : ${action.toUpperCase()} to Playlist : ` +
				url
		);
		const response = await this.client.post(url, {
			playlist_id: sunoPlaylist.id,
			update_type: action,
			metadata: {
				clip_ids: sunoClips.map((s) => s.id),
			},
		});
		return response.data;
	}

	public async addToPlaylist(
		sunoPlaylist: SunoPlaylist,
		sunoClips: SunoClip[]
	) {
		return await this.actionOnPlaylist('add', sunoPlaylist, sunoClips);
	}

	public async removeFromPlaylist(
		sunoPlaylist: SunoPlaylist,
		sunoClips: SunoClip[]
	) {
		return await this.actionOnPlaylist('remove', sunoPlaylist, sunoClips);
	}

	/**
	 * Retrieves information for a specific audio clip.
	 * @param clipId The ID of the audio clip to retrieve information for.
	 * @returns A promise that resolves to an object containing the audio clip information.
	 */
	public async getClip(clipId: string): Promise<SunoClip> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/clip/${clipId}`;
		Logger.info(`SunoAPI [${this.cookieName}] : Get Clip : ` + url);
		const response = await this.client.get(url);
		return new SunoClip(response.data);
	}

	public async get_credits(): Promise<{
		credits_left: number;
		period: number;
		monthly_limit: number;
		monthly_usage: number;
	}> {
		await this.keepAlive(false);
		const url = `${SunoApi.BASE_URL}/api/billing/info/`;
		Logger.info(`SunoAPI [${this.cookieName}] : Get Credit info : ` + url);
		const response = await this.client.get(url);
		return {
			credits_left: response.data.total_credits_left,
			period: response.data.period,
			monthly_limit: response.data.monthly_limit,
			monthly_usage: response.data.monthly_usage,
		};
	}

	public static create = async (
		cookie: string | undefined,
		cookieName: string
	) => {
		if (!cookie) throw new LocaleError('error.suno.no_cookie');
		const sunoApi = new SunoApi(cookie, cookieName);
		return await sunoApi.init();
	};

	private async fetchPaginatedData<T>(
		initialUrl: string,
		extractItems: (data: any) => T[],
		totalItemsKey: string,
		queryParam?: string,
		itemsPerPage: number = 20
	): Promise<T[]> {
		const allItems: T[] = [];
		let totalItems = 0;
		let totalPages = 0;

		const baseUrl = `${initialUrl}?page={X}&${queryParam}`;

		// Fetch the first page to determine total items and pages
		Logger.info(`SunoAPI [${this.cookieName}] : Fetching from: ${initialUrl}`);
		const initialResponse = await this.client.get(
			baseUrl.replace('{X}', `${1}`),
			{
				timeout: 3000,
			}
		);

		// Extract items and total count from the first page
		const initialData = initialResponse.data;
		allItems.push(...extractItems(initialData));
		totalItems = initialData[totalItemsKey];
		totalPages = Math.ceil(totalItems / itemsPerPage);

		// Fetch remaining pages
		for (let currentPage = 2; currentPage <= totalPages; currentPage++) {
			const url = baseUrl.replace('{X}', `${currentPage}`);
			Logger.info(`SunoAPI [${this.cookieName}] : Fetching from: ${url}`);

			await sleep(1); // Wait for 1 second before polling again

			const response = await this.client.get(url, {
				timeout: 3000,
			});
			allItems.push(...extractItems(response.data));
		}

		return allItems;
	}
}

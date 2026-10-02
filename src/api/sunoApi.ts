import axios, { AxiosInstance } from 'axios';
import UserAgent from 'user-agents';
import { SunoClip } from '../model/SunoClip';
import { SunoProfile } from '../model/SunoProfile';
import { SunoPlaylist } from '../model/SunoPlaylist';
import { Loggers } from '@pekno/simple-discordbot';
import { parseSunoSongUrl } from '../utils/sunoUrl';

// Made by https://github.com/gcui-art
// All credits goes to him and the contributers of https://github.com/gcui-art/suno-api

const MAX_PAGES = 50;
const MAX_REDIRECTS = 5;

const sleep = (seconds: number): Promise<void> => {
	Loggers.get().info(`Sleeping for ${seconds} seconds`);
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

export class SunoApi {
	private static BASE_URL: string = 'https://studio-api-prod.suno.com';
	private readonly client: AxiosInstance;

	constructor() {
		const randomUserAgent = new UserAgent(/Chrome/).random().toString();
		this.client = axios.create({
			headers: {
				'User-Agent': randomUserAgent,
			},
			timeout: 5_000,
		});
	}

	/**
	 * Retrieves a profile with all of its clips and the clips of each of its playlists.
	 * @param handle The profile handle, without the leading @.
	 * @returns A promise that resolves to the SunoProfile.
	 */
	public async profile(handle: string): Promise<SunoProfile> {
		const pages = await this.fetchPaginatedData(
			`${SunoApi.BASE_URL}/api/profiles/${encodeURIComponent(handle)}`,
			(data) => data.clips,
			'num_total_clips',
			// Both sort parameters are required, the API answers 422 without them
			'playlists_sort_by=upvote_count&clips_sort_by=created_at'
		);

		// Pages can overlap (pinned clips), keep the first occurrence of each clip
		const clips = new Map<string, any>();
		for (const clip of pages.flatMap((page) => page.clips ?? []))
			if (!clips.has(clip.id)) clips.set(clip.id, clip);
		const profile = new SunoProfile({
			...pages[0],
			clips: [...clips.values()],
		});

		// Playlists in the profile payload come without their clips, fetch them one by one
		for (const [index, playlist] of (profile.playlists ?? []).entries()) {
			await sleep(1);
			try {
				profile.playlists[index] = await this.playlist(playlist.id);
			} catch (e: any) {
				Loggers.get().warn(
					`SunoAPI : Could not fetch playlist ${playlist.id} : ${e.message}`
				);
			}
		}

		return profile;
	}

	/**
	 * Retrieves a playlist with all of its clips.
	 * @param playlistId The ID of the playlist.
	 * @returns A promise that resolves to the SunoPlaylist.
	 */
	public async playlist(playlistId: string): Promise<SunoPlaylist> {
		const pages = await this.fetchPaginatedData(
			`${SunoApi.BASE_URL}/api/playlist/${encodeURIComponent(playlistId)}`,
			(data) => data.playlist_clips,
			'num_total_results'
		);
		return new SunoPlaylist({
			...pages[0],
			playlist_clips: pages.flatMap((page) => page.playlist_clips ?? []),
		});
	}

	/**
	 * Retrieves information for a specific audio clip.
	 * @param clipId The ID of the audio clip to retrieve information for.
	 * @returns A promise that resolves to an object containing the audio clip information.
	 */
	public async getClip(clipId: string): Promise<SunoClip> {
		const url = `${SunoApi.BASE_URL}/api/clip/${encodeURIComponent(clipId)}`;
		Loggers.get().info(`SunoAPI : Get Clip : ` + url);
		const response = await this.client.get(url);
		return new SunoClip(response.data);
	}

	/**
	 * Checks that a media file can be downloaded (videos are rendered after the song, and not for every clip).
	 * @param url The media URL.
	 * @returns A promise that resolves to true if the file is available.
	 */
	public async isAvailable(url: string): Promise<boolean> {
		try {
			const response = await this.client.head(url, {
				validateStatus: () => true,
			});
			return response.status < 400;
		} catch {
			return false;
		}
	}

	/**
	 * Follows the redirects of a share link (suno.com/s/<code>) until it reaches a song page.
	 * @param shareUrl The share link.
	 * @returns A promise that resolves to the song ID, or null if the link doesn't lead to a song.
	 */
	public async resolveShareLink(shareUrl: string): Promise<string | null> {
		let url = shareUrl;
		for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
			Loggers.get().info(`SunoAPI : Resolving share link : ${url}`);
			const response = await this.client.get(url, {
				maxRedirects: 0,
				validateStatus: (status) => status < 500,
			});
			const location = response.headers['location'];
			if (response.status < 300 || response.status >= 400 || !location)
				return null;

			url = new URL(location, url).toString();
			const reference = parseSunoSongUrl(url);
			if (reference?.type === 'id') return reference.id;
			// Unknown or expired codes redirect to the home page
			if (new URL(url).pathname === '/') return null;
		}
		return null;
	}

	private async fetchPaginatedData(
		initialUrl: string,
		extractItems: (data: any) => unknown[] | undefined,
		totalItemsKey: string,
		queryParam?: string
	): Promise<any[]> {
		const pages: any[] = [];
		let fetchedItems = 0;

		for (let currentPage = 1; currentPage <= MAX_PAGES; currentPage++) {
			if (currentPage > 1) await sleep(1);

			const url = `${initialUrl}?page=${currentPage}${queryParam ? `&${queryParam}` : ''}`;
			Loggers.get().info(`SunoAPI : Fetching from: ${url}`);
			const response = await this.client.get(url);
			pages.push(response.data);

			// Totals can include hidden clips, so an empty page also ends the loop
			const items = extractItems(response.data) ?? [];
			fetchedItems += items.length;
			if (!items.length || fetchedItems >= (response.data[totalItemsKey] ?? 0))
				break;
		}

		return pages;
	}
}

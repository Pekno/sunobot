import axios, { AxiosInstance } from 'axios';
import UserAgent from 'user-agents';
import { wrapper } from 'axios-cookiejar-support';
import { SunoClip } from '../model/SunoClip';
import { SunoProfile } from '../model/SunoProfile';
import { Loggers } from '@pekno/simple-discordbot';

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
	Loggers.get().info(`Sleeping for ${timeout / 1000} seconds`);

	return new Promise((resolve) => setTimeout(resolve, timeout));
};

export class SunoApi {
	private static BASE_URL: string = 'https://studio-api.prod.suno.com';
	private readonly client: AxiosInstance;

	constructor() {
		const randomUserAgent = new UserAgent(/Chrome/).random().toString();
		this.client = wrapper(
			axios.create({
				headers: {
					'User-Agent': randomUserAgent,
				},
			})
		);
		this.client.interceptors.request.use((config) => {
			return config;
		});
	}

	/**
	 * Retrieves audio information for the given song IDs.
	 * @param songIds An optional array of song IDs to retrieve information for.
	 * @returns A promise that resolves to an array of SunoClip objects.
	 */
	public async profile(profileName: string): Promise<SunoProfile> {
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

	/**
	 * Retrieves information for a specific audio clip.
	 * @param clipId The ID of the audio clip to retrieve information for.
	 * @returns A promise that resolves to an object containing the audio clip information.
	 */
	public async getClip(clipId: string): Promise<SunoClip> {
		const url = `${SunoApi.BASE_URL}/api/clip/${clipId}`;
		Loggers.get().info(`SunoAPI : Get Clip : ` + url);
		const response = await this.client.get(url);
		return new SunoClip(response.data);
	}

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
		Loggers.get().info(`SunoAPI : Fetching from: ${initialUrl}`);
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
			Loggers.get().info(`SunoAPI : Fetching from: ${url}`);

			await sleep(1); // Wait for 1 second before polling again

			const response = await this.client.get(url, {
				timeout: 3000,
			});
			allItems.push(...extractItems(response.data));
		}

		return allItems;
	}
}

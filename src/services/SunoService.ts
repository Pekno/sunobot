import { SunoSong } from '../model/SunoSong';
import { SunoApi } from '../api/sunoApi';
import { SunoClip } from '../model/SunoClip';
import { CONFIG } from '../config/config';
import { SunoProfile } from '../model/SunoProfile';
import { LocalAudioFileService } from './LocalAudioFileService';
import { ApplicationCommandOptionChoiceData } from 'discord.js';
import { SunoPlaylist } from '../model/SunoPlaylist';

const COOKIE_PREFIX = 'SUNO_COOKIE_';

export class SunoService {
	private _sunoApis: Map<string, SunoApi>;
	private _localAudioFileService: LocalAudioFileService | undefined;

	public init = async () => {
		this._sunoApis = new Map();

		for (const key of Object.keys(process.env)) {
			if (key.startsWith(COOKIE_PREFIX)) {
				const cookieName = key.replace(COOKIE_PREFIX, '');
				const cookie = process.env[key];
				if (cookie) {
					this._sunoApis.set(
						cookieName,
						await SunoApi.create(cookie, cookieName)
					);
				}
			}
		}
		if (this._sunoApis.size === 0) throw new Error('No SUNO_COOKIE_X defined');

		if (CONFIG.SHOULD_SAVE_LOCALY) {
			this._localAudioFileService = new LocalAudioFileService(this);
		}
	};

	private getPlaylistName = () => {
		const today = new Date();
		const day = String(today.getDate()).padStart(2, '0');
		const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
		const year = String(today.getFullYear()).slice(-2); // Get last 2 digits of the year

		return `Discord SUNO - ${day}/${month}/${year}`;
	};

	getSunoApi(needsCredits: boolean = false): SunoApi {
		const oldestApi = this.findOldestUsedApi(needsCredits);
		if (oldestApi) return oldestApi;
		throw new Error('No available SunoApi can generate at this time');
	}

	private findOldestUsedApi = (needsCredits: boolean): SunoApi => {
		let oldestCookieName: string | null = null;
		let oldestTime = Infinity;

		for (const [id, sunoApi] of this._sunoApis) {
			if (
				sunoApi.lastUsed < oldestTime &&
				(!needsCredits || sunoApi.credit_left > 0)
			) {
				oldestTime = sunoApi.lastUsed;
				oldestCookieName = id;
			}
		}
		if (!oldestCookieName) {
			const defaultValue = this._sunoApis.entries().next().value;
			if (!defaultValue) throw new Error('Cannot find a SunoApi from cookies');
			return defaultValue[1];
		} else {
			const oldestApi = this._sunoApis.get(oldestCookieName);
			if (!oldestApi) throw new Error('Cannot find a SunoApi with this ID');
			return oldestApi;
		}
	};

	incrementPlayCount = async (sunoClip: SunoClip): Promise<void> => {
		await this.getSunoApi().incrementPlayCount(sunoClip);
	};

	generateSong = async (
		song: SunoSong,
		wait_audio: boolean
	): Promise<SunoClip[]> => {
		// Set it to const so that every action is used on the same API to avoid permission errors
		const sunoApi = this.getSunoApi(true);

		const data = await sunoApi.custom_generate(
			wait_audio,
			song.lyrics,
			song.styles.map((x: string) => x.toLowerCase()).join(' '),
			song.title
		);

		const playlistName = this.getPlaylistName();
		const playlistsByName = await sunoApi.getSelfPlaylists(
			(playlist) => playlist.name.toLowerCase() === playlistName.toLowerCase()
		);
		let playlist: SunoPlaylist;
		if (!playlistsByName.length) {
			playlist = await sunoApi.createPlaylist(playlistName);
			await sunoApi.setPlaylistVisibility(playlist, true);
		} else {
			playlist = playlistsByName[0];
		}

		if (!playlist) throw new Error('Cannot create, or find Playlist');
		await sunoApi.addToPlaylist(playlist, data.clips);
		for (const clip of data.clips) {
			await sunoApi.setClipVisibility(clip, true);
			if (this._localAudioFileService)
				this._localAudioFileService.saveClip(clip);
		}

		return data.clips;
	};

	getClip = async (songId: string): Promise<SunoClip> => {
		if (this._localAudioFileService) {
			const foundLocalClip = this._localAudioFileService.getClip(songId);
			if (foundLocalClip) return foundLocalClip;
		}
		const onlineClip = await this.getSunoApi().getClip(songId);
		if (this._localAudioFileService)
			this._localAudioFileService.saveClip(onlineClip);
		return onlineClip;
	};

	profile = async (profileName: string): Promise<SunoProfile> => {
		const profile = await this.getSunoApi().profile(
			profileName.trim().toLowerCase()
		);
		if (this._localAudioFileService) {
			await this._localAudioFileService.expandProfile(profile);
			this._localAudioFileService.saveProfile(profile);
		}
		return profile;
	};

	getProfileAutocomplete = (
		filter?: string
	): ApplicationCommandOptionChoiceData[] => {
		if (this._localAudioFileService)
			return this._localAudioFileService.getProfileList(filter).map((p) => ({
				name: p.display_name,
				value: p.handle,
			}));
		return [];
	};
}

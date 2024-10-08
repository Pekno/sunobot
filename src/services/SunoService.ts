import { SunoSong } from '../model/SunoSong';
import { SunoApi } from '../api/sunoApi';
import { SunoClip } from '../model/SunoClip';
import { CONFIG } from '../config/config';
import { SunoProfile } from '../model/SunoProfile';
import { LocalAudioFileService } from './LocalAudioFileService';
import { ApplicationCommandOptionChoiceData } from 'discord.js';
import { SunoPlaylist } from '../model/SunoPlaylist';

export class SunoService {
	private _sunoApi: SunoApi;
	private _localAudioFileService: LocalAudioFileService | undefined;

	public init = async () => {
		this._sunoApi = await SunoApi.create(CONFIG.SUNO_COOKIE);
		if (CONFIG.SHOULD_SAVE_LOCALY) {
			this._localAudioFileService = new LocalAudioFileService(this._sunoApi);
		}
	};

	private getPlaylistName = () => {
		const today = new Date();
		const day = String(today.getDate()).padStart(2, '0');
		const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
		const year = String(today.getFullYear()).slice(-2); // Get last 2 digits of the year

		return `Discord SUNO - ${day}/${month}/${year}`;
	};

	generateSong = async (
		song: SunoSong,
		wait_audio: boolean
	): Promise<SunoClip[]> => {
		const data = await this._sunoApi.custom_generate(
			wait_audio,
			song.lyrics,
			song.styles.map((x: string) => x.toLowerCase()).join(' '),
			song.title
		);

		const playlistName = this.getPlaylistName();
		const playlistsByName = await this._sunoApi.getPlaylists(
			(playlist) => playlist.name.toLowerCase() === playlistName.toLowerCase()
		);
		let playlist: SunoPlaylist;
		if (!playlistsByName.length) {
			playlist = await this._sunoApi.createPlaylist(playlistName);
			await this._sunoApi.setPlaylistVisibility(playlist, true);
		} else {
			playlist = playlistsByName[0];
		}

		if (!playlist) throw new Error('Cannot create, or find Playlist');
		await this._sunoApi.addToPlaylist(playlist, data.clips);
		for (const clip of data.clips) {
			await this._sunoApi.setClipVisibility(clip, true);
			if (this._localAudioFileService)
				this._localAudioFileService.saveClip(clip);
		}

		return data.clips;
	};

	canGenerate = async (): Promise<boolean> => {
		const credits = await this._sunoApi.get_credits();
		return credits.credits_left >= 0;
	};

	loadSong = async (songId: string): Promise<SunoClip> => {
		if (this._localAudioFileService) {
			const foundLocalClip = this._localAudioFileService.getClip(songId);
			if (foundLocalClip) return foundLocalClip;
		}
		const onlineClip = await this._sunoApi.getClip(songId);
		if (this._localAudioFileService)
			this._localAudioFileService.saveClip(onlineClip);
		return onlineClip;
	};

	profile = async (profileName: string): Promise<SunoProfile> => {
		const profile = await this._sunoApi.profile(
			profileName.trim().toLowerCase()
		);
		if (this._localAudioFileService)
			await this._localAudioFileService.expandProfile(profile);
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

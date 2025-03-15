import { SunoApi } from '../api/sunoApi';
import { SunoClip } from '../model/SunoClip';
import { CONFIG } from '../config/config';
import { SunoProfile } from '../model/SunoProfile';
import { LocalAudioFileService } from './LocalAudioFileService';
import { ApplicationCommandOptionChoiceData } from 'discord.js';

export class SunoService {
	private _sunoApi: SunoApi;
	private _localAudioFileService: LocalAudioFileService | undefined;

	public init = async () => {
		this._sunoApi = new SunoApi();

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

	getClip = async (songId: string): Promise<SunoClip> => {
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

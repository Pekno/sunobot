import { SunoSong } from '../model/SunoSong';
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
		this._sunoApi = await SunoApi.create(CONFIG.SUNO_COOKIE);
		if (CONFIG.SHOULD_SAVE_LOCALY) {
			this._localAudioFileService = new LocalAudioFileService(this._sunoApi);
		}
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
		if (this._localAudioFileService)
			for (const clip of data.clips) {
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

	setVisibility = async (sunoClip: SunoClip, isPublic: boolean) => {
		return await this._sunoApi.setVisibility(sunoClip, isPublic);
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

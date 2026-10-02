import { SunoApi } from '../api/sunoApi';
import { SunoClip } from '../model/SunoClip';
import { CONFIG } from '../config/config';
import { SunoProfile } from '../model/SunoProfile';
import { LocalAudioFileService } from './LocalAudioFileService';
import { ApplicationCommandOptionChoiceData } from 'discord.js';
import { isAxiosError } from 'axios';
import { LocaleError } from '@pekno/simple-discordbot';
import { parseSunoProfileHandle, parseSunoSongUrl } from '../utils/sunoUrl';

// Discord rejects autocomplete responses with more than 25 choices
const MAX_AUTOCOMPLETE_CHOICES = 25;

const isNotFound = (e: unknown) =>
	isAxiosError(e) && e.response?.status === 404;

export class SunoService {
	private _sunoApi: SunoApi;
	private _localAudioFileService: LocalAudioFileService | undefined;

	public init = async () => {
		this._sunoApi = new SunoApi();

		if (CONFIG.SHOULD_SAVE_LOCALY) {
			this._localAudioFileService = new LocalAudioFileService(this._sunoApi);
		}
	};

	resolveClipId = async (sunoUrl: string): Promise<string | null> => {
		const reference = parseSunoSongUrl(sunoUrl);
		if (!reference) return null;
		if (reference.type === 'id') return reference.id;
		return this._sunoApi.resolveShareLink(reference.url);
	};

	getClip = async (songId: string): Promise<SunoClip> => {
		if (this._localAudioFileService) {
			const foundLocalClip = this._localAudioFileService.getClip(songId);
			if (foundLocalClip) return foundLocalClip;
		}
		let onlineClip: SunoClip;
		try {
			onlineClip = await this._sunoApi.getClip(songId);
		} catch (e) {
			if (isNotFound(e)) throw new LocaleError('error.suno.clip_not_found');
			throw e;
		}
		if (this._localAudioFileService)
			this._localAudioFileService.saveClip(onlineClip);
		return onlineClip;
	};

	isPlayable = async (clip: SunoClip): Promise<boolean> => {
		const source = clip.streamUrl;
		if (!source) return false;
		return clip.isLocal || this._sunoApi.isAvailable(source);
	};

	profile = async (profileName: string): Promise<SunoProfile> => {
		let profile: SunoProfile;
		try {
			profile = await this._sunoApi.profile(
				parseSunoProfileHandle(profileName)
			);
		} catch (e) {
			if (isNotFound(e)) throw new LocaleError('error.suno.profile_not_found');
			throw e;
		}
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
			return this._localAudioFileService
				.getProfileList(filter)
				.slice(0, MAX_AUTOCOMPLETE_CHOICES)
				.map((p) => ({
					name: p.display_name,
					value: p.handle,
				}));
		return [];
	};
}

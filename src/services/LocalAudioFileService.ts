import { CONFIG } from '../config/config';
import fs from 'fs';
import path from 'path';
import {
	LOCAL_AUDIO_EXTENSIONS,
	LocalSunoClip,
	SunoClip,
} from '../model/SunoClip';
import axios from 'axios';
import { SunoProfile } from '../model/SunoProfile';
import { SunoApi } from '../api/sunoApi';
import { LocaleError, Loggers } from '@pekno/simple-discordbot';
export class LocalAudioFileService {
	private _sunoApi: SunoApi;

	constructor(sunoApi: SunoApi) {
		this._sunoApi = sunoApi;
		if (!fs.existsSync(CONFIG.SAVED_DATA_PATH)) {
			Loggers.get().info(
				`LOCAL_AUDIO : Create Folder - ${CONFIG.SAVED_DATA_PATH}`
			);
			fs.mkdirSync(CONFIG.SAVED_DATA_PATH, { recursive: true });
		}
	}

	// Used when you got {ID}.mp4 / {ID}.mp3 files and you want to get the {ID}.json data
	ForceLoadClipsInfo = async () => {
		const files = fs.readdirSync(CONFIG.SAVED_DATA_PATH);

		for (const file of files.filter((file) =>
			LOCAL_AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase())
		)) {
			const sunoId = path.parse(file).name;
			Loggers.get().info(`LOCAL_AUDIO : Grabbing SunoClip Info - ${sunoId}`);
			const clip = await this._sunoApi.getClip(sunoId);
			await this.saveClip(clip);
		}
	};

	expandProfile = async (profile: SunoProfile) => {
		const clips = await this.getAllByProfile(profile.handle);
		const existIds = profile.clips.map((c) => c.id);

		for (const clip of clips) {
			if (!existIds.includes(clip.id)) {
				profile.clips.push(clip);
			}
		}
	};

	getAllByProfile = async (profileHandle: string) => {
		const profilePath = `${CONFIG.SAVED_DATA_PATH}/${profileHandle}`;
		if (fs.existsSync(`${profilePath}/profile.json`)) {
			const sunoClips: LocalSunoClip[] = [];
			const files = fs.readdirSync(profilePath);
			for (const file of files.filter(
				(file) =>
					path.extname(file).toLowerCase() === '.json' &&
					file !== 'profile.json'
			)) {
				const clip = await this.getClipByProfile(
					profileHandle,
					file.replace('.json', '')
				);
				if (clip) {
					sunoClips.push(clip);
				}
			}
			return sunoClips;
		}
		return [];
	};

	getClipByProfile = (
		profileHandle: string,
		sunoId: string
	): LocalSunoClip | null => {
		Loggers.get().info(
			`LOCAL_AUDIO : Trying to Load LocalSunoClip - @${profileHandle} > ${sunoId}`
		);
		const path = `${CONFIG.SAVED_DATA_PATH}/${profileHandle}/${sunoId}.json`;
		if (!fs.existsSync(path)) return null;
		Loggers.get().info(
			`LOCAL_AUDIO : LocalSunoClip - ${sunoId} /!\\ Found /!\\`
		);
		return new LocalSunoClip(JSON.parse(fs.readFileSync(path, 'utf8')));
	};

	getClip = (sunoId: string): LocalSunoClip | null => {
		Loggers.get().info(
			`LOCAL_AUDIO : Trying to Load LocalSunoClip - ${sunoId}`
		);
		const foundPath = this.findFileInDirectory(
			`${CONFIG.SAVED_DATA_PATH}`,
			`${sunoId}.json`
		);
		if (!foundPath) return null;
		Loggers.get().info(
			`LOCAL_AUDIO : LocalSunoClip - ${sunoId} /!\\ Found /!\\`
		);
		return new LocalSunoClip(JSON.parse(fs.readFileSync(foundPath, 'utf8')));
	};

	private makeprofileDir = (profileName: string): string => {
		const savePath = `${CONFIG.SAVED_DATA_PATH}/${profileName}`;
		if (!fs.existsSync(savePath)) {
			Loggers.get().info(
				`LOCAL_AUDIO : Create Folder and Fetching Profile - ${savePath}`
			);
			fs.mkdirSync(savePath, { recursive: true });
		}
		return savePath;
	};

	saveProfile = (profile: SunoProfile) => {
		const savePath = this.makeprofileDir(profile.handle);
		fs.writeFileSync(`${savePath}/profile.json`, JSON.stringify(profile));
	};

	saveClip = async (sunoClip: SunoClip, isWait: boolean = true) => {
		const MAX_RETRIES = 10; // Max number of retries
		const RETRY_DELAY_MS = 30000; // Delay between retries (in milliseconds)

		const retrySaveClip = async (
			clip: SunoClip,
			retries: number
		): Promise<void> => {
			// Clips still being generated, or whose video isn't rendered yet, have nothing to save
			const audioUrl = clip.status === 'complete' ? clip.remoteAudioUrl : null;

			if (audioUrl && (await this._sunoApi.isAvailable(audioUrl))) {
				// If valid, proceed to download and save the clip
				const result = await axios.request({
					responseType: 'arraybuffer',
					url: audioUrl,
					method: 'get',
				});
				const extension =
					path.extname(new URL(audioUrl).pathname).toLowerCase() || '.mp4';
				const savePath = this.makeprofileDir(sunoClip.handle);
				// Save the audio and metadata files
				fs.writeFileSync(`${savePath}/${clip.id}${extension}`, result.data);
				fs.writeFileSync(`${savePath}/${clip.id}.json`, JSON.stringify(clip));
				Loggers.get().info(
					`LOCAL_AUDIO : ${clip.id} - Audio URL is valid, Saved`
				);
				return; // Exit the function once saved successfully
			}

			// If audio_url is still not valid and retries are left, retry after a delay
			if (retries < MAX_RETRIES) {
				Loggers.get().info(
					`LOCAL_AUDIO : ${clip.id} - Audio URL is not valid yet. Retrying (${retries + 1}/${MAX_RETRIES})...`
				);

				if (isWait) {
					// Wait for the delay and then recursively call retrySaveClip
					return new Promise<void>((resolve) => {
						setTimeout(async () => {
							try {
								// Refresh straight from the API, SunoService.getClip would start another save
								const refreshedClip = await this._sunoApi.getClip(clip.id);
								await retrySaveClip(refreshedClip, retries + 1); // Retry the operation
							} catch (e: any) {
								Loggers.get().error(e.message);
							}
							resolve();
						}, RETRY_DELAY_MS);
					});
				}
			}

			// If max retries are reached, throw an error
			if (retries >= MAX_RETRIES) {
				throw new LocaleError(`error.local_audio.too_much_retries`, {
					retries: `${MAX_RETRIES}`,
				});
			}
		};

		try {
			// Start the retry logic
			await retrySaveClip(sunoClip, 0);
		} catch (e: any) {
			Loggers.get().error(e.message);
		}
	};

	// TODO: improve, because it will get profilelist on autocomplete filter
	getProfileList = (filter?: string): SunoProfile[] => {
		const search = filter?.toLowerCase() ?? '';
		return (
			fs
				.readdirSync(CONFIG.SAVED_DATA_PATH, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() && entry.name.toLowerCase().startsWith(search)
				)
				.map((entry) =>
					path.join(CONFIG.SAVED_DATA_PATH, entry.name, 'profile.json')
				)
				// Folders created by /play only hold clips, profile.json is written by /profile
				.filter((profilePath) => fs.existsSync(profilePath))
				.map(
					(profilePath) =>
						new SunoProfile(JSON.parse(fs.readFileSync(profilePath, 'utf8')))
				)
		);
	};

	// Runs synchronously on every /play, so it costs a few syscalls per folder rather than a stat per cached file,
	// a slow walk blocks the event loop and Discord drops interactions not acknowledged within 3 s
	private findFileInDirectory = (
		dirPath: string,
		fileName: string
	): string | null => {
		const candidate = path.join(dirPath, fileName);
		if (fs.existsSync(candidate)) return candidate;

		for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const result = this.findFileInDirectory(
				path.join(dirPath, entry.name),
				fileName
			);
			if (result) return result;
		}

		return null;
	};
}

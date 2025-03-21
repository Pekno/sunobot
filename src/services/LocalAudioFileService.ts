import { CONFIG } from '../config/config';
import fs from 'fs';
import path from 'path';
import { LocalSunoClip, SunoClip } from '../model/SunoClip';
import axios from 'axios';
import { SunoProfile } from '../model/SunoProfile';
import { SunoService } from './SunoService';
import { LocaleError, Loggers } from '@pekno/simple-discordbot';
export class LocalAudioFileService {
	private _sunoService: SunoService;

	constructor(sunoApi: SunoService) {
		this._sunoService = sunoApi;
		if (!fs.existsSync(CONFIG.SAVED_DATA_PATH)) {
			Loggers.get().info(
				`LOCAL_AUDIO : Create Folder - ${CONFIG.SAVED_DATA_PATH}`
			);
			fs.mkdirSync(CONFIG.SAVED_DATA_PATH, { recursive: true });
		}
	}

	// Used when you got {ID}.mp3 files and you want to get the {ID}.json data
	ForceLoadClipsInfo = async () => {
		const files = fs.readdirSync(CONFIG.SAVED_DATA_PATH);

		for (const file of files.filter(
			(file) => path.extname(file).toLowerCase() === '.mp3'
		)) {
			Loggers.get().info(
				`LOCAL_AUDIO : Grabbing SunoClip Info - ${file.replace('.mp3', '')}`
			);
			const clip = await this._sunoService.getClip(file.replace('.mp3', ''));
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
			// Check if the audio_url is valid (ends with .mp3)
			const validAudioUrl = clip.audio_url.endsWith('.mp3');

			if (validAudioUrl) {
				// If valid, proceed to download and save the clip
				const result = await axios.request({
					responseType: 'arraybuffer',
					url: clip.audio_url,
					method: 'get',
					headers: {
						'Content-Type': 'audio/mp3',
					},
				});
				const savePath = this.makeprofileDir(sunoClip.handle);
				// Save the audio and metadata files
				fs.writeFileSync(`${savePath}/${clip.id}.mp3`, result.data);
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
							// Refresh the SunoClip data by calling getClip
							const refreshedClip = await this._sunoService.getClip(clip.id);
							await retrySaveClip(refreshedClip, retries + 1); // Retry the operation
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
		let dirList = fs.readdirSync(`${CONFIG.SAVED_DATA_PATH}`);
		if (filter)
			dirList = dirList.filter((profile) =>
				profile.startsWith(filter.toLocaleLowerCase())
			);
		return dirList.map(
			(dir) =>
				new SunoProfile(
					JSON.parse(
						fs.readFileSync(
							`${CONFIG.SAVED_DATA_PATH}/${dir}/profile.json`,
							'utf8'
						)
					)
				)
		);
	};

	private findFileInDirectory = (
		dirPath: string,
		fileName: string
	): string | null => {
		// Read the contents of the directory
		const filesAndDirs = fs.readdirSync(dirPath);

		// Iterate over the contents
		for (const fileOrDir of filesAndDirs) {
			const fullPath = path.join(dirPath, fileOrDir);

			// Check if the current path is a directory
			if (fs.statSync(fullPath).isDirectory()) {
				// Recursively search in this directory
				const result = this.findFileInDirectory(fullPath, fileName);
				if (result) {
					return result; // Return the result if found
				}
			} else if (fileOrDir === fileName) {
				// If the file is found, return its full path
				return fullPath;
			}
		}

		// Return null if the file was not found in this directory or its subdirectories
		return null;
	};
}

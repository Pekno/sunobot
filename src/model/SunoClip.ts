import { AudioResource, createAudioResource } from '@discordjs/voice';
import {
	APIEmbedField,
	EmbedBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { SunoClipMetadata } from './SunoClipMetadata';
import { CONFIG } from '../config/config';
import fs from 'fs';
import i18n from 'i18n';
import { Loggers } from '@pekno/simple-discordbot';

export class SunoClip {
	id: string;
	video_url: string;
	// Since 2026 Suno sends a ".../api/forbidden" placeholder here
	audio_url: string;
	image_url: string;
	image_large_url: string;
	is_video_pending: boolean;
	major_model_version: string;
	model_name: string;
	metadata: SunoClipMetadata;
	is_liked: boolean;
	user_id: string;
	display_name: string;
	handle: string;
	is_handle_updated: boolean;
	avatar_image_url: string;
	is_trashed: boolean;
	created_at: string;
	status: string;
	title: string;
	play_count: number;
	upvote_count: number;
	is_public: boolean;

	// The audio files listed in media_urls are encrypted ("encoding": "1.0.0") and only Suno's
	// web player can decode them, but the public video mp4 still carries a plain AAC audio track
	get remoteAudioUrl(): string | null {
		if (this.video_url) return this.video_url;
		if (this.audio_url && !this.audio_url.includes('/api/forbidden'))
			return this.audio_url;
		return null;
	}

	get streamUrl(): string | null {
		return this.remoteAudioUrl;
	}

	get realTitle(): string {
		const MAX_LENGTH = 30; // Max length before adding ellipsis
		if (this.title) return this.title;
		const lines = this.metadata.prompt.split('\n');
		for (const line of lines) {
			if (line.trim() && !line.startsWith('[')) {
				const trimmedLine = line.trim();
				if (trimmedLine.length > MAX_LENGTH) {
					return `${trimmedLine.substring(0, MAX_LENGTH)}...`;
				}
				return trimmedLine;
			}
		}
		return 'Unknown';
	}

	get tagText(): string {
		const MAX_LENGTH = 20; // Max length before adding ellipsis
		if (this.metadata.tags.length > MAX_LENGTH) {
			return `${this.metadata.tags.substring(0, MAX_LENGTH)}...`;
		}
		return this.metadata.tags;
	}

	public constructor(init?: Partial<SunoClip>) {
		Object.assign(this, init);
	}

	get url(): string {
		return `https://suno.com/song/${this.id}`;
	}

	get lyrics(): string {
		return this.metadata?.prompt
			? this.metadata.prompt
					.split('\n')
					.filter((line) => line.trim() !== '')
					.join('\n')
			: '';
	}

	get isLocal(): boolean {
		return false;
	}

	get audioResource(): AudioResource<null> {
		const source = this.streamUrl;
		if (!source) throw new Error(`No playable audio for clip ${this.id}`);
		Loggers.get().info(`CLIP : Creating Audio Source Stream from : ${source}`);
		// FFmpeg reads local paths and URLs alike, keeps only the audio track,
		// and needs a seekable input for mp4 containers (a piped stream isn't)
		return createAudioResource(source);
	}

	public buildEmbed = (): EmbedBuilder => {
		return new EmbedBuilder()
			.setTitle(`🎶 ${this.realTitle} 🎶`)
			.setThumbnail(this.image_url)
			.setDescription(
				`${i18n.__('display.clip._default.description', { account_name: this.display_name })}`
			)
			.setURL(this.url);
	};

	public buildField = (
		isFirst: boolean = false,
		isPlayed: boolean
	): APIEmbedField => {
		return {
			name: isFirst
				? `⬇️ ${i18n.__('display.clip._default.next_in_queue')} ⬇️`
				: '\u200B',
			value: `${isPlayed ? '~~' : ''}🔹**[${this.realTitle}](${this.url})** *${i18n.__('display.clip._default.description', { account_name: this.display_name })}* ${this.isLocal ? '📂' : '🌐'} ${isPlayed ? '~~' : ''}`,
		};
	};

	public buildEmbedFieldList = (): APIEmbedField => {
		return {
			name: `${this.isLocal ? '📂' : '🌐'} ~ ${this.realTitle} ~ ${this.tagText}`,
			value: `**[🔗 Link](${this.url})** - ${this.play_count} 👂 - ${this.upvote_count} 👍`,
		};
	};

	public buildOptionsField = (): StringSelectMenuOptionBuilder => {
		return new StringSelectMenuOptionBuilder()
			.setLabel(
				`${this.isLocal ? '📂' : '🌐'} ~ ${this.realTitle} ~ ${this.tagText}`
			)
			.setDescription(`${this.play_count} 👂 - ${this.upvote_count} 👍`)
			.setValue(this.id)
			.setEmoji(this.isLocal ? '📂' : '🌐');
	};
}

// .mp4 is the current cache format, .mp3 files come from before Suno's 2026 changes
export const LOCAL_AUDIO_EXTENSIONS = ['.mp4', '.mp3'];

export class LocalSunoClip extends SunoClip {
	get localAudioPath(): string | null {
		return (
			LOCAL_AUDIO_EXTENSIONS.map(
				(ext) => `${CONFIG.SAVED_DATA_PATH}/${this.handle}/${this.id}${ext}`
			).find((p) => fs.existsSync(p)) ?? null
		);
	}

	get streamUrl(): string | null {
		return this.localAudioPath ?? this.remoteAudioUrl;
	}

	get isLocal(): boolean {
		return !!this.localAudioPath;
	}
}

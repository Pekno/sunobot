import { AudioResource, createAudioResource } from '@discordjs/voice';
import { APIEmbedField, APISelectMenuOption, EmbedBuilder } from 'discord.js';
import { SunoClipMetadata } from './SunoClipMetadata';
import { CONFIG } from '../config/config';

export class SunoClip {
	id: string;
	video_url: string;
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

	get streamUrl(): string {
		return this.audio_url;
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

	public createAudioResource = (): AudioResource<null> => {
		return createAudioResource(this.streamUrl);
	};

	public buildEmbed = (): EmbedBuilder => {
		return new EmbedBuilder()
			.setTitle(`🎶 ${this.realTitle} 🎶`)
			.setThumbnail(this.image_url)
			.setDescription(`by ${this.display_name}`)
			.setURL(this.url);
	};

	public buildField = (
		isFirst: boolean = false,
		isPlayed: boolean
	): APIEmbedField => {
		return {
			name: isFirst ? '⬇️ Next on queue ⬇️' : '\u200B',
			value: `${isPlayed ? '~~' : ''}🔹**[${this.realTitle}](${this.url})** *by ${this.display_name}* ${this.isLocal ? '📂' : '🌐'} ${isPlayed ? '~~' : ''}`,
		};
	};

	public buildEmbedFieldList = (): APIEmbedField => {
		return {
			name: `${this.isLocal ? '📂' : '🌐'} ~ ${this.realTitle} ~ ${this.metadata.tags}`,
			value: `**[🔗 Link](${this.url})** - ${this.play_count} 👂 - ${this.upvote_count} 👍`,
		};
	};

	public buildOptionsField = (): APISelectMenuOption => {
		return {
			label: `${this.isLocal ? '📂' : '🌐'} ~ ${this.realTitle} ~ ${this.metadata.tags}`,
			description: `${this.play_count} 👂 - ${this.upvote_count} 👍`,
			value: this.id,
		};
	};
}

export class LocalSunoClip extends SunoClip {
	get streamUrl(): string {
		return `${CONFIG.SAVED_DATA_PATH}/${this.handle}/${this.id}.mp3`;
	}

	get isLocal(): boolean {
		return true;
	}
}

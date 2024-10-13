import { SunoClip } from './SunoClip';
import { SunoPlaylist } from './SunoPlaylist';
import { SunoClipList } from './SunoClipList';
import { CommandInteraction } from 'discord.js';

export class SunoProfile extends SunoClipList {
	user_id: string;
	display_name: string;
	handle: string;
	profile_description: string;
	clips: SunoClip[];
	stats: {
		upvote_count__sum: number;
		play_count__sum: number;
		followers_count: number;
		following_count: number;
	};
	is_flagged: boolean;
	is_following: boolean;
	num_total_clips: number;
	current_page: number;
	playlists: SunoPlaylist[];
	avatar_image_url: string;
	favorite_songs: SunoClip[];

	get id(): string {
		return this.user_id;
	}
	get upvote_count(): number {
		return this.stats.upvote_count__sum;
	}
	get image_url(): string {
		return this.avatar_image_url;
	}
	get num_total_results(): number {
		return this.num_total_clips;
	}
	get play_count(): number {
		return this.stats.play_count__sum;
	}
	get click_url(): string {
		return `https://suno.com/@${this.handle}`;
	}
	get display_clips(): SunoClip[] {
		if (!this.clips || !this.playlists) return [];
		const playlistIds = [
			...new Set(
				this.playlists
					.map((p) => p.playlist_clips.map((pc) => pc.clip.id))
					.flat()
			),
		];
		return this.clips.filter((c) => !playlistIds.includes(c.id));
	}
	get title(): string {
		return this.display_name;
	}

	sendPaginatedDiscordResponse = async (
		interaction: CommandInteraction
	): Promise<void> => {
		await super.sendPaginatedDiscordResponse(interaction);
		for (const playlist of this.playlists) {
			await playlist.sendPaginatedDiscordResponse(interaction);
		}
	};

	public constructor(init?: Partial<SunoProfile>) {
		super();
		Object.assign(this, init);

		if (init?.clips) this.clips = this.clips.map((clip) => new SunoClip(clip));
		if (init?.playlists)
			this.playlists = this.playlists.map(
				(playlist) => new SunoPlaylist(playlist)
			);

		this.embedIcon = '🎤';
	}
}

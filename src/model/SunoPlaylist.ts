import { SunoClip } from './SunoClip';
import { SunoClipList } from './SunoClipList';

export class SunoPlaylist extends SunoClipList {
	id: string;
	upvote_count: number;
	image_url: string;
	num_total_results: number;
	play_count: number;
	current_page: number;
	description: string;
	dislike_count: number;
	flag_count: number;
	is_discover_playlist: boolean;
	is_owned: boolean;
	is_public: boolean;
	is_trashed: boolean;
	name: string;
	playlist_clips: { clip: SunoClip; relative_index: number }[];
	reaction: string;
	skip_count: number;

	get title(): string {
		return this.name;
	}
	get display_clips(): SunoClip[] {
		return this.playlist_clips.map((pc) => pc.clip);
	}
	get click_url(): string {
		return `https://suno.com/playlist/${this.id}`;
	}

	public constructor(init?: Partial<SunoPlaylist>) {
		super();
		Object.assign(this, init);

		if (init?.playlist_clips)
			this.playlist_clips = this.playlist_clips.map((pc) => ({
				clip: new SunoClip(pc.clip),
				relative_index: pc.relative_index,
			}));

		this.embedIcon = '🔊';
	}
}

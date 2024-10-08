import { SunoClip } from './SunoClip';

export class SunoPlaylist {
	current_page: number;
	description: string;
	dislike_count: number;
	flag_count: number;
	id: string;
	is_discover_playlist: boolean;
	is_owned: boolean;
	is_public: boolean;
	is_trashed: boolean;
	name: string;
	num_total_results: number;
	play_count: number;
	playlist_clips: SunoClip[];
	reaction: string;
	skip_count: number;
	upvote_count: number;

	public constructor(init?: Partial<SunoPlaylist>) {
		Object.assign(this, init);
	}
}

export interface SunoSession {
	user: {
		email: string;
		username: string;
		id: string;
		display_name: string;
		handle: string;
		avatar_image_url: string;
		profile_description: string;
		is_handle_updated: boolean;
	};
	models: {
		id: string;
		name: string;
		external_key: string;
		major_version: number;
		description: string;
	}[];
	roles: {
		sub: boolean;
		pro: boolean;
		has_accepted_custom_mode_tos: boolean;
	};
	flags: {
		continue_anywhere: boolean;
		playlists: boolean;
		v3_alpha: boolean;
		v3p5: boolean;
		new_upgrade_method: boolean;
		support_3ds: boolean;
		'bot-hcaptcha': boolean;
		'on-demand-video': boolean;
		'creation-tutorial': boolean;
		'image-on-demand-backfill-jpeg': boolean;
		'editing-stems': boolean;
		madlibs: boolean;
		'negative-tags': boolean;
		'edit-mode-ui': boolean;
		'analytics-session-id': boolean;
		'enable-listen-history': boolean;
		cover: boolean;
		'thumbs-exp': boolean;
		'ecs-backend': boolean;
	};
}

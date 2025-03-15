export const CONFIG = {
	LOCALE: process.env.LOCALE ?? 'en',
	DISCORD_ID: process.env.DISCORD_ID,
	DISCORD_TOKEN: process.env.DISCORD_TOKEN,
	SHOULD_SAVE_LOCALY: process.env.SHOULD_SAVE_LOCALY ?? true,
	SAVED_DATA_PATH: process.env.SAVED_DATA_PATH ?? './suno',
	LOG_LEVEL: process.env.LOG_LEVEL?.toLowerCase() ?? 'warning',
	PAGE_SIZE: 25,
	AVAILABLE_LOCAL: ['fr', 'en'],
};

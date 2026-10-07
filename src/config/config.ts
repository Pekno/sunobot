import dotenv from 'dotenv';
import path from 'path';

// Has to run before CONFIG reads process.env
dotenv.config({ path: path.resolve(__dirname, '../env/.env'), quiet: true });

const parseBoolean = (value: string | undefined, defaultValue: boolean) =>
	value === undefined
		? defaultValue
		: !['false', '0', 'no', 'off', ''].includes(value.trim().toLowerCase());

const logLevel = process.env.LOG_LEVEL?.trim().toLowerCase() || 'warn';

export const CONFIG = {
	LOCALE: process.env.LOCALE ?? 'en',
	DISCORD_ID: process.env.DISCORD_ID,
	DISCORD_TOKEN: process.env.DISCORD_TOKEN,
	SHOULD_SAVE_LOCALY: parseBoolean(process.env.SHOULD_SAVE_LOCALY, true),
	SAVED_DATA_PATH: process.env.SAVED_DATA_PATH ?? './suno',
	LOG_LEVEL: process.env.LOG_LEVEL?.toLowerCase() ?? 'warning',
	AUDIO: {
		defaultVolume: 0.5,
	},
	// winston names it "warn", the README documents "warning"
	PAGE_SIZE: 25,
	AVAILABLE_LOCAL: ['fr', 'en'],
};

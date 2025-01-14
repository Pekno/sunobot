import { Logger } from '../services/LoggerService';
import { Bot } from '../services/Bot';
import {
	AutoCompleteCommand,
	ButtonCommand,
	Command,
	CommandList,
	CommandOption,
	ModalSubmitCommand,
} from '../model/DiscordModels';
import {
	ApplicationCommandOptionType,
	AutocompleteInteraction,
	ButtonInteraction,
	ChatInputCommandInteraction,
	Client,
	ModalSubmitInteraction,
} from 'discord.js';
import { AudioService } from '../services/AudioService';
import { CONFIG } from '../config/config';
import dotenv from 'dotenv';
import path from 'path';
import i18n from 'i18n';
import { LocaleError } from '../model/LocalError';

i18n.configure({
	locales: CONFIG.AVAILABLE_LOCAL,
	directory: path.resolve(__dirname, '../locales'),
	defaultLocale: 'en',
	objectNotation: true,
});
if (!CONFIG.AVAILABLE_LOCAL.includes(CONFIG.LOCALE.toLowerCase()))
	throw new LocaleError('error._default', {
		message: `LOCALE env var not recognized`,
	});
i18n.setLocale(CONFIG.LOCALE.toLowerCase());
Logger.info(`LOCALE : ${CONFIG.LOCALE.toUpperCase()}`);
dotenv.config({ path: path.resolve(__dirname, '../env/.env') });

const commandsList = new CommandList();
commandsList.push(
	new Command({
		name: 'play',
		description: 'Play a suno music',
		options: [
			new CommandOption({
				name: 'suno_url',
				description: 'complete suno url',
				type: ApplicationCommandOptionType.String,
				required: true,
			}),
		],
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService,
			byPassParameters: string
		) => {
			const sunoUrl = byPassParameters
				? `https://suno.com/song/${byPassParameters}`
				: interaction.options.getString('suno_url');
			await audioService.play(interaction, sunoUrl);
		},
	})
);

commandsList.push(
	new Command({
		name: 'skip',
		clickAlias: 'sunoplayer_skip',
		description: 'Skip a suno music',
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			await audioService.skip(interaction);
		},
	})
);

commandsList.push(
	new Command({
		name: 'pause',
		clickAlias: 'sunoplayer_pause',
		description: 'Pause a suno music',
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			await audioService.pause(interaction);
		},
	})
);

commandsList.push(
	new Command({
		name: 'resume',
		clickAlias: 'sunoplayer_resume',
		description: 'Resume a suno music',
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			await audioService.resume(interaction);
		},
	})
);

commandsList.push(
	new Command({
		name: 'stop',
		clickAlias: 'sunoplayer_stop',
		description: 'Stop and clear a suno playlist',
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			await audioService.stop(interaction);
		},
	})
);

commandsList.push(
	new Command({
		name: 'generate',
		description: 'Generate a suno music',
		options: [
			new CommandOption({
				name: 'suno_prompt',
				description: 'prompt',
				type: ApplicationCommandOptionType.String,
				required: true,
			}),
		],
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			const sunoPrompt = interaction.options.getString('suno_prompt');
			await audioService.generateLyrics(interaction, sunoPrompt);
		},
		registerPredicate: () => !!CONFIG.OPENAI_API_KEY,
	})
);

commandsList.push(
	new ButtonCommand({
		name: 'review_lyrics',
		execute: async (
			interaction: ButtonInteraction,
			client: Client,
			audioService: AudioService,
			byPassParameters: string
		) => {
			await audioService.reviewLyrics(interaction, byPassParameters);
		},
	})
);

commandsList.push(
	new ButtonCommand({
		name: 'abort_lyrics',
		execute: async (
			interaction: ButtonInteraction,
			client: Client,
			audioService: AudioService,
			byPassParameters: string
		) => {
			await audioService.abortLyrics(interaction, byPassParameters);
		},
	})
);

commandsList.push(
	new ModalSubmitCommand({
		name: 'submit_prompt_modal',
		execute: async (
			interaction: ModalSubmitInteraction,
			client: Client,
			audioService: AudioService,
			byPassParameters: {
				lyricsId: string;
				lyrics: string;
				tags: string;
			}
		) => {
			await audioService.generateSong(interaction, byPassParameters);
		},
	})
);

commandsList.push(
	new AutoCompleteCommand({
		name: 'profile_autocomplete',
		execute: async (
			interaction: AutocompleteInteraction,
			client: Client,
			audioService: AudioService
		) => {
			const focusedOption = interaction.options.getFocused(true);
			await audioService.getLocalProfiles(interaction, focusedOption.value);
		},
	})
);

commandsList.push(
	new Command({
		name: 'profile',
		description: 'Get a suno profile',
		options: [
			new CommandOption({
				name: 'suno_profile',
				description: 'profile',
				type: ApplicationCommandOptionType.String,
				required: true,
				autocomplete: true,
			}),
		],
		execute: async (
			interaction: ChatInputCommandInteraction,
			client: Client,
			audioService: AudioService
		) => {
			const sunoProfile = interaction.options.getString('suno_profile');
			await audioService.profile(interaction, sunoProfile);
		},
	})
);

const bot = new Bot();
bot.start(commandsList).catch((e) => {
	Logger.error(e.message);
});

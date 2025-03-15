import {
	ApplicationCommandOptionType,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	Client,
	GatewayIntentBits,
} from 'discord.js';
import { AudioService } from '../services/AudioService';
import { CONFIG } from '../config/config';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import i18n from 'i18n';
import {
	AutoCompleteCommand,
	Command,
	CommandList,
	CommandOption,
	LocaleError,
	Loggers,
	SimpleDiscordBot,
} from '@pekno/simple-discordbot';

const localesPath = path.resolve(__dirname, '../locales');
const files = fs.readdirSync(localesPath);
const localList = files.map((f) => f.replace('.json', '').toLowerCase());

i18n.configure({
	locales: localList,
	directory: localesPath,
	defaultLocale: 'en',
	objectNotation: true,
});
if (!localList.includes(CONFIG.LOCALE.toLowerCase()))
	throw new LocaleError('error._default', {
		message: `LOCALE env var not recognized`,
	});
i18n.setLocale(CONFIG.LOCALE.toLowerCase());
Loggers.get().info(`LOCALE : ${CONFIG.LOCALE.toUpperCase()}`);
dotenv.config({ path: path.resolve(__dirname, '../env/.env') });

const audioService = new AudioService();
const simpleBot = new SimpleDiscordBot<AudioService>(
	{
		discord_token: CONFIG.DISCORD_TOKEN ?? '',
		discord_id: CONFIG.DISCORD_ID ?? '',
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
		locale: CONFIG.LOCALE,
		available_locale: localList,
		locale_directory: localesPath,
	},
	audioService
);

const simpleCommandsList = new CommandList<AudioService>();
simpleCommandsList
	.push(
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
				extraInfo: string
			) => {
				const sunoUrl = extraInfo
					? `https://suno.com/song/${extraInfo}`
					: interaction.options.getString('suno_url');
				await audioService.play(interaction, sunoUrl);
			},
		})
	)
	.push(
		new Command({
			name: 'skip',
			clickAlias: 'button_sunoplayer_skip',
			description: 'Skip a suno music',
			execute: async (
				interaction: ChatInputCommandInteraction,
				client: Client,
				audioService: AudioService
			) => {
				await audioService.skip(interaction);
			},
		})
	)
	.push(
		new Command({
			name: 'pause',
			clickAlias: 'button_sunoplayer_pause',
			description: 'Pause a suno music',
			execute: async (
				interaction: ChatInputCommandInteraction,
				client: Client,
				audioService: AudioService
			) => {
				await audioService.pause(interaction);
			},
		})
	)
	.push(
		new Command({
			name: 'resume',
			clickAlias: 'button_sunoplayer_resume',
			description: 'Resume a suno music',
			execute: async (
				interaction: ChatInputCommandInteraction,
				client: Client,
				audioService: AudioService
			) => {
				await audioService.resume(interaction);
			},
		})
	)
	.push(
		new Command({
			name: 'stop',
			clickAlias: 'button_sunoplayer_stop',
			description: 'Stop and clear a suno playlist',
			execute: async (
				interaction: ChatInputCommandInteraction,
				client: Client,
				audioService: AudioService
			) => {
				await audioService.stop(interaction);
			},
		})
	)
	.push(
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
	)
	.push(
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

audioService.start().then(() => {
	simpleBot.start(simpleCommandsList).catch((e: any) => {
		Loggers.get().error(e, e.stack);
	});
});

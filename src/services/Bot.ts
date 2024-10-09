import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { Logger } from './PinoLogger';
import { CONFIG } from '../config/config';
import { CommandList } from '../model/DiscordModels';
import { AudioService } from './AudioService';

export class Bot {
	private _client: Client;
	private _audioService: AudioService;

	private register = async (commandList: CommandList) => {
		this._client = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
		});

		if (!CONFIG.DISCORD_TOKEN) throw new Error('No Discord token configured');
		if (!CONFIG.DISCORD_ID) throw new Error('No Discord id configured');

		const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);
		try {
			await rest.put(Routes.applicationCommands(CONFIG.DISCORD_ID), {
				body: commandList.build(),
			});
			Logger.info('Bot : Successfully loaded application (/) commands.');
		} catch (e) {
			Logger.error(e);
		}

		this._client.on(Events.InteractionCreate, async (interaction) => {
			if (!interaction) throw new Error('Cannot find interaction');
			if (!interaction.guildId)
				throw new Error('Command was not sent from a server');
			try {
				let action;
				let payload;
				if (interaction.isAutocomplete()) {
					action = `${interaction.commandName}_autocomplete`;
				} else if (interaction.isStringSelectMenu()) {
					action = interaction.customId.replace('suno_optionselect_', '');
					payload = interaction.values[0];
				} else if (interaction.isButton()) {
					[action, payload] = interaction.customId.split(';');
				} else if (interaction.isModalSubmit()) {
					const [command, parameters] = interaction.customId.split(';');
					action = `submit_${command}`;
					payload = {
						lyricsId: parameters,
						lyrics: interaction.fields.getTextInputValue('lyrics'),
						tags: interaction.fields.getTextInputValue('tags'),
					};
				} else if (!interaction.isChatInputCommand()) {
					return;
				}
				await commandList.execute(
					interaction,
					this._client,
					this._audioService,
					action,
					payload
				);
			} catch (e: any) {
				Logger.error(e);
				if (e.code !== 10062) {
					if ('deferred' in interaction && interaction.deferred) {
						await interaction.editReply({ content: `⚠️ __${e.message}__ ⚠️` });
					} else {
						if ('reply' in interaction)
							await interaction.reply({
								content: `⚠️ __${e.message}__ ⚠️`,
								ephemeral: true,
							});
					}
				}
			}
		});

		await this._client.login(CONFIG.DISCORD_TOKEN);
	};

	start = async (commandList: CommandList) => {
		if (!commandList) throw new Error('No Discord commands configured');
		await this.register(commandList);
		await this._audioService.start();
	};

	constructor() {
		this._audioService = new AudioService();
	}
}

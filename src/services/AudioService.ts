import {
	AutocompleteInteraction,
	CommandInteraction,
	InteractionEditReplyOptions,
	MessagePayload,
	ModalSubmitInteraction,
	TextChannel,
} from 'discord.js';
import { SunoService } from './SunoService';
import {
	entersState,
	DiscordGatewayAdapterCreator,
	getVoiceConnection,
	joinVoiceChannel,
	VoiceConnection,
	VoiceConnectionStatus,
	PlayerSubscription,
} from '@discordjs/voice';
import { SunoPlayer } from '../model/SunoPlayer';
import { LocaleError, Loggers } from '@pekno/simple-discordbot';

export class AudioService {
	private _sunoPlayer: SunoPlayer;
	private _sunoService: SunoService;
	private _connection: VoiceConnection;
	private _audioSubscription: PlayerSubscription | undefined;

	constructor() {
		this._sunoService = new SunoService();
		this._sunoPlayer = new SunoPlayer(this.leaveVoiceChannel);
	}

	public start = async () => {
		await this._sunoService.init();
	};

	private joinVoiceChannel = async (interaction: CommandInteraction) => {
		const { channelId, guildId, guild, member } = interaction;

		if (!channelId) throw new LocaleError('error.audio.missing_channelId');
		if (!guildId || !guild)
			throw new LocaleError('error.audio.missing_guildId');

		const userId = member?.user?.id;
		if (!userId) throw new LocaleError('error.audio.missing_userId');

		const guildMember = await guild.members.fetch(userId);
		const voiceChannelId = guildMember.voice?.channelId;
		if (!voiceChannelId)
			throw new LocaleError('error.audio.missing_voice_channelId');

		await this._sunoPlayer.bindToChannel(
			(await interaction.channel?.client.channels.fetch(
				interaction.channelId
			)) as TextChannel
		);

		const existingConnection = getVoiceConnection(voiceChannelId);
		this._connection =
			existingConnection ||
			joinVoiceChannel({
				channelId: voiceChannelId,
				guildId,
				adapterCreator:
					guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
			});

		this.bindConnectionEvent(interaction);

		Loggers.get().info(
			`AUDIO SERVICE : JOIN VOICE CHANNEL - ${voiceChannelId}`
		);
	};

	private bindConnectionEvent = (interaction: CommandInteraction) => {
		// Bind audio player when connection is ready
		this._connection.removeAllListeners(VoiceConnectionStatus.Ready);
		this._connection.on(VoiceConnectionStatus.Ready, () => {
			this._audioSubscription = this._connection.subscribe(
				this._sunoPlayer.audioPlayer
			);
		});
		// Try to reconnect in case of disconnection, if can't destroy
		this._connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
		this._connection.on(VoiceConnectionStatus.Disconnected, async () => {
			try {
				Loggers.get().warn(`Problems with connection`);
				await Promise.race([
					entersState(
						this._connection,
						VoiceConnectionStatus.Signalling,
						5_000
					),
					entersState(
						this._connection,
						VoiceConnectionStatus.Connecting,
						5_000
					),
				]);
			} catch (error) {
				Loggers.get().error(error);
				this.leaveVoiceChannel();
				this.joinVoiceChannel(interaction);
			}
		});
	};

	private leaveVoiceChannel = () => {
		this._connection.destroy();
		if (this._audioSubscription) {
			this._audioSubscription.unsubscribe();
		}
		Loggers.get().info(`AUDIO SERVICE : LEFT VOICE CHANNEL`);
	};

	private handleInteraction = async <T>(
		interaction: CommandInteraction | ModalSubmitInteraction,
		action: (params?: T) => Promise<{
			performedAction: boolean;
			preventForceJoinVC: boolean;
			message: string | MessagePayload | InteractionEditReplyOptions;
			deleteTimeout?: number;
			onDeleteCallback?: () => void;
		}>
	): Promise<void> => {
		await interaction.deferReply({ ephemeral: true });
		const {
			performedAction,
			preventForceJoinVC,
			message,
			deleteTimeout,
			onDeleteCallback,
		} = await action();
		if (performedAction) {
			// Prevent joining again a VC in case the action can cause leaving
			if (!preventForceJoinVC || interaction instanceof ModalSubmitInteraction)
				await this.joinVoiceChannel(interaction as CommandInteraction);
			await interaction.editReply(message);
		} else {
			await interaction.editReply({
				content: `❌ Cannot perform action`,
			});
		}

		setTimeout(async () => {
			await interaction.deleteReply();
			if (onDeleteCallback) onDeleteCallback();
		}, deleteTimeout ?? 10_000);
	};

	play = async (interaction: CommandInteraction, sunoUrl: string | null) => {
		await this.handleInteraction(interaction, async () => {
			if (!sunoUrl) throw new LocaleError('error.audio.no_suno_url');
			const sunoId = this.extractSunoIdFromURL(sunoUrl);
			if (!sunoId) throw new LocaleError('error.audio.no_suno_id');

			const sunoClip = await this._sunoService.getClip(sunoId);
			this._sunoPlayer.play(sunoClip);

			return {
				performedAction: true,
				preventForceJoinVC: false,
				message: {
					content: `▶️ ${sunoClip.realTitle} added`,
				},
			};
		});
	};

	skip = async (interaction: CommandInteraction) => {
		await this.handleInteraction(interaction, async () => {
			const performedAction = await this._sunoPlayer.skip();
			return {
				performedAction,
				preventForceJoinVC: true,
				message: {
					content: `⏭ Skipped song`,
				},
			};
		});
	};

	pause = async (interaction: CommandInteraction) => {
		await this.handleInteraction(interaction, async () => {
			const performedAction = await this._sunoPlayer.pause();
			return {
				performedAction,
				preventForceJoinVC: false,
				message: {
					content: `⏸ Paused song`,
				},
			};
		});
	};

	resume = async (interaction: CommandInteraction) => {
		await this.handleInteraction(interaction, async () => {
			const performedAction = await this._sunoPlayer.resume();
			return {
				performedAction,
				preventForceJoinVC: false,
				message: {
					content: `▶️ Resumed song`,
				},
			};
		});
	};

	stop = async (interaction: CommandInteraction) => {
		await this.handleInteraction(interaction, async () => {
			const performedAction = await this._sunoPlayer.stop();
			return {
				performedAction,
				preventForceJoinVC: true,
				message: {
					content: `⏹ Stopped song`,
				},
			};
		});
	};

	getLocalProfiles = async (
		interaction: AutocompleteInteraction,
		filter: string
	) => {
		interaction.respond(this._sunoService.getProfileAutocomplete(filter));
	};

	profile = async (
		interaction: CommandInteraction,
		profileName: string | null
	) => {
		await interaction.deferReply({ ephemeral: true });
		if (!profileName)
			throw new LocaleError('error.audio.missing_field_profile');
		const sunoProfile = await this._sunoService.profile(profileName);
		await sunoProfile.sendPaginatedDiscordResponse(interaction);
	};

	private extractSunoIdFromURL = (url: string) => {
		const sunoThreadRegex = /^https:\/\/suno\.com\/song\/(([a-z0-9]+|-)+)/i;
		const match = url.match(sunoThreadRegex);

		if (match) {
			return match[1];
		} else {
			return null;
		}
	};
}

import {
	AutocompleteInteraction,
	CommandInteraction,
	InteractionEditReplyOptions,
	MessageFlags,
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

// Playback state of one Discord server, so servers don't share a queue, player message or voice connection
interface GuildAudio {
	player: SunoPlayer;
	connection?: VoiceConnection;
	subscription?: PlayerSubscription;
}

export class AudioService {
	private _sunoService: SunoService;
	private _guilds = new Map<string, GuildAudio>();

	constructor() {
		this._sunoService = new SunoService();
	}

	public start = async () => {
		await this._sunoService.init();
	};

	private getGuildAudio = (guildId: string | null): GuildAudio => {
		if (!guildId) throw new LocaleError('error.audio.missing_guildId');
		let guildAudio = this._guilds.get(guildId);
		if (!guildAudio) {
			guildAudio = {
				player: new SunoPlayer(() => this.leaveVoiceChannel(guildId)),
			};
			this._guilds.set(guildId, guildAudio);
		}
		return guildAudio;
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

		const guildAudio = this.getGuildAudio(guildId);
		await guildAudio.player.bindToChannel(
			(await interaction.channel?.client.channels.fetch(
				interaction.channelId
			)) as TextChannel
		);

		const connection =
			getVoiceConnection(guildId) ||
			joinVoiceChannel({
				channelId: voiceChannelId,
				guildId,
				adapterCreator:
					guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
			});
		guildAudio.connection = connection;

		this.bindConnectionEvent(guildId, connection, interaction);

		Loggers.get().info(
			`AUDIO SERVICE : JOIN VOICE CHANNEL - ${guildId} > ${voiceChannelId}`
		);
	};

	private bindConnectionEvent = (
		guildId: string,
		connection: VoiceConnection,
		interaction: CommandInteraction
	) => {
		const guildAudio = this.getGuildAudio(guildId);
		// Bind audio player when connection is ready
		connection.removeAllListeners(VoiceConnectionStatus.Ready);
		connection.on(VoiceConnectionStatus.Ready, () => {
			guildAudio.subscription = connection.subscribe(
				guildAudio.player.audioPlayer
			);
		});
		// Try to reconnect in case of disconnection, if can't destroy
		connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
		connection.on(VoiceConnectionStatus.Disconnected, async () => {
			try {
				Loggers.get().warn(`Problems with connection - ${guildId}`);
				await Promise.race([
					entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
					entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
				]);
			} catch (error) {
				Loggers.get().error(error);
				// A newer connection may already have replaced this one
				if (guildAudio.connection !== connection) return;
				this.leaveVoiceChannel(guildId);
				// Runs outside of any interaction handler, an unhandled rejection would stop the bot for every server
				this.joinVoiceChannel(interaction).catch((e) => Loggers.get().error(e));
			}
		});
	};

	private leaveVoiceChannel = (guildId: string) => {
		const guildAudio = this._guilds.get(guildId);
		if (!guildAudio) return;
		guildAudio.subscription?.unsubscribe();
		guildAudio.subscription = undefined;
		// Both stop() and the player going idle ask to leave, a connection can only be destroyed once
		if (
			guildAudio.connection &&
			guildAudio.connection.state.status !== VoiceConnectionStatus.Destroyed
		)
			guildAudio.connection.destroy();
		guildAudio.connection = undefined;
		Loggers.get().info(`AUDIO SERVICE : LEFT VOICE CHANNEL - ${guildId}`);
	};

	private handleInteraction = async (
		interaction: CommandInteraction | ModalSubmitInteraction,
		action: (sunoPlayer: SunoPlayer) => Promise<{
			performedAction: boolean;
			preventForceJoinVC: boolean;
			message: string | MessagePayload | InteractionEditReplyOptions;
			deleteTimeout?: number;
			onDeleteCallback?: () => void;
		}>
	): Promise<void> => {
		// Discord forgets interactions not acknowledged within 3 s (DiscordAPIError 10062), log late ones to see why
		const age = Date.now() - interaction.createdTimestamp;
		if (age > 2_000)
			Loggers.get().warn(
				`AUDIO SERVICE : ${interaction.id} handled ${age} ms after it was sent`
			);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { player } = this.getGuildAudio(interaction.guildId);
		const {
			performedAction,
			preventForceJoinVC,
			message,
			deleteTimeout,
			onDeleteCallback,
		} = await action(player);
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
		await this.handleInteraction(interaction, async (sunoPlayer) => {
			if (!sunoUrl) throw new LocaleError('error.audio.no_suno_url');
			const sunoId = await this._sunoService.resolveClipId(sunoUrl);
			if (!sunoId) throw new LocaleError('error.audio.no_suno_id');

			const sunoClip = await this._sunoService.getClip(sunoId);
			if (!(await this._sunoService.isPlayable(sunoClip)))
				throw new LocaleError('error.audio.no_audio_url');
			sunoPlayer.play(sunoClip);

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
		await this.handleInteraction(interaction, async (sunoPlayer) => {
			const performedAction = await sunoPlayer.skip();
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
		await this.handleInteraction(interaction, async (sunoPlayer) => {
			const performedAction = await sunoPlayer.pause();
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
		await this.handleInteraction(interaction, async (sunoPlayer) => {
			const performedAction = await sunoPlayer.resume();
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
		await this.handleInteraction(interaction, async (sunoPlayer) => {
			const performedAction = await sunoPlayer.stop();
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
		await interaction.respond(this._sunoService.getProfileAutocomplete(filter));
	};

	profile = async (
		interaction: CommandInteraction,
		profileName: string | null
	) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!profileName)
			throw new LocaleError('error.audio.missing_field_profile');
		const sunoProfile = await this._sunoService.profile(profileName);
		await sunoProfile.sendPaginatedDiscordResponse(interaction);
	};
}

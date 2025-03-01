import {
	ActionRowBuilder,
	AutocompleteInteraction,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	CommandInteraction,
	InteractionEditReplyOptions,
	MessagePayload,
	ModalBuilder,
	ModalSubmitInteraction,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import { OpenAIService } from './OpenAIService';
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
import { v4 } from 'uuid';
import { SunoPlayer } from '../model/SunoPlayer';
import { SunoSong } from '../model/SunoSong';
import { CONFIG } from '../config/config';
import { SunoClip } from '../model/SunoClip';
import { LocaleError, Loggers } from '@pekno/simple-discordbot';

export class AudioService {
	private _sunoPlayer: SunoPlayer;
	private _openAiService: OpenAIService | undefined;
	private _sunoService: SunoService;
	private _lyricsMap: Map<string, SunoSong>;
	private _connection: VoiceConnection;
	private _audioSubscription: PlayerSubscription | undefined;

	constructor() {
		if (CONFIG.OPENAI_API_KEY) this._openAiService = new OpenAIService();
		this._sunoService = new SunoService();
		this._lyricsMap = new Map<string, SunoSong>();
		this._sunoPlayer = new SunoPlayer(
			this.leaveVoiceChannel,
			this.incrementPlayCount
		);
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

	private incrementPlayCount = async (sunoClip: SunoClip): Promise<void> => {
		await this._sunoService.incrementPlayCount(sunoClip);
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

	generateLyrics = async (
		interaction: CommandInteraction,
		prompt: string | null
	) => {
		await this.handleInteraction(interaction, async () => {
			if (!prompt) throw new LocaleError('error.audio.missing_field_prompt');
			if (!this._openAiService) throw new LocaleError('error.audio.no_openai');
			const sunoSong =
				await this._openAiService.generateLyricsFromPrompt(prompt);

			const uuid = v4();
			const review = new ButtonBuilder()
				.setCustomId(`review_lyrics;lyricsId:=${uuid}`)
				.setLabel('Review')
				.setStyle(ButtonStyle.Primary);

			const abort = new ButtonBuilder()
				.setCustomId(`abort_lyrics;lyricsId:=${uuid}`)
				.setLabel('Abort')
				.setStyle(ButtonStyle.Secondary);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				review,
				abort
			);
			this._lyricsMap.set(uuid, sunoSong);

			return {
				performedAction: true,
				preventForceJoinVC: true,
				message: {
					content: `Your Lyrics for "${sunoSong.title}" are ready`,
					components: [row],
				},
				deleteTimeout: 3600_000,
				onDeleteCallback: () => {
					this._lyricsMap.delete(uuid);
				},
			};
		});
	};

	abortLyrics = async (interaction: ButtonInteraction, lyricsId: string) => {
		await interaction.deferReply({ ephemeral: true });
		const sunoSong = this._lyricsMap.get(lyricsId);
		if (!sunoSong) throw new LocaleError('error.audio.no_sunosong');
		await interaction.editReply({
			content: `Aborted lyrics from "${sunoSong.title}"`,
		});
		this._lyricsMap.delete(lyricsId);
	};

	reviewLyrics = async (interaction: ButtonInteraction, lyricsId: string) => {
		const sunoSong = this._lyricsMap.get(lyricsId);
		if (!sunoSong) throw new LocaleError('error.audio.no_sunosong');
		const modal = new ModalBuilder()
			.setCustomId(`prompt_modal;lyricsId:=${lyricsId}`)
			.setTitle(`${sunoSong.title}`);

		const lyricsTextFieldInput = new TextInputBuilder()
			.setCustomId('lyrics')
			.setLabel('Lyrics :')
			.setPlaceholder(`Lyrics`)
			.setValue(sunoSong.lyrics)
			.setRequired(true)
			.setStyle(TextInputStyle.Paragraph);

		const tagsTextFieldInput = new TextInputBuilder()
			.setCustomId('tags')
			.setLabel('Tags :')
			.setPlaceholder(`Tags`)
			.setValue(sunoSong.styles.join(','))
			.setRequired(true)
			.setStyle(TextInputStyle.Short);

		modal.addComponents([
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				lyricsTextFieldInput
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				tagsTextFieldInput
			),
		]);

		await interaction.showModal(modal);
	};

	generateSong = async (
		interaction: ModalSubmitInteraction,
		lyricsId: string,
		lyrics?: string,
		tags?: string
	) => {
		await this.handleInteraction(interaction, async () => {
			if (!lyrics) throw new LocaleError('error.audio.no_lyrics');
			if (!tags) throw new LocaleError('error.audio.no_tags');
			const sunoSong = this._lyricsMap.get(lyricsId);
			if (!sunoSong) throw new LocaleError('error.audio.no_sunosong');
			sunoSong.title = `${sunoSong.title} by @${interaction.user.username}`;
			sunoSong.lyrics = lyrics;
			sunoSong.styles = tags.split(', ');

			const sunoCLips = await this._sunoService.generateSong(sunoSong, true);
			for (const clip of sunoCLips) {
				this._sunoPlayer.play(clip);
			}

			return {
				performedAction: true,
				preventForceJoinVC: true,
				message: {
					content: `⏺ Added ${sunoCLips.map((c) => c.realTitle).join(',')}`,
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

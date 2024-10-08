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
import { Logger } from './PinoLogger';
import { v4 } from 'uuid';
import { SunoPlayer } from '../model/SunoPlayer';
import { SunoSong } from '../model/SunoSong';
import { CONFIG } from '../config/config';

export class AudioService {
	private _sunoPlayer: SunoPlayer;
	private _openAiService: OpenAIService | undefined;
	private _sunoService: SunoService;
	private _lyricsMap: Map<string, SunoSong>;
	private _connection: VoiceConnection;
	private _audioSubscription: PlayerSubscription | undefined;

	constructor() {
		this._sunoPlayer = new SunoPlayer(this.leaveVoiceChannel);
		if (CONFIG.OPENAI_API_KEY) this._openAiService = new OpenAIService();
		this._sunoService = new SunoService();
		this._lyricsMap = new Map<string, SunoSong>();
	}

	public start = async () => {
		await this._sunoService.init();
	};

	private joinVoiceChannel = async (interaction: CommandInteraction) => {
		const { channelId, guildId, guild, member } = interaction;

		if (!channelId) throw new Error('Cannot find channelId');
		if (!guildId || !guild) throw new Error('Cannot find guildId');

		const userId = member?.user?.id;
		if (!userId) throw new Error('Cannot find userId');

		const guildMember = await guild.members.fetch(userId);
		const voiceChannelId = guildMember.voice?.channelId;
		if (!voiceChannelId) throw new Error('Cannot find voiceChannelId');

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

		Logger.info(`AUDIO SERVICE : JOIN VOICE CHANNEL - ${voiceChannelId}`);
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
				Logger.warn(`Problems with connection`);
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
				Logger.error(error);
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
		Logger.info(`AUDIO SERVICE : LEFT VOICE CHANNEL`);
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
			if (!sunoUrl) throw new Error('No suno URL given');
			const sunoId = this.extractSunoIdFromURL(sunoUrl);
			if (!sunoId) throw new Error('No suno ID found in URL');

			const sunoClip = await this._sunoService.loadSong(sunoId);
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
			if (!prompt) throw new Error('No suno URL given');
			const canGenerate = await this._sunoService.canGenerate();
			if (!canGenerate)
				throw new Error('No more SUNO credit to generate music');
			// TODO : add check for OpenAI credits

			if (!this._openAiService) throw new Error('Open AI Service is not setup');
			const sunoSong =
				await this._openAiService.generateLyricsFromPrompt(prompt);

			const uuid = v4();
			const review = new ButtonBuilder()
				.setCustomId(`review_lyrics;${uuid}`)
				.setLabel('Review')
				.setStyle(ButtonStyle.Primary);

			const abort = new ButtonBuilder()
				.setCustomId(`abort_lyrics;${uuid}`)
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
					content: `Your Lyrics for "${sunoSong.title}" is ready`,
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
		const lyrics = this._lyricsMap.get(lyricsId);
		if (!lyrics) throw new Error('No Lyrics with this ID');
		await interaction.editReply({
			content: `Aborted lyrics from "${lyrics.title}"`,
		});
		this._lyricsMap.delete(lyricsId);
	};

	reviewLyrics = async (interaction: ButtonInteraction, lyricsId: string) => {
		const lyrics = this._lyricsMap.get(lyricsId);
		if (!lyrics) throw new Error('No Lyrics with this ID');
		const modal = new ModalBuilder()
			.setCustomId(`prompt_modal;${lyricsId}`)
			.setTitle(`${lyrics.title}`);

		const lyricsTextFieldInput = new TextInputBuilder()
			.setCustomId('lyrics')
			.setLabel('Lyrics :')
			.setPlaceholder(`Lyrics`)
			.setValue(lyrics.lyrics)
			.setRequired(true)
			.setStyle(TextInputStyle.Paragraph);

		const tagsTextFieldInput = new TextInputBuilder()
			.setCustomId('tags')
			.setLabel('Tags :')
			.setPlaceholder(`Tags`)
			.setValue(lyrics.styles.join(','))
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
		payload: {
			lyricsId: string;
			lyrics: string;
			tags: string;
		}
	) => {
		await this.handleInteraction(interaction, async () => {
			const lyrics = this._lyricsMap.get(payload.lyricsId);
			if (!lyrics) throw new Error('No Lyrics with this ID');
			lyrics.lyrics = payload.lyrics;
			lyrics.styles = payload.tags.split(', ');

			const sunoCLips = await this._sunoService.generateSong(lyrics, true);
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
		if (!profileName) throw new Error('No Suno profile name given');
		const sunoProfile = await this._sunoService.profile(profileName);

		let isFirst = true;
		for (const response of sunoProfile.buildResponses()) {
			if (isFirst) {
				await interaction.editReply(response);
			} else {
				await interaction.followUp({ ...response, ephemeral: true });
			}
			isFirst = false;
		}
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

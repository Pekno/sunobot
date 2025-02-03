import { AudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import { SunoQueue } from './SunoQueue';
import { SunoClip } from './SunoClip';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	Message,
	TextChannel,
} from 'discord.js';
import i18n from 'i18n';
import { Loggers } from '@pekno/simple-discordbot';

export class SunoPlayer {
	private _alreadyPlayedSunoQueue: SunoQueue;
	private _sunoQueue: SunoQueue;
	private _audioPlayer: AudioPlayer;
	private _currentSunoClip: SunoClip | null;
	private _playerMessage: Message | null;
	private _channel: TextChannel | null;
	private _leaveVoiceChannel: () => void;
	private _incrementPlayCount: (sunoClip: SunoClip) => Promise<void>;

	private next = () => {
		if (this._currentSunoClip) {
			this._alreadyPlayedSunoQueue.push(this._currentSunoClip);
		}
		this._currentSunoClip = null;
		if (this._sunoQueue.isEmpty()) {
			this._leaveVoiceChannel();
			return;
		}

		this._currentSunoClip = this._sunoQueue.shift();
		this.audioPlayer.play(this._currentSunoClip.audioResource);
		// No need to await just to increment playcount
		this._incrementPlayCount(this._currentSunoClip).catch((e) =>
			Loggers.get().error(e)
		);
	};

	play = (sunoClip: SunoClip) => {
		this._sunoQueue.push(sunoClip);

		if (!this._currentSunoClip) {
			this.next();
		}
	};

	skip = () => {
		if (this._sunoQueue.isEmpty() && this.status !== AudioPlayerStatus.Playing)
			return false;

		this._audioPlayer.stop();
		return true;
	};

	stop = () => {
		if (this._sunoQueue.isEmpty() && this.status !== AudioPlayerStatus.Playing)
			return false;

		this._sunoQueue.clear();
		this._audioPlayer.stop();

		if (this._sunoQueue.isEmpty()) {
			if (this._currentSunoClip) {
				this._alreadyPlayedSunoQueue.push(this._currentSunoClip);
			}
			this._currentSunoClip = null;
			this._leaveVoiceChannel();
		}
		return true;
	};

	pause = () => {
		if (this._sunoQueue.isEmpty() && this.status !== AudioPlayerStatus.Playing)
			return false;

		this._audioPlayer.pause();
		return true;
	};

	resume = () => {
		if (this._sunoQueue.isEmpty() && this.status !== AudioPlayerStatus.Paused)
			return false;

		this._audioPlayer.unpause();
		return true;
	};

	get audioPlayer(): AudioPlayer {
		return this._audioPlayer;
	}

	get status(): AudioPlayerStatus {
		return this._audioPlayer.state.status;
	}

	get playerText(): string {
		switch (this.status) {
			case AudioPlayerStatus.Buffering:
				return `⏺ ${i18n.__('display.player.status.buffering')}`;
			case AudioPlayerStatus.Idle:
				return `⏹ ${i18n.__('display.player.status.stopped')}`;
			case AudioPlayerStatus.AutoPaused:
			case AudioPlayerStatus.Paused:
				return `⏸ ${i18n.__('display.player.status.paused')}`;
			case AudioPlayerStatus.Playing:
				return `▶️ ${i18n.__('display.player.status.playing')} `;
		}
	}

	buildEmbed = () => {
		let embed: EmbedBuilder;
		if (!this._currentSunoClip) {
			embed = new EmbedBuilder()
				.setTitle(`💤 ${i18n.__('display.player._default.header')} 💤`)
				.setThumbnail(
					'https://cdn.discordapp.com/avatars/1258764433182953514/58fa56a071f5efc68e04cd0a97ad8d32.webp?size=80'
				)
				.setDescription(`🔇 ${i18n.__('display.player._default.description')}`)
				.setURL(`https://suno.com/`);
		} else {
			embed = this._currentSunoClip?.buildEmbed();
			embed.setDescription(`${embed.data.description}\n${this.playerText}`);
		}
		this._alreadyPlayedSunoQueue
			.top()
			.forEach((sc) => embed.addFields(sc.buildField(false, true)));
		this._sunoQueue
			.top()
			.forEach((sc, index) =>
				embed.addFields(sc.buildField(index == 0, false))
			);
		return embed;
	};

	private updatePlayer = (isDisabled: boolean = false) => {
		if (this._playerMessage) {
			Loggers.get().info(`PLAYER : UPDATE PLAYER EMBED`);
			this._playerMessage.edit({
				embeds: [this.buildEmbed()],
				components: [this.buildPlayerButton(isDisabled)],
			});
		}
	};

	bindToChannel = async (textChannel: TextChannel) => {
		this.updatePlayer();
		if (!this._playerMessage) {
			if (this._channel && textChannel.id == this._channel.id) return;
			this._channel = textChannel;
			this._playerMessage = await this._channel.send({
				embeds: [this.buildEmbed()],
				components: [this.buildPlayerButton(false)],
			});
			Loggers.get().info(
				`PLAYER : CREATE PLAYER MESSAGE - ${this._playerMessage.id}`
			);
		}
	};

	buildPlayerButton = (
		isDisabled: boolean
	): ActionRowBuilder<ButtonBuilder> => {
		const buttons = [
			{
				name: 'resume',
				icon: '▶️',
				isDisabled: this.status === AudioPlayerStatus.Playing,
			},
			{
				name: 'pause',
				icon: '⏸',
				isDisabled: this.status === AudioPlayerStatus.Paused,
			},
			{
				name: 'stop',
				icon: '⏹',
			},
			{
				name: 'skip',
				icon: '⏭',
				isDisabled: this._sunoQueue.isEmpty(),
			},
		];

		return new ActionRowBuilder<ButtonBuilder>().addComponents(
			buttons.map((b) =>
				new ButtonBuilder()
					.setCustomId(`sunoplayer_${b.name}`)
					.setLabel(`${b.icon}`)
					.setStyle(ButtonStyle.Primary)
					.setDisabled(
						isDisabled ||
							b.isDisabled ||
							(this._sunoQueue.isEmpty() &&
								this.status === AudioPlayerStatus.Idle)
					)
			)
		);
	};

	constructor(
		leaveVoiceChannel: () => void,
		incrementPlayCount: (sunoClip: SunoClip) => Promise<void>
	) {
		this._sunoQueue = new SunoQueue();
		this._alreadyPlayedSunoQueue = new SunoQueue();
		this._audioPlayer = new AudioPlayer();
		this._incrementPlayCount = incrementPlayCount;
		this._leaveVoiceChannel = () => {
			leaveVoiceChannel();
			if (!this._playerMessage) return;
			Loggers.get().info(
				`PLAYER : DELETE PLAYER MESSAGE - ${this._playerMessage.id}`
			);
			//this._playerMessage.delete();
			this.updatePlayer(true);
			this._playerMessage = null;
			this._channel = null;
			this._alreadyPlayedSunoQueue = new SunoQueue();
		};

		this._audioPlayer.on('stateChange', async (oldState, newState) => {
			Loggers.get().info(
				`PLAYER : STATE CHANGE FROM ${oldState.status.toUpperCase()} TO ${newState.status.toUpperCase()} - ${this._currentSunoClip?.id ?? ''}`
			);
			switch (newState.status) {
				case AudioPlayerStatus.Idle:
					this.next();
			}
			this.updatePlayer();
		});

		this._audioPlayer.on('error', (e) => {
			Loggers.get().error(e);
		});
	}
}

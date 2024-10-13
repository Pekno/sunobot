// PaginatedEmbed.ts
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	Message,
	ComponentType,
	StringSelectMenuBuilder,
	BaseMessageOptions,
	CommandInteraction,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { SunoClipList } from './SunoClipList';

const TIMEOUT = 3600_000;

export class PaginatedEmbed<T extends SunoClipList> {
	private clipList: T;
	private embeds: EmbedBuilder[] = [];
	private options: StringSelectMenuOptionBuilder[][] = [];
	private currentPage: number = 0;

	constructor(clipList: T) {
		this.clipList = clipList;
		this.createEmbeds();
	}

	private createEmbeds() {
		const chunkSize = 25; // Discord's maximum fields per embed
		for (let i = 0; i < this.clipList.display_clips.length; i += chunkSize) {
			const chunk = this.clipList.display_clips.slice(i, i + chunkSize);
			const fieldChunk = chunk.map((sc) => sc.buildEmbedFieldList());
			const embed = this.clipList
				.buildBaseEmbed()
				.setFields(fieldChunk)
				.setFooter({
					text: `Page ${i / chunkSize + 1} / ${Math.ceil(this.clipList.display_clips.length / chunkSize)}`,
				})
				.setTimestamp();
			this.embeds.push(embed);
			const optionsChunk = chunk.map((sc) => sc.buildOptionsField());
			this.options.push(optionsChunk);
		}
	}

	public async send(mainInteraction: CommandInteraction) {
		if (!mainInteraction) throw new Error('Interaction is undefined');

		const response: BaseMessageOptions = {
			embeds: [this.embeds[this.currentPage]],
			components: this.getActionRow(),
		};
		let message: Message;
		if (mainInteraction.isRepliable() && !mainInteraction.replied) {
			message = await mainInteraction.editReply(response);
		} else {
			message = await mainInteraction.followUp({
				...response,
				ephemeral: true,
			});
		}
		this.createCollector(mainInteraction, message);
	}

	private createCollector(
		mainInteraction: CommandInteraction,
		message: Message
	) {
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: TIMEOUT,
			filter: (i) => i.user.id === mainInteraction.user.id,
		});

		collector.on('collect', async (interaction) => {
			if (!interaction.isButton()) return;

			switch (interaction.customId) {
				case 'prev':
					this.currentPage--;
					break;
				case 'next':
					this.currentPage++;
					break;
				default:
					return;
			}

			await interaction.update({
				embeds: [this.embeds[this.currentPage]],
				components: this.getActionRow(),
			});
		});
	}

	// Refactored method to avoid duplicating button creation logic
	private getActionRow(
		isDisabled: boolean = false
	): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
		const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] =
			[];
		if (this.embeds.length > 1) {
			rows.push(
				new ActionRowBuilder<
					ButtonBuilder | StringSelectMenuBuilder
				>().addComponents(
					this.createButton('prev', '⬅️', this.currentPage === 0 || isDisabled),
					this.createButton(
						'next',
						'➡️',
						this.currentPage === this.embeds.length - 1 || isDisabled
					)
				)
			);
			rows.push(
				new ActionRowBuilder<
					ButtonBuilder | StringSelectMenuBuilder
				>().addComponents(this.createSelectMenu())
			);
		}
		return rows;
	}

	private createSelectMenu(): StringSelectMenuBuilder {
		return new StringSelectMenuBuilder()
			.setCustomId('suno_optionselect_play')
			.setPlaceholder('Select a song')
			.addOptions(this.options[this.currentPage]);
	}

	private createButton(
		customId: string,
		icon: string,
		disabled: boolean
	): ButtonBuilder {
		return new ButtonBuilder()
			.setCustomId(customId)
			.setEmoji(icon)
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled);
	}
}

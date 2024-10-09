import {
	ActionRowBuilder,
	BaseMessageOptions,
	EmbedBuilder,
	StringSelectMenuBuilder,
} from 'discord.js';
import { SunoClip } from './SunoClip';
import { CONFIG } from '../config/config';

export abstract class SunoClipList {
	abstract get id(): string;
	abstract get upvote_count(): number;
	abstract get title(): string;
	abstract get image_url(): string;
	abstract get num_total_results(): number;
	abstract get play_count(): number;
	abstract get click_url(): string;
	abstract get display_clips(): SunoClip[];

	embedIcon: string;

	get maxPage(): number {
		return Math.ceil(this.display_clips.length / CONFIG.PAGE_SIZE);
	}

	private getClipPerPage = (pageNumber: number): SunoClip[] => {
		return this.display_clips.slice(
			CONFIG.PAGE_SIZE * pageNumber,
			CONFIG.PAGE_SIZE + CONFIG.PAGE_SIZE * pageNumber
		);
	};

	get discordResponse(): BaseMessageOptions[] {
		const responses: BaseMessageOptions[] = [];
		for (let currentPage = 0; currentPage < this.maxPage; currentPage++) {
			const currentClips = this.getClipPerPage(currentPage);

			const embed = new EmbedBuilder();
			embed.setDescription(`\u200B`);
			if (currentPage === 0) {
				embed
					.setTitle(`${this.embedIcon} ${this.title}`)
					.setDescription(
						`${this.num_total_results} 💿 | ${this.play_count} 👂 | ${this.upvote_count} 👍`
					)
					.setThumbnail(this.image_url)
					.setURL(this.click_url);
			}
			embed.addFields(currentClips.map((sc) => sc.buildEmbedFieldList()));

			const options = new StringSelectMenuBuilder()
				.setCustomId('suno_optionselect_play')
				.setPlaceholder('Select a song')
				.addOptions(currentClips.map((c) => c.buildOptionsField()));
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				options
			);

			responses.push({
				embeds: [embed],
				components: [row],
			});
		}

		return responses;
	}
}

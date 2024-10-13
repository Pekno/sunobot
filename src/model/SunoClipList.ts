import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { SunoClip } from './SunoClip';
import { PaginatedEmbed } from './PaginatedEmbed';

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

	public async sendPaginatedDiscordResponse(
		interaction: CommandInteraction
	): Promise<void> {
		const paginatedResponse = new PaginatedEmbed(this);
		await paginatedResponse.send(interaction);
	}

	buildBaseEmbed = (): EmbedBuilder => {
		return new EmbedBuilder()
			.setTitle(`${this.embedIcon} ${this.title}`)
			.setDescription(
				`${this.num_total_results} 💿 | ${this.play_count} 👂 | ${this.upvote_count} 👍`
			)
			.setThumbnail(this.image_url)
			.setURL(this.click_url);
	};
}

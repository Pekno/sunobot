import {
	ActionRowBuilder,
	BaseMessageOptions,
	EmbedBuilder,
	StringSelectMenuBuilder,
} from 'discord.js';
import { SunoClip } from './SunoClip';

const max_fields_per_embed = 25;

export class SunoProfile {
	user_id: string;
	display_name: string;
	handle: string;
	profile_description: string;
	clips: SunoClip[]; // Assuming you have a SunoClip type defined elsewhere
	stats: {
		upvote_count__sum: number;
		play_count__sum: number;
		followers_count: number;
		following_count: number;
	};
	is_flagged: boolean;
	is_following: boolean;
	num_total_clips: number;
	current_page: number;
	playlists: any[]; // You can replace `any` with a specific playlist interface if you have it
	avatar_image_url: string;
	favorite_songs: any[]; // Same for favorite songs, replace `any` with a specific type if needed

	public buildResponses = (): BaseMessageOptions[] => {
		const totalEmbed = Math.ceil(this.clips.length / max_fields_per_embed);
		const embeds = this.buildEmbeds(totalEmbed);
		const rows = this.buildOptionRows(totalEmbed);
		return embeds.map((embed, index) => ({
			embeds: [embed],
			components: [rows[index]],
		}));
	};

	private buildOptionRows = (
		totalEmbed: number
	): ActionRowBuilder<StringSelectMenuBuilder>[] => {
		const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
		for (let currentEmbed = 0; currentEmbed < totalEmbed; currentEmbed++) {
			const options = new StringSelectMenuBuilder()
				.setCustomId('suno_optionselect_play')
				.setPlaceholder('Select a song')
				.addOptions(
					this.clips
						.slice(25 * currentEmbed, 25 + 25 * currentEmbed)
						.map((c) => c.buildOptionsField())
				);
			rows.push(
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(options)
			);
		}
		return rows;
	};

	private buildEmbeds = (totalEmbed: number): EmbedBuilder[] => {
		const embeds: EmbedBuilder[] = [];
		for (let currentEmbed = 0; currentEmbed < totalEmbed; currentEmbed++) {
			const embed = new EmbedBuilder();
			embed.setDescription(`\u200B`);
			if (currentEmbed === 0) {
				embed
					.setTitle(`🎤 ${this.display_name} 🎶`)
					.setThumbnail(this.avatar_image_url)
					.setDescription(
						`${this.num_total_clips} 💿 | ${this.stats.play_count__sum} 👂 | ${this.stats.upvote_count__sum} 👍`
					)
					.setURL(`https://suno.com/@${this.handle}`);
			}
			embed.addFields(
				this.clips
					.slice(25 * currentEmbed, 25 + 25 * currentEmbed)
					.map((c) => c.buildEmbedFieldList())
			);
			embeds.push(embed);
		}
		return embeds;
	};

	public constructor(init?: Partial<SunoClip>) {
		Object.assign(this, init);
	}
}

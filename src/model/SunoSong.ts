import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

export class SunoSong {
	title: string;
	lyrics: string;
	styles: string[];

	public constructor(init?: Partial<SunoSong>) {
		Object.assign(this, init);
	}

	static getGPTObject() {
		return zodResponseFormat(
			z.object({
				title: z.string(),
				lyrics: z.string(),
				styles: z.array(z.string()),
			}),
			'event'
		);
	}

	static fromJSON(jsonData: string): SunoSong {
		return JSON.parse(jsonData) as SunoSong;
	}
}

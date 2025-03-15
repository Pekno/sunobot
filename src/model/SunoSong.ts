export class SunoSong {
	title: string;
	lyrics: string;
	styles: string[];

	public constructor(init?: Partial<SunoSong>) {
		Object.assign(this, init);
	}

	static fromJSON(jsonData: string): SunoSong {
		return JSON.parse(jsonData) as SunoSong;
	}
}

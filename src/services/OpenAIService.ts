import OpenAI from 'openai';
import { SunoSong } from '../model/SunoSong';
import { CONFIG } from '../config/config';
import { LocaleError, Loggers } from '@pekno/simple-discordbot';

const getLang = (lang: string): string => {
	switch (lang.toUpperCase()) {
		case 'FR':
			return 'French';
		case 'EN':
			return 'English';
		case 'ES':
			return 'Spanish';
		case 'DE':
			return 'German';
		case 'IT':
			return 'Italian';
		case 'PT':
			return 'Portuguese';
		case 'RU':
			return 'Russian';
		case 'ZH':
			return 'Chinese';
		case 'JA':
			return 'Japanese';
		case 'KO':
			return 'Korean';
		case 'AR':
			return 'Arabic';
		case 'HI':
			return 'Hindi';
		case 'BN':
			return 'Bengali';
		case 'UR':
			return 'Urdu';
		case 'TR':
			return 'Turkish';
		case 'VI':
			return 'Vietnamese';
		case 'NL':
			return 'Dutch';
		case 'SV':
			return 'Swedish';
		case 'PL':
			return 'Polish';
		case 'FI':
			return 'Finnish';
		case 'DA':
			return 'Danish';
		case 'NO':
			return 'Norwegian';
		case 'EL':
			return 'Greek';
		case 'HE':
			return 'Hebrew';
		case 'TH':
			return 'Thai';
		case 'ID':
			return 'Indonesian';
		case 'MS':
			return 'Malay';
		case 'FA':
			return 'Persian';
		case 'UK':
			return 'Ukrainian';
		case 'RO':
			return 'Romanian';
		case 'HU':
			return 'Hungarian';
		case 'CS':
			return 'Czech';
		case 'SK':
			return 'Slovak';
		case 'BG':
			return 'Bulgarian';
		case 'HR':
			return 'Croatian';
		case 'SR':
			return 'Serbian';
		case 'LT':
			return 'Lithuanian';
		case 'LV':
			return 'Latvian';
		case 'ET':
			return 'Estonian';
		case 'IS':
			return 'Icelandic';
		case 'GA':
			return 'Irish';
		case 'MT':
			return 'Maltese';
		case 'SL':
			return 'Slovenian';
		case 'CA':
			return 'Catalan';
		case 'AF':
			return 'Afrikaans';
		case 'SW':
			return 'Swahili';
		default:
			return 'completely imaginary language';
	}
};

export class OpenAIService {
	private _openai: OpenAI;
	private _lang: string;

	constructor() {
		this._openai = new OpenAI();
		if (!CONFIG.LOCALE) throw new LocaleError('error.openai.cant_find_lang');
		this._lang = getLang(CONFIG.LOCALE);
	}

	generateLyricsFromPrompt = async (prompt: string): Promise<SunoSong> => {
		// TODO : add check for OpenAI credits
		Loggers.get().debug(`OPEN_AI : GENERATING FROM PROMPT- ${prompt}`);
		const completion = await this._openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: CONFIG.OPENAI_PROMPT.replaceAll('${lang}', this._lang),
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			response_format: SunoSong.getGPTObject(),
		});
		if (!completion.choices[0].message.content)
			throw new LocaleError('error.openai.cant_get_song');
		const sunoSong = SunoSong.fromJSON(completion.choices[0].message.content);
		Loggers.get().debug(
			`OPEN_AI : GOT LYRICS - ${JSON.stringify(sunoSong, null, 2)}`
		);
		return sunoSong;
	};
}

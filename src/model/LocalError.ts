import i18n, { Replacements } from 'i18n';

export class LocaleError extends Error {
	constructor(i18nKey: string, i18nArgs?: Replacements) {
		let message: string;
		if (i18nArgs) {
			message = i18n.__(i18nKey, i18nArgs);
		} else {
			message = i18n.__(i18nKey);
		}
		super(message);
		Object.setPrototypeOf(this, LocaleError.prototype);
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

import pino from 'pino';
import { CONFIG } from '../config/config';

export const Logger = pino({
	transport: {
		targets: [
			{
				level: CONFIG.LOG_LEVEL,
				target: 'pino-pretty',
				options: {
					colorize: true,
				},
			},
			{
				level: 'trace',
				target: 'pino-pretty',
				options: {
					translateTime: 'SYS:mm-dd-yyyy hh:mm:ss TT',
					destination: './pino-logger.log',
					colorize: false,
				},
			},
		],
	},
});

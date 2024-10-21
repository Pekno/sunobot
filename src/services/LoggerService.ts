import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import { CONFIG } from '../config/config';
import path from 'path';

const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level}]: ${message}`;
});

export const Logger = createLogger({
	level: CONFIG.LOG_LEVEL,
	format: combine(timestamp(), logFormat),
	transports: [
		new transports.Console({
			format: combine(colorize(), logFormat),
		}),
		new transports.DailyRotateFile({
			filename: path.resolve(__dirname, '../logs/winston-logger-%DATE%.log'),
			datePattern: 'YYYY-MM-DD',
			zippedArchive: true,
			maxFiles: '30d',
		}),
	],
});

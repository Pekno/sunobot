import { SunoClip } from './SunoClip';

export class SunoQueue {
	private _queue: SunoClip[];

	isEmpty = () => !this._queue.length;

	push = (song: SunoClip) => this._queue.push(song);

	clear = () => (this._queue = []);

	shift = () => {
		const res = this._queue[0];
		this._queue.shift();
		return res;
	};

	top = (itemNumber: number = 10) => {
		return this._queue.slice(0, itemNumber);
	};

	constructor() {
		this._queue = [];
	}
}

import { SunoClip } from './SunoClip';
import { SunoClipMetadata } from './SunoClipMetadata';

export interface SunoData {
	id: string;
	clips: SunoClip[];
	metadata: SunoClipMetadata;
	major_model_version: string;
	status: string;
	created_at: string;
	batch_size: number;
}

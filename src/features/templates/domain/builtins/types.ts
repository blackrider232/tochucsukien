import type { TemplateKind, TemplateLevel } from '../../contract';
import type { BuiltinId } from './ids';

/** A template that ships in code. `content` is raw legacy HTML with {{TAGS}}; it is sanitized when listed. */
export interface BuiltinTemplate {
  readonly id: BuiltinId;
  readonly level: TemplateLevel;
  /** Document symbol such as 'KH-UBND'. Empty for the nine internal forms. */
  readonly code: string;
  readonly kind: TemplateKind;
  readonly title: string;
  readonly description: string;
  readonly content: string;
}

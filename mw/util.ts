import type {CodeMirror} from './codemirror';

export interface Parameter {
	label: string | null;
	description: string | null;
	required: boolean;
	deprecated: boolean;
	aliases: string[];
}
export interface TemplateData {
	title: string;
	description?: string;
	params: Record<string, Parameter>;
}

export const templateData = new Map<string, TemplateData | undefined>();

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
export const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

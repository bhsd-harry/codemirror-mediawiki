import type {CodeMirror} from './codemirror';

export interface Parameter {
	label: string | null;
	description: string | null;
	required: boolean;
	suggested: boolean;
	deprecated: boolean;
	aliases: string[];
}
export interface TemplateData {
	title: string;
	description?: string;
	params: Record<string, Parameter>;
}

export const templateData = new Map<string, TemplateData | undefined>();

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror | undefined>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
export const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

/**
 * 获取父页面路径
 * @param title 页面标题
 * @param length 父页面层级
 */
export const getParentDir = (title: string, length: number): string | false => {
	const parts = title.split('/'),
		level = length / 3;
	return level < parts.length && parts.slice(0, -level).join('/');
};

import type {ConfigData} from 'wikiparser-node';
import type {editor} from 'monaco-editor';
import type {MwConfig} from './token';
import type {CodeMirror6} from './codemirror';

/**
 * 加载CodeMirror的mediawiki模块需要的设置
 * @param modes tagModes
 */
export type MwConfigGetter = (modes: Record<string, string>) => Promise<MwConfig>;
export declare const getMwConfig: MwConfigGetter;

/**
 * 将MwConfig转换为Config
 * @param minConfig 基础Config
 * @param mwConfig
 */
export type ParserConfigGetter = (minConfig: ConfigData, mwConfig: MwConfig) => ConfigData;
export declare const getParserConfig: ParserConfigGetter;

export interface CodeMirrorOptions {
	ns?: number | undefined;
	page?: string | undefined;
	extensions?: string[] | undefined;
}

export declare class CodeMirror extends CodeMirror6 {
	readonly editor: editor.IStandaloneCodeEditor | undefined;
	static readonly instances: WeakMap<HTMLTextAreaElement, CodeMirror | undefined>;
	static fromTextArea(
		textarea: HTMLTextAreaElement,
		lang?: string | null,
		options?: CodeMirrorOptions,
	): Promise<CodeMirror>;
}

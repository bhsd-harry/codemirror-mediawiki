import type {ConfigData} from 'wikiparser-node';
import type {MwConfig} from './token';

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

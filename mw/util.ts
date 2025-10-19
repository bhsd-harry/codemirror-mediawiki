import type {CodeMirror} from './codemirror';

export const instances = new WeakMap<HTMLTextAreaElement, CodeMirror>();

/**
 * 获取CodeMirror实例
 * @param $ele textarea元素的jQuery对象
 */
export const getInstance = ($ele: JQuery<HTMLTextAreaElement>): CodeMirror => instances.get($ele[0]!)!;

export const CDN = 'https://testingcf.jsdelivr.net';

declare interface Require {
	config(config: {paths?: Record<string, string>}): void;

	(modules: string[], ready: (exports: unknown) => unknown): void;
}

declare interface Obj {
	[x: string]: Obj | undefined;
}

declare global {
	const define: unknown;
}

/**
 * 使用传统方法加载脚本
 * @param src 脚本地址
 * @param globalConst 脚本全局变量名
 * @param amd 是否兼容 AMD
 */
export const loadScript = (src: string, globalConst: string, amd?: boolean): Promise<void> => new Promise(resolve => {
	const path = `${CDN}/${src}`;
	let obj: Obj | undefined = window as unknown as Obj;
	for (const prop of globalConst.split('.')) {
		obj = obj?.[prop];
	}
	if (obj) {
		resolve();
	} else if (amd && typeof define === 'function' && 'amd' in define) {
		const requirejs = window.require as unknown as Require;
		requirejs.config({paths: {[globalConst]: path}});
		requirejs([globalConst], (exports: unknown) => {
			Object.assign(window, {[globalConst]: exports});
			resolve();
		});
	} else {
		const script = document.createElement('script');
		script.src = path;
		script.onload = (): void => {
			resolve();
		};
		document.head.append(script);
	}
});

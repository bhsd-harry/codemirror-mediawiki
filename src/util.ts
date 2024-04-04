export const CDN = 'https://testingcf.jsdelivr.net';

/**
 * 使用传统方法加载脚本
 * @param src 脚本地址
 * @param globalConst 脚本全局变量名
 * @param amd 是否兼容 AMD
 */
export const loadScript = (src: string, globalConst: string, amd?: boolean): Promise<void> => new Promise(resolve => {
	const path = `${CDN}/${src}`;
	if (globalConst in window) {
		resolve();
	} else if (amd && typeof define === 'function' && 'amd' in define) {
		require.config({paths: {[globalConst]: path}});
		require([globalConst], (exports: unknown) => {
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

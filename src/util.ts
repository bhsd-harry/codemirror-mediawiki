export const CDN = 'https://testingcf.jsdelivr.net';

/**
 * 使用传统方法加载脚本
 * @param src 脚本地址
 * @param globalConst 脚本全局变量名
 */
export const loadScript = (src: string, globalConst: string): Promise<void> => new Promise(resolve => {
	if (globalConst in window) {
		resolve();
		return;
	}
	const script = document.createElement('script');
	script.src = `${CDN}/${src}`;
	script.onload = (): void => {
		resolve();
	};
	document.head.append(script);
});

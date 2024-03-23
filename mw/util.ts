// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getObject = (key: string): any => JSON.parse(String(localStorage.getItem(key)));
export const setObject = (key: string, value: unknown): void => {
	localStorage.setItem(key, JSON.stringify(value));
};

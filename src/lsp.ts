import {LSPClient, languageServerSupport} from '@codemirror/lsp-client';
import type {Extension} from '@codemirror/state';
import type {Transport} from '@codemirror/lsp-client';

let promise: Promise<Transport | null> | undefined,
	file = 0;

export default async (): Promise<Extension> => {
	if (location.hostname !== 'localhost') {
		return [];
	}
	promise ??= new Promise<Transport | null>(resolve => {
		let handlers: ((value: string) => void)[] = [];
		const ws = new WebSocket('ws://localhost:3000/wikitext');
		ws.onmessage = ({data}): void => {
			for (const handler of handlers) {
				handler(String(data));
			}
		};
		ws.onopen = (): void => {
			resolve({
				send(message) {
					ws.send(message);
				},
				subscribe(handler) {
					handlers.push(handler);
				},
				unsubscribe(handler) {
					handlers = handlers.filter(h => h !== handler);
				},
			});
		};
		ws.onerror = (): void => {
			resolve(null);
		};
	});
	const transport = await promise;
	return transport ? languageServerSupport(new LSPClient().connect(transport), `file:///${file++}.wiki`) : [];
};

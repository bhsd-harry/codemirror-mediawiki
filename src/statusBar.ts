import {showPanel} from '@codemirror/view';
import {nextDiagnostic, setDiagnosticsEffect} from '@codemirror/lint';
import type {EditorView} from '@codemirror/view';
import type {Diagnostic} from '@codemirror/lint';

declare type Severity = 'error' | 'warning';

function getLintMarker(view: EditorView, severity: Severity): HTMLDivElement;
function getLintMarker(view: EditorView, severity: 'fix', handler: () => void): HTMLDivElement;
function getLintMarker(view: EditorView, severity: Severity | 'fix', handler?: () => void): HTMLDivElement {
	const marker = document.createElement('div'),
		icon = document.createElement('div');
	marker.className = `cm-status-${severity}`;
	if (severity === 'fix') {
		const menu = document.createElement('div');
		menu.className = 'cm-status-fix-menu';
		menu.textContent = 'Fix all auto-fixable problems';
		menu.tabIndex = -1;
		menu.addEventListener('click', handler!);
		menu.addEventListener('focusout', () => {
			menu.style.display = 'none';
		});
		view.dom.append(menu);
		icon.className = 'cm-status-fix-disabled';
		marker.title = 'Fix all';
		marker.append(icon);
		marker.addEventListener('click', ({clientX, clientY}) => {
			if (icon.className === 'cm-status-fix-enabled') {
				const {bottom, left} = view.dom.getBoundingClientRect();
				menu.style.bottom = `${bottom - clientY + 5}px`;
				menu.style.left = `${clientX - 20 - left}px`;
				menu.style.display = 'block';
				menu.focus();
			}
		});
	} else {
		icon.className = `cm-lint-marker-${severity}`;
		const count = document.createElement('div');
		count.textContent = '0';
		marker.append(icon, count);
		marker.addEventListener('click', () => {
			nextDiagnostic(view);
			view.focus();
		});
	}
	return marker;
}

const updateDiagnosticsCount = (diagnostics: readonly Diagnostic[], s: Severity, marker: HTMLDivElement): void => {
	marker.lastChild!.textContent = String(diagnostics.filter(({severity}) => severity === s).length);
};

const updateDiagnosticMessage = (
	view: EditorView,
	diagnostics: readonly Diagnostic[],
	head: number,
	message: HTMLDivElement,
): void => {
	const diagnostic = diagnostics.find(({from, to}) => from <= head && to >= head);
	if (diagnostic) {
		message.textContent = diagnostic.message;
		if (diagnostic.actions) {
			message.append(...diagnostic.actions.map(({name, apply}) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'cm-diagnosticAction';
				button.textContent = name;
				button.addEventListener('click', e => {
					e.preventDefault();
					apply(view, diagnostic.from, diagnostic.to);
				});
				return button;
			}));
		}
	} else {
		message.textContent = '';
	}
};

const fixAll = (diagnostics: readonly Diagnostic[]): Diagnostic | undefined =>
	diagnostics.find(({severity}) => severity === 'custom' as Severity);

export default showPanel.of(view => {
	let diagnostics: readonly Diagnostic[] = [];
	const handler = (): void => {
		view.dispatch({
			changes: {from: 0, to: view.state.doc.length, insert: fixAll(diagnostics)!.message},
		});
		view.focus();
	};
	const dom = document.createElement('div'),
		worker = document.createElement('div'),
		message = document.createElement('div'),
		error = getLintMarker(view, 'error'),
		warning = getLintMarker(view, 'warning'),
		fix = getLintMarker(view, 'fix', handler);
	worker.className = 'cm-status-worker';
	worker.append(error, warning, fix);
	message.className = 'cm-status-message';
	dom.className = 'cm-panel cm-panel-status';
	dom.append(worker, message);
	return {
		dom,
		update({state: {selection: {main: {head}}}, transactions, docChanged, selectionSet}): void {
			for (const tr of transactions) {
				for (const effect of tr.effects) {
					if (effect.is(setDiagnosticsEffect)) {
						diagnostics = effect.value;
						const fixable = Boolean(fixAll(diagnostics)),
							{classList} = fix.firstChild as HTMLDivElement;
						classList.toggle('cm-status-fix-enabled', fixable);
						classList.toggle('cm-status-fix-disabled', !fixable);
						updateDiagnosticsCount(diagnostics, 'error', error);
						updateDiagnosticsCount(diagnostics, 'warning', warning);
						updateDiagnosticMessage(view, diagnostics, head, message);
					}
				}
			}
			if (docChanged || selectionSet) {
				updateDiagnosticMessage(view, diagnostics, head, message);
			}
		},
	};
});

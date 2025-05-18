import {showPanel} from '@codemirror/view';
import {nextDiagnostic, setDiagnosticsEffect} from '@codemirror/lint';
import type {EditorView} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {LintSource} from './codemirror';

declare type Severity = 'error' | 'warning';

function getLintMarker(view: EditorView, severity: Severity): HTMLDivElement;
function getLintMarker(view: EditorView, severity: 'fix', menu: HTMLDivElement): HTMLDivElement;
function getLintMarker(view: EditorView, severity: Severity | 'fix', menu?: HTMLDivElement): HTMLDivElement {
	const marker = document.createElement('div'),
		icon = document.createElement('div');
	marker.className = `cm-status-${severity}`;
	if (severity === 'fix') {
		icon.className = 'cm-status-fix-disabled';
		marker.title = 'Fix all';
		marker.append(icon);
		marker.addEventListener('click', ({clientX, clientY}) => {
			if (icon.className === 'cm-status-fix-enabled') {
				const {bottom, left} = view.dom.getBoundingClientRect();
				menu!.style.bottom = `${bottom - clientY + 5}px`;
				menu!.style.left = `${clientX - 20 - left}px`;
				menu!.style.display = 'block';
				menu!.focus();
			}
		});
	} else {
		icon.className = `cm-lint-marker-${severity}`;
		const count = document.createElement('div');
		count.textContent = '0';
		marker.append(icon, count);
		marker.addEventListener('click', () => {
			if (marker.parentElement?.classList.contains('cm-status-worker-enabled')) {
				nextDiagnostic(view);
				view.focus();
			}
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
	option?: HTMLDivElement,
): void => {
	if (option) {
		option.style.display = 'none';
	}
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
			if (option) {
				const rule = / \(([^()]+)\)$/u.exec(diagnostic.message)?.[1];
				if (rule) {
					option.textContent = `Fix all ${rule} problems`;
					option.dataset['rule'] = rule;
					option.style.display = 'block';
				}
			}
		}
	} else {
		message.textContent = '';
	}
};

const fixAll = (diagnostics: readonly Diagnostic[]): Diagnostic | undefined =>
	diagnostics.find(({severity}) => severity === 'custom' as Severity);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default (fixer: LintSource['fixer']): Extension => showPanel.of(view => {
	let diagnostics: readonly Diagnostic[] = [];
	const dom = document.createElement('div'),
		worker = document.createElement('div'),
		message = document.createElement('div'),
		position = document.createElement('div'),
		error = getLintMarker(view, 'error'),
		warning = getLintMarker(view, 'warning'),
		menu = document.createElement('div'),
		option = document.createElement('div'),
		option2 = document.createElement('div'),
		fix = getLintMarker(view, 'fix', menu);
	option.textContent = 'Fix all auto-fixable problems';
	option.addEventListener('click', (): void => {
		view.dispatch({
			changes: {from: 0, to: view.state.doc.length, insert: fixAll(diagnostics)!.message},
		});
		view.focus();
	});
	option2.style.display = 'none';
	if (fixer) {
		option2.addEventListener('click', () => {
			(async () => {
				const {doc} = view.state,
					output = await fixer(doc, option2.dataset['rule']!);
				if (output !== doc.toString()) {
					view.dispatch({
						changes: {from: 0, to: doc.length, insert: output},
					});
				}
				view.focus();
			})();
		});
	}
	menu.className = 'cm-status-fix-menu';
	menu.tabIndex = -1;
	menu.append(option, option2);
	menu.addEventListener('focusout', () => {
		menu.style.display = 'none';
	});
	view.dom.append(menu);
	worker.className = 'cm-status-worker';
	worker.append(error, warning, fix);
	message.className = 'cm-status-message';
	position.className = 'cm-status-line';
	position.textContent = '0:0';
	dom.className = 'cm-panel cm-panel-status';
	dom.append(worker, message, position);
	return {
		dom,
		update({state: {selection: {main: {head, anchor}}, doc}, transactions, docChanged, selectionSet}): void {
			for (const tr of transactions) {
				for (const effect of tr.effects) {
					if (effect.is(setDiagnosticsEffect)) {
						diagnostics = effect.value;
						const fixable = Boolean(fixAll(diagnostics)),
							{classList} = fix.firstChild as HTMLDivElement;
						classList.toggle('cm-status-fix-enabled', fixable);
						classList.toggle('cm-status-fix-disabled', !fixable);
						worker.classList.toggle('cm-status-worker-enabled', diagnostics.length > 0);
						updateDiagnosticsCount(diagnostics, 'error', error);
						updateDiagnosticsCount(diagnostics, 'warning', warning);
						updateDiagnosticMessage(view, diagnostics, head, message, fixer && option2);
					}
				}
			}
			if (docChanged || selectionSet) {
				updateDiagnosticMessage(view, diagnostics, head, message, fixer && option2);
				const {number, from} = doc.lineAt(head);
				position.textContent = `${number}:${head - from}`;
				if (anchor !== head) {
					position.textContent += ` (${Math.abs(head - anchor)})`;
				}
			}
		},
	};
});

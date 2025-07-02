import {showPanel} from '@codemirror/view';
import {nextDiagnostic, setDiagnosticsEffect} from '@codemirror/lint';
import type {EditorView} from '@codemirror/view';
import type {Extension, SelectionRange} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {LintSource} from './codemirror';

declare type Severity = 'error' | 'warning';

function getLintMarker(view: EditorView, severity: Severity): HTMLDivElement;
function getLintMarker(view: EditorView, severity: 'fix', menu?: HTMLDivElement): HTMLDivElement;
function getLintMarker(view: EditorView, severity: Severity | 'fix', menu?: HTMLDivElement): HTMLDivElement {
	const marker = document.createElement('div'),
		icon = document.createElement('div');
	marker.className = `cm-status-${severity}`;
	if (severity === 'fix') {
		icon.className = 'cm-status-fix-disabled';
		marker.title = 'Fix all';
		marker.append(icon);
		if (menu) {
			marker.addEventListener('click', ({clientX, clientY}) => {
				if (icon.className === 'cm-status-fix-enabled') {
					const {bottom, left} = view.dom.getBoundingClientRect();
					menu.style.bottom = `${bottom - clientY + 5}px`;
					menu.style.left = `${clientX - 20 - left}px`;
					menu.style.display = 'block';
					menu.focus();
				}
			});
		}
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

const hasFix = (diagnostic: Diagnostic): boolean | undefined => diagnostic.actions?.some(({name}) => name === 'fix');

const updateDiagnosticMessage = (
	view: EditorView,
	allDiagnostics: readonly Diagnostic[],
	main: SelectionRange,
	msg: HTMLDivElement,
	menu?: HTMLDivElement,
): void => {
	const diagnostics = allDiagnostics.filter(({from, to}) => from <= main.to && to >= main.from),
		diagnostic = diagnostics.find(({from, to}) => from <= main.head && to >= main.head) ?? diagnostics[0];
	if (diagnostic) {
		msg.textContent = diagnostic.message;
		if (diagnostic.actions) {
			msg.append(...diagnostic.actions.map(({name, apply}) => {
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
		msg.textContent = '';
	}
	if (menu) {
		menu.replaceChildren(
			...[
				...new Set(
					diagnostics.filter(hasFix)
						.map(({message}) => / \(([^()]+)\)$/u.exec(message)?.[1])
						.filter(Boolean) as string[],
				),
			].map(rule => {
				const option = document.createElement('div');
				option.textContent = `Fix all ${rule} problems`;
				option.dataset['rule'] = rule;
				return option;
			}),
			menu.lastChild!,
		);
	}
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default (fixer: LintSource['fixer']): Extension => showPanel.of(view => {
	let diagnostics: readonly Diagnostic[] = [],
		menu: HTMLDivElement | undefined;
	if (fixer) {
		const optionAll = document.createElement('div');
		optionAll.textContent = 'Fix all auto-fixable problems';
		menu = document.createElement('div');
		menu.className = 'cm-status-fix-menu';
		menu.tabIndex = -1;
		menu.append(optionAll);
		menu.addEventListener('click', ({target}) => {
			if (target === menu) {
				return;
			}
			(async () => {
				const {doc} = view.state,
					output = await fixer(doc, (target as HTMLDivElement).dataset['rule']);
				if (output !== doc.toString()) {
					view.dispatch({
						changes: {from: 0, to: doc.length, insert: output},
					});
				}
				view.focus();
			})();
		});
		menu.addEventListener('focusout', () => {
			menu!.style.display = 'none';
		});
		view.dom.append(menu);
	}
	const dom = document.createElement('div'),
		worker = document.createElement('div'),
		message = document.createElement('div'),
		position = document.createElement('div'),
		error = getLintMarker(view, 'error'),
		warning = getLintMarker(view, 'warning'),
		fix = getLintMarker(view, 'fix', menu);
	worker.className = 'cm-status-worker';
	worker.append(error, warning, fix);
	message.className = 'cm-status-message';
	position.className = 'cm-status-line';
	position.textContent = '0:0';
	dom.className = 'cm-panel cm-panel-status';
	dom.append(worker, message, position);
	return {
		dom,
		update({state: {selection: {main}, doc, readOnly}, transactions, docChanged, selectionSet}): void {
			for (const tr of transactions) {
				for (const effect of tr.effects) {
					if (effect.is(setDiagnosticsEffect)) {
						diagnostics = effect.value;
						const fixable = !readOnly && Boolean(fixer) && diagnostics.some(hasFix),
							{classList} = fix.firstChild as HTMLDivElement;
						classList.toggle('cm-status-fix-enabled', fixable);
						classList.toggle('cm-status-fix-disabled', !fixable);
						worker.classList.toggle('cm-status-worker-enabled', diagnostics.length > 0);
						updateDiagnosticsCount(diagnostics, 'error', error);
						updateDiagnosticsCount(diagnostics, 'warning', warning);
						updateDiagnosticMessage(view, diagnostics, main, message, menu);
					}
				}
			}
			if (docChanged || selectionSet) {
				updateDiagnosticMessage(view, diagnostics, main, message, menu);
				const {number, from} = doc.lineAt(main.head);
				position.textContent = `${number}:${main.head - from}`;
				if (!main.empty) {
					position.textContent += ` (${main.to - main.from})`;
				}
			}
		},
	};
});

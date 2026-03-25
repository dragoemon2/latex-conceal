import * as assert from 'assert';
import * as vscode from 'vscode';
import { initializeConcealConfig, loadCustomReplacementsFromDocument } from '../core/conceal';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('loadCustomReplacementsFromDocument parses nested braces in newcommand body', () => {
		const config = initializeConcealConfig();
		const text = String.raw`\newcommand{\p}{\mathfrak{p}}
\p`;

		const replacements = loadCustomReplacementsFromDocument(text, config);
		assert.strictEqual(replacements['\\p'], '𝔭');
	});

	test('loadCustomReplacementsFromDocument parses nested braces in DeclareMathOperator body', () => {
		const config = initializeConcealConfig();
		const text = String.raw`\DeclareMathOperator{\End}{\operatorname{End}}`;

		const replacements = loadCustomReplacementsFromDocument(text, config);
		assert.strictEqual(replacements['\\End'], 'operatorname{End}');
	});
});

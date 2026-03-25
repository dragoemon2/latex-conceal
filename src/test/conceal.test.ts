import { applyConcealTokensToText, getConcealTokens, initializeConcealConfig } from '../core/conceal';

async function readInputText(): Promise<string> {
	const argvText = process.argv.slice(2).join(' ');
	if (argvText.length > 0) {
		return argvText;
	}

	if (process.stdin.isTTY) {
		return '';
	}

	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8').trimEnd();
}

async function main() {
	const text = await readInputText();
	if (text.length === 0) {
		console.error('Usage: node out/test/conceal-debug.js "<text>"');
		console.error('   or: echo "<text>" | node out/test/conceal-debug.js');
		process.exitCode = 1;
		return;
	}

	const config = initializeConcealConfig();
	const tokens = getConcealTokens(text, config);
	const applied = applyConcealTokensToText(text, tokens);

	console.log('Input:');
	console.log(text);
	console.log('');
	console.log('getConcealTokens result:');
	console.log(JSON.stringify(tokens, null, 2));
	console.log('');
	console.log('applyConcealTokensToText result:');
	console.log(applied);
}

void main();
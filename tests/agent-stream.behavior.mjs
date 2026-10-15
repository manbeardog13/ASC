import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Evaluate only the pure assembler; never initialize Deno, auth or model requests.
const source = readFileSync(process.env.ASC_EDGE_FILE || new URL('../supabase/functions/asc-agent/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('function createAssembler()');
// The function ends at its unindented closing brace. Do not include later
// module-level constants/imports, which initialize provider configuration.
const closing = start < 0 ? -1 : source.indexOf('\n}\n', start);
const end = closing < 0 ? -1 : closing + 3;
assert.ok(start >= 0 && end > start, 'Locate the pure Gemini stream assembler');
const code = stripTypeScriptTypes(source.slice(start, end));
function assembler() {
  const context = vm.createContext({Date});
  vm.runInContext(code + '\nvar assembler = createAssembler();', context);
  return context.assembler;
}

test('same-name parallel tool calls preserve both argument sets and their signatures', () => {
  const asm = assembler();
  asm.pushCall('get_set', {code: 'ASC-ONE'}, 'signature-one');
  asm.pushCall('get_set', {code: 'ASC-TWO'}, 'signature-two');
  assert.equal(asm.blocks.length, 2);
  assert.notEqual(asm.blocks[0].id, asm.blocks[1].id);
  assert.equal(asm.blocks[0].input.code, 'ASC-ONE');
  assert.equal(asm.blocks[1].input.code, 'ASC-TWO');
  assert.equal(asm.blocks[0]._sig, 'signature-one');
  assert.equal(asm.blocks[1]._sig, 'signature-two');
});

test('text and distinct calls retain stream order across text segments', () => {
  const asm = assembler();
  asm.pushText('Provjeravam.');
  asm.pushCall('get_set', {code: 'ASC-ONE'});
  asm.pushCall('get_set', {code: 'ASC-TWO'});
  asm.pushText('Gotovo.');
  assert.deepEqual(Array.from(asm.blocks, block => block.type), ['text', 'tool_use', 'tool_use', 'text']);
  assert.equal(asm.blocks[0].text, 'Provjeravam.');
  assert.equal(asm.blocks[3].text, 'Gotovo.');
});

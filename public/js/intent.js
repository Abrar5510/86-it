// Kitchen command grammar: final transcript -> kitchen action, or null for chatter.
// This is the station's instant lane: it acts on the final transcript without waiting for the LLM, which still
// speaks the reply and handles anything the grammar doesn't match. Every rule is anchored on a command word
// ("fire", "86", "all day"…) so ordinary talk ("my locker is number twelve", "the salmon looks good") matches nothing.
// Limitation: fixed phrasings only. Unmatched speech falls through to the LLM; eval/commands.json is the test set.
import { matchItem, norm } from './match.js';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// Speech-to-text homophones, only trusted where a number is expected ("fire for" = fire 4).
const SOUNDS_LIKE = { for: 4, fore: 4, to: 2, too: 2, ate: 8, won: 1 };

// "eighty six the fish" -> "86 the fish"; "twenty-one" -> "21".
function digits(text) {
  const out = [];
  for (const w of norm(String(text).replace(/['’]s\b/gi, ' is').replace(/['’]/g, '')).split(' ')) {
    const n = ONES.indexOf(w);
    const t = TENS.indexOf(w);
    const prev = out.at(-1);
    if (n >= 1 && n <= 9 && /^[2-9]0$/.test(prev)) out[out.length - 1] = String(Number(prev) + n);
    else if (n >= 0) out.push(String(n));
    else if (t >= 2) out.push(String(t * 10));
    else out.push(w);
  }
  return out.join(' ');
}

const N = '(\\d+|for|fore|to|too|ate|won)';
const TABLE = `(?:table |number )?${N}`;
const num = (s) => (s in SOUNDS_LIKE ? SOUNDS_LIKE[s] : Number(s));
const clip = (s) => s.replace(/^(?:the|our|on|of) /, '').replace(/ (?:please|chef|now|all day|left|on the fly)$/, '').trim();

// [pattern, build(match) -> action]. First match wins; order matters (un-86 before 86, all day before how many).
const TABLE_RULES = [
  [new RegExp(`\\bfire ${TABLE}\\b`), (m) => ({ type: 'fire_ticket', table: num(m[1]) })],
  [new RegExp(`\\bhold ${TABLE}\\b`), (m) => ({ type: 'hold_ticket', table: num(m[1]) })],
  [new RegExp(`\\b(?:bump|sold) ${TABLE}\\b`), (m) => ({ type: 'bump_ticket', table: num(m[1]) })],
  [new RegExp(`^${TABLE} (?:is |s )?up$`), (m) => ({ type: 'bump_ticket', table: num(m[1]) })],
  // "12 is off" — off the fire, i.e. away. Anchored to a bare table so chatter can't reach it.
  [new RegExp(`^${TABLE} (?:is |s )?off$`), (m) => ({ type: 'bump_ticket', table: num(m[1]) })],
  [new RegExp(`^${TABLE} (?:is )?out the window$`), (m) => ({ type: 'bump_ticket', table: num(m[1]) })],
  [new RegExp(`\\b(?:void|kill) ${TABLE}\\b`), (m) => ({ type: 'void_ticket', table: num(m[1]), confirmed: false })],
  [new RegExp(`^${TABLE} (?:has|got) (?:an? )?(.+?) allergy$`), (m) => ({ type: 'flag_allergy', table: num(m[1]), allergen: m[2] })],
  [new RegExp(`\\ballergy (?:on|for) ${TABLE}(?: (.+))?$`), (m) => ({ type: 'flag_allergy', table: num(m[1]), allergen: m[2] || 'allergy' })],
  [new RegExp(`\\bhow long (?:on |for )?${TABLE}\\b`), (m) => ({ type: 'ticket_status', table: num(m[1]) })],
  [new RegExp(`\\b(?:wheres |where is |status (?:on |of )?)${TABLE}\\b`), (m) => ({ type: 'ticket_status', table: num(m[1]) })],
];

// Item rules. `strict` rules start with a command word, so an unknown item is still a command
// ("86 the lobster" -> "Which item?"). Loose rules only fire when the item is on the menu.
const ITEM_RULES = [
  [/\bun ?86 (.+)$/, (item) => ({ type: 'restore_item', item }), true],
  [/^(.+?) (?:is |are |s )?back(?: on)?$/, (item) => ({ type: 'restore_item', item }), false],
  [/^86 (?:on )?(.+)$/, (item) => ({ type: 'mark_86', item, remaining: 0 }), true],
  [/\b(?:were |we are |were all )?out of (.+)$/, (item) => ({ type: 'mark_86', item, remaining: 0 }), false],
  [/\bno more (.+)$/, (item) => ({ type: 'mark_86', item, remaining: 0 }), false],
  [/\ball day (?:on )?(.+)$/, (item) => ({ type: 'all_day', item }), true],
  [/^(?:how many )?(.+?) all day$/, (item) => ({ type: 'all_day', item }), false],
  [/\bhow many (.+?) (?:left|remaining|do we have)$/, (item) => ({ type: 'inventory_lookup', item }), false],
  [/\bcount on (.+)$/, (item) => ({ type: 'inventory_lookup', item }), true],
];
const COUNT_LEFT = [
  new RegExp(`^(?:only |just )?${N} (.+?) left$`), // "two short rib left"
  new RegExp(`^(?:only |just |last )?(.+?) ${N} left$`), // "last brownie one left"
];

const YES = /^(?:yes|yeah|yep|yup|confirm|confirmed|do it|void it)\b/;
const NO = /^(?:no|nope|cancel|keep it|dont)\b/;

// pending: the void awaiting a yes/no, or null. Returns { action } | { reply } | null.
export function parse(text, items, pending = null) {
  const s = digits(text);
  if (!s) return null;
  if (pending?.type === 'void_ticket') {
    if (YES.test(s)) return { action: { ...pending, confirmed: true } };
    if (NO.test(s)) return { reply: 'Kept.' };
  }
  for (const [re, build] of TABLE_RULES) {
    const m = s.match(re);
    if (m) return { action: build(m) };
  }
  for (const [re, build, strict] of ITEM_RULES) {
    const m = s.match(re);
    if (!m) continue;
    const item = clip(m[1]);
    if (strict || matchItem(items, item).item) return { action: build(item) };
  }
  for (const [i, re] of COUNT_LEFT.entries()) {
    const m = s.match(re);
    if (!m) continue;
    const [n, item] = i === 0 ? [m[1], m[2]] : [m[2], m[1]];
    if (matchItem(items, clip(item)).item) return { action: { type: 'mark_86', item: clip(item), remaining: num(n) } };
  }
  return null;
}

import { academicProfileStorageKey } from './academicProfileScope.js';
import { CODE_MATRIX_MAX_CODE } from './codeMatrixWorkspace.js';

export const CODE_MATRIX_PRACTICE_LANGUAGES = Object.freeze(['python', 'javascript', 'c', 'cpp', 'java']);

// Starters read the input only. Students supply every calculation and output.
function createStarters(shape) {
  const inputs = {
    pair: {
      python: 'a, b = map(int, input().split())',
      javascript: 'const [a, b] = readLine().trim().split(/\\s+/).map(Number);',
      c: '    long long a, b;\n    scanf("%lld %lld", &a, &b);',
      cpp: '    long long a, b;\n    std::cin >> a >> b;',
      java: '        long a = input.nextLong();\n        long b = input.nextLong();',
    },
    triple: {
      python: 'a, b, c = map(int, input().split())',
      javascript: 'const [a, b, c] = readLine().trim().split(/\\s+/).map(Number);',
      c: '    long long a, b, c;\n    scanf("%lld %lld %lld", &a, &b, &c);',
      cpp: '    long long a, b, c;\n    std::cin >> a >> b >> c;',
      java: '        long a = input.nextLong();\n        long b = input.nextLong();\n        long c = input.nextLong();',
    },
    integer: {
      python: 'n = int(input())',
      javascript: 'const n = Number(readLine());',
      c: '    long long n;\n    scanf("%lld", &n);',
      cpp: '    long long n;\n    std::cin >> n;',
      java: '        long n = input.nextLong();',
    },
    word: {
      python: 'word = input().strip()',
      javascript: 'const word = readLine().trim();',
      c: '    char word[101];\n    scanf("%100s", word);',
      cpp: '    std::string word;\n    std::cin >> word;',
      java: '        String word = input.next();',
    },
    array: {
      python: 'n = int(input())\nvalues = list(map(int, input().split()))',
      javascript: 'const n = Number(readLine());\nconst values = readLine().trim().split(/\\s+/).map(Number);',
      c: '    int n;\n    long long values[20];\n    scanf("%d", &n);\n    for (int i = 0; i < n; i++) {\n        scanf("%lld", &values[i]);\n    }',
      cpp: '    int n;\n    std::cin >> n;\n    std::vector<long long> values(n);\n    for (int i = 0; i < n; i++) {\n        std::cin >> values[i];\n    }',
      java: '        int n = input.nextInt();\n        long[] values = new long[n];\n        for (int i = 0; i < n; i++) {\n            values[i] = input.nextLong();\n        }',
    },
  }[shape];
  return Object.freeze({
    python: `${inputs.python}\n\n# TODO: Write your logic and print the required output.\n`,
    javascript: `${inputs.javascript}\n\n// TODO: Write your logic and print the required output with console.log().\n`,
    c: `#include <stdio.h>\n#include <string.h>\n#include <ctype.h>\n\nint main(void) {\n${inputs.c}\n\n    // TODO: Write your logic and print the required output.\n    return 0;\n}\n`,
    cpp: `#include <iostream>\n#include <string>\n#include <vector>\n#include <algorithm>\n\nint main() {\n${inputs.cpp}\n\n    // TODO: Write your logic and print the required output.\n    return 0;\n}\n`,
    java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner input = new Scanner(System.in);\n${inputs.java}\n\n        // TODO: Write your logic and print the required output.\n    }\n}\n`,
  });
}

function question({ shape, cases, ...details }) {
  const testCases = Object.freeze(cases.map(([input, expectedOutput], index) => Object.freeze({
    id: `${details.id}-${index + 1}`, input, expectedOutput,
  })));
  return Object.freeze({
    ...details,
    version: 1,
    difficulty: 'Easy',
    constraints: Object.freeze(details.constraints),
    supportedLanguages: CODE_MATRIX_PRACTICE_LANGUAGES,
    starters: createStarters(shape),
    testCases,
    examples: Object.freeze(testCases.slice(0, 2)),
  });
}

export const CODE_MATRIX_PRACTICE_QUESTIONS = Object.freeze([
  question({
    id: 'sum-two-numbers', title: 'Sum of two numbers', topic: 'Arithmetic', shape: 'pair',
    statement: 'Read two integers and print their sum.',
    inputFormat: 'One line containing two space-separated integers a and b.',
    outputFormat: 'Print one integer: the sum of a and b.',
    constraints: ['-1,000 ≤ a, b ≤ 1,000'],
    cases: [['2 3\n', '5\n'], ['-4 7\n', '3\n'], ['0 0\n', '0\n'], ['-9 -6\n', '-15\n'], ['1000 -1000\n', '0\n']],
  }),
  question({
    id: 'even-or-odd', title: 'Even or odd', topic: 'Conditions', shape: 'integer',
    statement: 'Read an integer. Print EVEN if it is even, or ODD if it is odd.',
    inputFormat: 'One line containing an integer n.',
    outputFormat: 'Print exactly EVEN or ODD, using uppercase letters.',
    constraints: ['-10,000 ≤ n ≤ 10,000'],
    cases: [['8\n', 'EVEN\n'], ['7\n', 'ODD\n'], ['0\n', 'EVEN\n'], ['-3\n', 'ODD\n'], ['-10\n', 'EVEN\n']],
  }),
  question({
    id: 'largest-of-three', title: 'Largest of three', topic: 'Conditions', shape: 'triple',
    statement: 'Read three integers and print the largest value. Values can be equal.',
    inputFormat: 'One line containing three space-separated integers a, b, and c.',
    outputFormat: 'Print one integer: the largest of the three values.',
    constraints: ['-1,000 ≤ a, b, c ≤ 1,000'],
    cases: [['3 9 5\n', '9\n'], ['-8 -2 -5\n', '-2\n'], ['4 4 4\n', '4\n'], ['10 0 -10\n', '10\n'], ['-1 2 9\n', '9\n']],
  }),
  question({
    id: 'sum-first-n', title: 'Sum from 1 to N', topic: 'Loops', shape: 'integer',
    statement: 'Read a non-negative integer n and print the sum of every integer from 1 to n. For n = 0, print 0.',
    inputFormat: 'One line containing a non-negative integer n.',
    outputFormat: 'Print the sum as a single integer.',
    constraints: ['0 ≤ n ≤ 1,000'],
    cases: [['5\n', '15\n'], ['1\n', '1\n'], ['0\n', '0\n'], ['10\n', '55\n'], ['1000\n', '500500\n']],
  }),
  question({
    id: 'factorial', title: 'Factorial', topic: 'Loops', shape: 'integer',
    statement: 'Read a non-negative integer n and print n factorial, the product of every integer from 1 to n. The factorial of 0 is 1.',
    inputFormat: 'One line containing a non-negative integer n.',
    outputFormat: 'Print n factorial as a single integer.',
    constraints: ['0 ≤ n ≤ 12'],
    cases: [['4\n', '24\n'], ['0\n', '1\n'], ['1\n', '1\n'], ['6\n', '720\n'], ['12\n', '479001600\n']],
  }),
  question({
    id: 'reverse-word', title: 'Reverse a word', topic: 'Strings', shape: 'word',
    statement: 'Read a word and print its characters in reverse order. Keep the original letter case.',
    inputFormat: 'One line containing a word with no spaces.',
    outputFormat: 'Print the reversed word on one line.',
    constraints: ['1 ≤ word length ≤ 100', 'The word contains only English letters.'],
    cases: [['hello\n', 'olleh\n'], ['Code\n', 'edoC\n'], ['a\n', 'a\n'], ['level\n', 'level\n'], ['abcdef\n', 'fedcba\n']],
  }),
  question({
    id: 'palindrome', title: 'Is it a palindrome?', topic: 'Strings', shape: 'word',
    statement: 'A palindrome reads the same forwards and backwards. Read a word and print YES if it is a palindrome, otherwise print NO.',
    inputFormat: 'One line containing a lowercase word with no spaces.',
    outputFormat: 'Print exactly YES or NO, using uppercase letters.',
    constraints: ['1 ≤ word length ≤ 100', 'The word contains only lowercase English letters.'],
    cases: [['level\n', 'YES\n'], ['hello\n', 'NO\n'], ['a\n', 'YES\n'], ['abba\n', 'YES\n'], ['abca\n', 'NO\n']],
  }),
  question({
    id: 'count-vowels', title: 'Count the vowels', topic: 'Strings', shape: 'word',
    statement: 'Read a word and count the letters a, e, i, o, and u. Count both uppercase and lowercase vowels.',
    inputFormat: 'One line containing a word with no spaces.',
    outputFormat: 'Print the number of vowels as one integer.',
    constraints: ['1 ≤ word length ≤ 100', 'The word contains only English letters.'],
    cases: [['hello\n', '2\n'], ['AEIOU\n', '5\n'], ['rhythm\n', '0\n'], ['Education\n', '5\n'], ['aAeE\n', '4\n']],
  }),
  question({
    id: 'sum-digits', title: 'Sum of digits', topic: 'Arithmetic', shape: 'integer',
    statement: 'Read a non-negative integer and print the sum of its decimal digits.',
    inputFormat: 'One line containing a non-negative integer n.',
    outputFormat: 'Print the sum of the digits as one integer.',
    constraints: ['0 ≤ n ≤ 1,000,000,000'],
    cases: [['1234\n', '10\n'], ['0\n', '0\n'], ['9\n', '9\n'], ['1000000000\n', '1\n'], ['99999\n', '45\n']],
  }),
  question({
    id: 'array-sum', title: 'Sum of an array', topic: 'Arrays', shape: 'array',
    statement: 'Read a list of integers and print the sum of its values.',
    inputFormat: 'The first line contains n. The second line contains n space-separated integers.',
    outputFormat: 'Print the sum of all array values as one integer.',
    constraints: ['1 ≤ n ≤ 20', '-1,000 ≤ each value ≤ 1,000'],
    cases: [['4\n1 2 3 4\n', '10\n'], ['3\n-5 2 1\n', '-2\n'], ['1\n0\n', '0\n'], ['5\n-2 -1 0 1 2\n', '0\n'], ['4\n1000 1000 1000 1000\n', '4000\n']],
  }),
]);

export function getCodeMatrixPracticeQuestion(id) {
  return CODE_MATRIX_PRACTICE_QUESTIONS.find((item) => item.id === id) || null;
}

// Preserve meaningful leading/interior whitespace and letter case.
export function normalizePracticeOutput(text) {
  return String(text ?? '').replace(/\r\n?/gu, '\n').split('\n')
    .map((line) => line.replace(/[ \t]+$/gu, '')).join('\n').trimEnd();
}

export function practiceResultMatchesDraft(result, activeQuestion, language, code) {
  return Boolean(result && activeQuestion && result.questionId === activeQuestion.id
    && result.version === activeQuestion.version && result.language === language && result.code === code);
}

export function isSuccessfulPracticeResult(result, activeQuestion) {
  return Boolean(activeQuestion && result?.status === 'success'
    && result.questionId === activeQuestion.id && result.version === activeQuestion.version
    && activeQuestion.supportedLanguages.includes(result.language)
    && result.total === activeQuestion.testCases.length && result.passed === result.total
    && Array.isArray(result.cases) && result.cases.length === activeQuestion.testCases.length
    && activeQuestion.testCases.every((testCase, index) => {
      const actual = result.cases[index];
      return actual?.id === testCase.id && actual.status === 'success' && actual.passed === true
        && normalizePracticeOutput(actual.stdout) === normalizePracticeOutput(testCase.expectedOutput);
    }));
}

function emptyPracticeState() { return { selectedQuestionId: '', selectedLanguage: '', drafts: {}, solved: {} }; }

export function normalizeCodeMatrixPracticeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const drafts = {};
  const solved = {};
  for (const item of CODE_MATRIX_PRACTICE_QUESTIONS) {
    const key = `${item.id}:v${item.version}`;
    const savedDrafts = source.drafts?.[key];
    for (const language of item.supportedLanguages) {
      if (typeof savedDrafts?.[language] !== 'string') continue;
      drafts[key] ??= {};
      drafts[key][language] = savedDrafts[language].slice(0, CODE_MATRIX_MAX_CODE);
    }
    if (source.solved?.[key] === true) solved[key] = true;
  }
  return {
    selectedQuestionId: getCodeMatrixPracticeQuestion(source.selectedQuestionId)?.id || '',
    selectedLanguage: CODE_MATRIX_PRACTICE_LANGUAGES.includes(source.selectedLanguage) ? source.selectedLanguage : '',
    drafts,
    solved,
  };
}

export function readCodeMatrixPracticeState(profileId, storage) {
  const key = academicProfileStorageKey(profileId, 'code-matrix-practice-v1');
  if (!key) return emptyPracticeState();
  try {
    storage ??= globalThis.localStorage;
    const value = storage?.getItem(key);
    return value ? normalizeCodeMatrixPracticeState(JSON.parse(value)) : emptyPracticeState();
  } catch { return emptyPracticeState(); }
}

export function writeCodeMatrixPracticeState(profileId, value, storage) {
  const key = academicProfileStorageKey(profileId, 'code-matrix-practice-v1');
  if (!key) return false;
  try {
    storage ??= globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(normalizeCodeMatrixPracticeState(value)));
    return true;
  } catch { return false; }
}

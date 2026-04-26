import ansiRegex from 'ansi-regex';

export function stripAnsi(str: string): string {
  return str
    .replace(ansiRegex(), '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

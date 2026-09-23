import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(alphabet, 12);

export const uid = (prefix = ''): string => (prefix ? `${prefix}_${generate()}` : generate());

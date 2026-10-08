import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function readPrivate(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 2_000_000) throw new Error('private_file_required');
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}
function privateDirectory(file) {
  const directory = path.dirname(path.resolve(file));
  fs.mkdirSync(directory, { mode: 0o700, recursive: true });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('state_directory_must_be_private_0700');
  return directory;
}
export async function withStateLock(file, action) {
  privateDirectory(file);
  const lock = `${file}.lock`;
  const fd = fs.openSync(lock, 'wx', 0o600);
  try { return await action(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export function saveState(file, value) {
  const directory = privateDirectory(file);
  const temp = path.join(directory, `.state-${randomUUID()}`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  const dirFd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
}

export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2WQAAAAASUVORK5CYII=",
  "base64",
);
export const pngVersion = (tag: string) => Buffer.concat([tinyPng, Buffer.from(tag)]);

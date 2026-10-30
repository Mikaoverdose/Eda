import type { InitRepositoryOptions } from "@shared/repository/repository";

export function initFiles(
  options: InitRepositoryOptions,
  name: string,
  author: string,
): Record<string, string> {
  const files: Record<string, string> = {};

  if (options.readme) files["README.md"] = `# ${name}\n`;
  if (options.ignore === "node")
    files[".gitignore"] = "node_modules/\ndist/\ncoverage/\n.env\n.env.local\n";
  if (options.ignore === "python")
    files[".gitignore"] = "__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.pytest_cache/\n.env\n";

  if (options.license === "MIT")
    files["LICENSE"] = `MIT License

Copyright (c) ${new Date().getFullYear()} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

  return files;
}

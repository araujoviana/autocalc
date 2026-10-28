export function bundleVersion(args: string[]): string | undefined {
  if (args.length > 2 || (args.length === 2 && args[0] !== "--version") || (args.length === 1 && args[0] === "--version")) throw new Error("Use --version VERSION or provide a version as the only argument");
  const version = args[0] === "--version" ? args[1] : args[0];
  if (version !== undefined && !/^\d+(?:\.\d+)*$/.test(version)) throw new Error("Invalid bundle version");
  return version;
}

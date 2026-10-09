declare module 'pdf-parse' {
  function parse(data: Buffer): Promise<{ text: string }>;
  export = parse;
}

/** "Ada", "Ada and Bo", "Ada, Bo, and Cy" — one card can name several people. */
export function formatNameList(names: string[]): string {
  return new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(names);
}

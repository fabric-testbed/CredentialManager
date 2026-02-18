export default function toLocaleTime(utcTime: string): string {
  const date = new Date(utcTime.replace(" ", "T"));
  return date.toLocaleString();
}
